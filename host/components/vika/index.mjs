/**
 * vika 组件：挂载 vendored 的 vika runtime（Windows 可用）。
 *
 * 面板/引擎来自 vika/runtime（上游 Windows 适配版的构建产物），
 * 我们只做几件事：
 *  - 用插件设置里的工作区作为 orchestrator 和所有 worker 的 cwd；
 *  - 把 stateDir 放在插件自己的目录，避免污染 DSH 默认 profile；
 *  - 注册 Vika Source，并把运行时暴露给本地桥，让 Vika（容器里的 agent）作为 Router 接单/分派。
 */
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { apply as runtimeApply, Config as RuntimeConfig } from "../../../vika/runtime/lib/index.js";
import { apply as vikaSourceApply } from "../../../vika/runtime/lib/vika-watch.js";
import { VIKA_AGENT_PRESETS } from "./presets.mjs";
import { startRuntimeBridge } from "../../vika/runtime-bridge.mjs";
import { listVikaContainers, resolveContainerWorkspace } from "../../vika/container.mjs";
import { readSettingsSync, resolveVikaSettings } from "../../settings.mjs";

export const name = "openviking-expand-vika";

/** 上游 runtime 的依赖，加上 DSH settings（它可选地接管插件设置页）。 */
export const inject = [
  "agents",
  "sessionController",
  "sessionPersistence",
  "workspaceRegistry",
  "permissionPresets",
  "tools",
  "systemPrompt",
  "skills",
  "webServer",
  "llm",
  "subprocess",
  "settings",
  "agentPresets",
];

export function apply(ctx, input = {}) {
  return applyRuntime(ctx, input);
}

async function applyRuntime(ctx, input = {}) {
  const log = (level, message) => {
    try {
      const logger = ctx.logger;
      const fn = logger && (typeof logger[level] === "function" ? logger[level] : logger.info);
      if (typeof fn === "function") fn.call(logger, message);
    } catch {
      /* 日志不可用不影响启动 */
    }
  };

  // 两个 agent preset 是 vika 组件的固定输入：在挂载运行时之前注册，插件页不再出现独立组件行。
  await registerAgentPresets(ctx, log);

  const settings = readSettingsSync();
  const vk = resolveVikaSettings(settings);
  // 工作区 = Vika 容器的 /workspace 挂载源；未选择容器时只在恰好有一个运行中的 Vika 容器时自动识别。
  let workspaceDir = "";
  if (vk.containerName === "") {
    try {
      const running = (await listVikaContainers()).filter(item => item.running);
      if (running.length === 1) {
        vk.containerName = running[0].name;
        log("info", `vika: 自动识别容器 ${vk.containerName}`);
      }
    } catch (error) {
      log("warn", `vika: 自动识别容器失败: ${String(error)}`);
    }
  }
  try {
    workspaceDir = (await resolveContainerWorkspace(vk.containerName)) || "";
  } catch (error) {
    log("warn", `vika: 读取容器 /workspace 失败: ${String(error)}`);
  }
  if (workspaceDir === "") {
    log("warn", "vika: 没有可用的 Vika 容器挂载，运行时未启动；请在插件设置页选择容器后重启 DSH");
    return;
  }
  // Vika 的 Router 工作区就是容器挂载目录；worker 另选已有工作区。
  workspaceDir = path.resolve(workspaceDir).replaceAll("\\", "/");
  // 插件页触发“恢复”时运行中的状态文件可能删不掉，会留下 RESET_ON_START；下次启动前清空。
  const resetMarker = path.join(workspaceDir, ".vika", "RESET_ON_START");
  if (existsSync(resetMarker)) {
    try {
      await rm(path.join(workspaceDir, ".vika"), { recursive: true, force: true });
      log("info", "vika: 已按恢复请求清空宿主状态目录");
    } catch (error) {
      log("warn", `vika: 清空宿主状态失败: ${String(error)}`);
    }
  }
  const stateDir = path.join(workspaceDir, ".vika", "state").replaceAll("\\", "/");
  // 执行器 worker 只使用已有的 Default 工作区，不按工单创建新工作区；没有 Default 时退回 Vika 工作区。
  const workerDir = (await defaultWorkspaceDir()) || workspaceDir;
  const config = RuntimeConfig({ stateDir, workspaceDir, workerDir });

  try {
    await runtimeApply(ctx, config);
  } catch (error) {
    log("error", `vika: 挂载 runtime 失败: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    throw error;
  }

  const runtime = typeof ctx.get === "function" ? ctx.get("orchestrator") : ctx.orchestrator;
  if (runtime === undefined || runtime === null) {
    log("warn", "vika: runtime 没有出现在 ctx.orchestrator 上");
    return;
  }

  // Vika Source：面板「来源」页的状态与准入；事件仍由本地桥送入。
  try {
    vikaSourceApply(ctx);
  } catch (error) {
    log("warn", `vika: 注册 Vika Source 失败: ${String(error)}`);
  }

  // 桥 token 自动生成在状态目录里；不写工作区、不进插件设置界面。
  const token = await bridgeTokenOf(stateDir);

  const bridge = startRuntimeBridge({
    runtime,
    vika: {
      bridge: { host: vk.bridgeHost, port: vk.bridgePort },
      stateDir,
    },
    token,
    log,
  });
  try {
    const address = await bridge.start();
    log("info", `vika: 桥已启动 http://${vk.bridgeHost}:${address.port} stateDir=${stateDir} workspace=${workspaceDir} master=${runtime.masterId || "-"}`);
    ctx.effect(() => () => bridge.close(), "vika: runtime bridge");
  } catch (error) {
    log("error", `vika: 桥启动失败: ${String(error)}`);
    bridge.close();
    throw error;
  }
}

/** 注册 vika 的 worker/router preset；HMR 重载时对 duplicate 做退避重试。 */
function registerAgentPresets(ctx, log) {
  return new Promise(resolve => {
    let settled = false
    const done = () => { if (!settled) { settled = true; resolve() } }
    try {
      ctx.inject(["agentPresets"], child => {
        (async () => {
          for (const preset of VIKA_AGENT_PRESETS) {
            let attempt = 0
            for (;;) {
              try {
                const handle = await child.agentPresets.register(preset)
                child.effect(() => async () => {
                  try { await handle?.dispose?.() } catch { /* 服务已整体释放 */ }
                }, `vika: preset ${preset.id}`)
                break
              } catch (error) {
                if (/Duplicate agent preset/.test(String(error)) && attempt < 30) {
                  attempt += 1
                  await new Promise(wait => setTimeout(wait, 100))
                  continue
                }
                log("warn", `vika: agent preset ${preset.id} 注册失败: ${String(error)}`)
                break
              }
            }
          }
          done()
        })().catch(error => { log("warn", `vika: agent preset 注册异常: ${String(error)}`); done() })
      })
    } catch (error) {
      log("warn", `vika: agentPresets 服务不可用: ${String(error)}`)
      done()
    }
    // 服务长期未就绪时不要卡住整个组件；运行时会因缺少 preset 报错，日志里能看到。
    setTimeout(done, 5000).unref?.()
  })
}

/** 从 DSH 工作区存储里找已有的 Default 工作区路径；找不到返回空。 */
async function defaultWorkspaceDir() {
  try {
    const home = process.env.DSH_HOME?.trim() || path.join(os.homedir(), ".dsh");
    const file = path.join(home, "storages", "workspace.json");
    const data = JSON.parse(await readFile(file, "utf8"));
    const table = data?.tables?.workspaces;
    if (table && typeof table === "object") {
      for (const value of Object.values(table)) {
        if (value && value.title === "Default" && typeof value.path === "string" && value.path !== "") return value.path;
      }
    }
  } catch { /* 没有存储或格式不同就退回 Vika 工作区 */ }
  return "";
}

/** 桥 token 持久化在状态目录（<workspace>/.vika/state/bridge.token）。 */
async function bridgeTokenOf(dir) {
  const file = path.join(dir, "bridge.token");
  try {
    const text = (await readFile(file, "utf8")).trim();
    if (text !== "") return text;
  } catch { /* 首次启动 */ }
  const token = randomBytes(24).toString("base64url");
  await mkdir(dir, { recursive: true });
  await writeFile(file, `${token}
`, "utf8");
  return token;
}
