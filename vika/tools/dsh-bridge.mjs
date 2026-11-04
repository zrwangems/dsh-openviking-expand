#!/usr/bin/env node
/**
 * dsh-bridge：Vika 容器内操控 DSH 会话的命令行。
 *
 * 零依赖、Node 18+；默认向 http://host.docker.internal:3742 的 vika 组件桥发请求。
 * 配置查找顺序：命令行参数 > 环境变量 > 配置文件（/root/.dsh-bridge.json）> 默认值。
 *
 * 命令与宿主 r桥（host/vika/runtime-bridge.mjs）的 /v1/engine/* 一一对应；
 * 这里只保留运行期桥真正实现的接口，避免模型把命令发到不存在的端点。
 *
 * 命令：
 *   health
 *   sa-mode on|off
 *   sa-state
 *   sa-trigger (--text | --text-file | --stdin) [--source feishu|github|manual] [--thread K] [--actor ID] [--id ID] [--strength explicit|normal]
 *   sa-evaluating
 *   sa-decide --id ID [--kind accept|ignore] [--title T] [--scope S] [--name N] [--reason R] [--workspace DIR [--workspace-new]]
 *   sa-tickets [--state open|working|blocked|ended|all]
 *   sa-ticket --id TICKET
 *   sa-wait-ticket --id TICKET [--timeout SEC] [--interval MS]
 *   sa-decisions
 *   sa-threads
 *   sa-workers
 *   sa-workspaces
 *   sa-fs [--path DIR]
 *   sa-workspace-add --path DIR
 *   sa-repos
 *   sa-settings
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const VERSION = "0.2.2";
const DEFAULT_URL = "http://host.docker.internal:3742";
const CONFIG_CANDIDATES = [
  process.env.DSH_BRIDGE_CONFIG,
  "/root/.vika-tools.json",
  "/root/.dsh-bridge.json",
  "/workspace/.dsh-bridge.json",
  path.join(os.homedir(), ".dsh-bridge.json"),
].filter(Boolean);

const HELP = `dsh-bridge ${VERSION}

用法：
  dsh-bridge health
  dsh-bridge sa-mode on|off          # /dshin 进入、/dshout 退出 router 模式
  dsh-bridge sa-state
  dsh-bridge sa-trigger (--text <文本> | --text-file <文件> | --stdin)
                        [--source feishu|github|manual] [--thread <话题键>] [--actor <id>]
                        [--id <trigger-id>] [--strength explicit|normal]
  dsh-bridge sa-evaluating
  dsh-bridge sa-decide --id <trigger-id> [--kind accept|ignore]
                       [--title <标题>] [--scope <范围>] [--name <工单短名>]
                       [--reason <原因>] [--workspace <已有工作区路径> [--workspace-new]]
  dsh-bridge sa-tickets [--state open|working|blocked|ended|all]
  dsh-bridge sa-ticket --id <工单ID>
  dsh-bridge sa-wait-ticket --id <工单ID> [--timeout <秒>] [--interval <毫秒>]
  dsh-bridge sa-decisions
  dsh-bridge sa-threads
  dsh-bridge sa-workers
  dsh-bridge sa-workspaces
  dsh-bridge sa-fs [--path <目录>]
  dsh-bridge sa-workspace-add --path <目录>
  dsh-bridge sa-repos
  dsh-bridge sa-settings

全局参数：
  --url <地址>     桥地址，默认 ${DEFAULT_URL}（也认 DSH_BRIDGE_URL）
  --token <token>  桥 token（也认 DSH_BRIDGE_TOKEN 或配置文件）
  --config <文件>  配置文件路径（默认 /root/.dsh-bridge.json）
  --help           显示本帮助

输出：成功时向 stdout 打印 JSON（{"ok":true,...}）；失败时打印 {"ok":false,"error":...} 并以非零码退出。`;

function parseArgs(argv) {
  const options = { _: [] };
  const takeValue = name => {
    const index = argv.indexOf(name);
    if (index === -1) return undefined;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw usageError(`${name} 缺参数`);
    argv.splice(index, 2);
    return value;
  };
  const takeAll = name => {
    const values = [];
    for (;;) {
      const value = takeValue(name);
      if (value === undefined) break;
      values.push(value);
    }
    return values;
  };
  const flags = new Set();
  for (const flag of ["--help", "--stdin", "--workspace-new"]) {
    const index = argv.indexOf(flag);
    if (index !== -1) {
      flags.add(flag);
      argv.splice(index, 1);
    }
  }
  options.help = flags.has("--help");
  options.stdin = flags.has("--stdin");
  options.workspaceNew = flags.has("--workspace-new");
  for (const name of ["--url", "--token", "--config", "--text", "--text-file", "--source", "--actor", "--id", "--kind", "--title", "--scope", "--name", "--reason", "--workspace", "--path", "--state", "--timeout", "--interval"]) {
    const key = name.slice(2).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    const value = takeValue(name);
    if (value !== undefined) options[key] = value;
  }
  options.thread = takeAll("--thread");
  options._ = argv;
  return options;
}

function usageError(message) {
  const error = new Error(message);
  error.code = "usage";
  return error;
}

function readConfigFile(file) {
  const candidates = file ? [file] : CONFIG_CANDIDATES;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (parsed && typeof parsed === "object") return parsed;
    } catch {}
  }
  return {};
}

function resolveBridge(options) {
  const file = readConfigFile(options.config);
  const bridge = file.bridge !== null && typeof file.bridge === "object" ? file.bridge : {};
  const url = String(options.url || process.env.DSH_BRIDGE_URL || bridge.url || file.url || DEFAULT_URL).replace(/\/+$/, "");
  const token = String(options.token || process.env.DSH_BRIDGE_TOKEN || bridge.token || file.token || "");
  if (!token) throw usageError("缺少桥 token：用 --token、DSH_BRIDGE_TOKEN 或配置文件提供");
  const timeoutMs = Number(file.timeoutMs) > 0 ? Number(file.timeoutMs) : 60_000;
  return { url, token, timeoutMs };
}

function readTextInput(options, textKey, fileKey) {
  if (options[fileKey]) return fs.readFileSync(options[fileKey], "utf8");
  if (options.stdin) return fs.readFileSync(0, "utf8");
  return options[textKey] ?? "";
}

async function request(bridge, method, pathname, body) {
  const response = await fetch(`${bridge.url}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${bridge.token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(bridge.timeoutMs),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`桥返回了非 JSON 响应（HTTP ${response.status}）: ${text.slice(0, 200)}`);
  }
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload?.error?.message || `HTTP ${response.status}`);
    error.code = payload?.error?.code || `http_${response.status}`;
    error.status = response.status;
    throw error;
  }
  return payload;
}

function print(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  const argv = process.argv.slice(2);
  const options = parseArgs(argv);
  if (options.help || options._.length === 0) {
    process.stdout.write(`${HELP}\n`);
    return options._.length === 0 && !options.help ? 2 : 0;
  }
  const command = options._[0];
  const bridge = resolveBridge(options);
  switch (command) {
    case "health": {
      print(await request(bridge, "GET", "/v1/health"));
      return 0;
    }
    case "sa-mode": {
      const mode = String(options._[1] || "").trim();
      if (mode !== "on" && mode !== "off") throw usageError("sa-mode 需要 on 或 off");
      print(await request(bridge, "POST", "/v1/engine/mode", { enabled: mode === "on" }));
      return 0;
    }
    case "sa-state": {
      print(await request(bridge, "GET", "/v1/engine/state"));
      return 0;
    }
    case "sa-trigger": {
      const text = readTextInput(options, "text", "textFile").trim();
      if (!text) throw usageError("sa-trigger 需要 --text、--text-file 或 --stdin");
      print(await request(bridge, "POST", "/v1/engine/triggers", {
        text,
        source: options.source || "feishu",
        thread: options.thread[0] || "vika",
        ...(options.actor ? { actor: options.actor } : {}),
        ...(options.id ? { id: options.id } : {}),
        ...(options.strength ? { strength: options.strength } : {}),
      }));
      return 0;
    }
    case "sa-evaluating": {
      print(await request(bridge, "GET", "/v1/engine/evaluating"));
      return 0;
    }
    case "sa-decide": {
      if (!options.id) throw usageError("sa-decide 需要 --id（trigger id）");
      const kind = options.kind || "accept";
      print(await request(bridge, "POST", "/v1/engine/decisions", {
        triggerId: options.id,
        kind,
        ...(options.title ? { title: options.title } : {}),
        ...(options.scope ? { scope: options.scope } : {}),
        ...(options.name ? { name: options.name } : {}),
        ...(options.reason ? { reason: options.reason } : {}),
        ...(options.workspace ? { workspace: options.workspace, workspaceNew: options.workspaceNew === true } : {}),
      }));
      return 0;
    }
    case "sa-tickets": {
      const query = new URLSearchParams();
      if (options.state) query.set("state", options.state);
      print(await request(bridge, "GET", `/v1/engine/tickets${query.size ? `?${query}` : ""}`));
      return 0;
    }
    case "sa-ticket": {
      if (!options.id) throw usageError("sa-ticket 需要 --id");
      print(await request(bridge, "GET", `/v1/engine/tickets/${encodeURIComponent(options.id)}`));
      return 0;
    }
    case "sa-wait-ticket": {
      if (!options.id) throw usageError("sa-wait-ticket 需要 --id");
      const timeout = Math.max(1, Math.min(180, Number(options.timeout ?? 90) || 90));
      const interval = Math.max(500, Math.min(5000, Number(options.interval ?? 2000) || 2000));
      const deadline = Date.now() + timeout * 1000;
      let latest;
      for (;;) {
        latest = await request(bridge, "GET", `/v1/engine/tickets/${encodeURIComponent(options.id)}`);
        const ticket = latest.ticket || latest;
        const assignments = Array.isArray(ticket.assignments) ? ticket.assignments : [];
        const reported = assignments.some(item => item && item.report && item.report.state !== "progress");
        if (ticket.state === "ended" || ticket.state === "blocked" || reported) break;
        if (Date.now() > deadline) break;
        await new Promise(resolve => setTimeout(resolve, interval));
      }
      print(latest);
      return 0;
    }
    case "sa-decisions": {
      print(await request(bridge, "GET", "/v1/engine/decisions"));
      return 0;
    }
    case "sa-threads": {
      print(await request(bridge, "GET", "/v1/engine/threads"));
      return 0;
    }
    case "sa-workers": {
      print(await request(bridge, "GET", "/v1/engine/workers"));
      return 0;
    }
    case "sa-workspaces": {
      print(await request(bridge, "GET", "/v1/engine/workspaces"));
      return 0;
    }
    case "sa-fs": {
      print(await request(bridge, "GET", `/v1/engine/fs?path=${encodeURIComponent(options.path || "")}`));
      return 0;
    }
    case "sa-workspace-add": {
      if (!options.path) throw usageError("sa-workspace-add 需要 --path");
      print(await request(bridge, "POST", "/v1/engine/workspaces", { path: options.path }));
      return 0;
    }
    case "sa-repos": {
      print(await request(bridge, "GET", "/v1/engine/repos"));
      return 0;
    }
    case "sa-settings": {
      if (options._.length > 1) throw usageError("sa-settings 是只读命令；修改设置请在 vika 面板的「设置」页操作");
      print(await request(bridge, "GET", "/v1/engine/settings"));
      return 0;
    }
    default:
      throw usageError(`未知命令: ${command}`);
  }
}

try {
  const code = await main();
  process.exitCode = code ?? 0;
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: { code: error?.code || "internal", message: error instanceof Error ? error.message : String(error) } }, null, 2)}\n`);
  process.exitCode = error?.code === "usage" ? 2 : 1;
}
