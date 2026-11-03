/**
 * vika 原生 vika 的宿主侧装配。
 *
 * 把 native 引擎（host/vika/engine）接到 DSH：
 *  - Router = Vika（容器里的 agent，通过桥调用引擎；插件不另开 router 会话）；
 *  - Worker = 一个 DSH 物理 session（由 controller 创建，出现在的会话列表里）；
 *  - 线程订阅直通：同一 thread 的后续事件由引擎直接投递给订阅 worker；
 *  - 完成判定：worker 会话空闲（agent/status=idle）且已产生助手文本时自动汇报。
 *
 * 该文件不复制原型代码，只使用 DSH 服务与本地引擎。
 */
import path from "node:path";
import { randomUUID } from "node:crypto";
import { VikaEngine } from "./engine/index.mjs";
import { createVikaPanelApi, VIKA_PANEL_PREFIX } from "./panel-api.mjs";

/** worker 的任务说明：只做本工单，不对外发消息。 */
const WORKER_HEADER = [
  "【Vika 工单】",
  "你是 Vika 派出的 DSH 执行会话（worker）。只完成下面这张工单，不要向人提问。",
  "约束：",
  "- 在工作目录内完成任务；需要上下文时先读代码/文档。",
  "- 不要 git push、不要用 gh 发评论或开 PR、不要对外发消息（发布由 Vika 负责）。",
  "- 结束前用简短中文汇报：做了什么、改了哪些文件、验证结果、遗留问题。",
  "",
].join("\n");

function assistantTextOf(event) {
  const content = event?.data?.message?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(block => block && block.type === "text" && typeof block.text === "string")
    .map(block => block.text)
    .join("\n")
    .trim();
}

function workerPrompt(ticket, trigger, header = WORKER_HEADER) {
  const parts = [header || WORKER_HEADER];
  if (ticket?.repo) parts.push(`仓库：${ticket.repo}`);
  if (ticket?.thread) parts.push(`线程：${ticket.thread}`);
  if (ticket?.title) parts.push(`工单：${ticket.title}`);
  if (trigger?.text) parts.push("", "事件原文：", trigger.text);
  return parts.join("\n");
}

/**
 * 创建并装配原生引擎。
 *
 * @param options `{ctx, vika, controller, log}`。
 * @returns `{engine, dispose}`。
 */
export function mountNativeEngine({ ctx, vika, controller, log }) {
  const stateDir = path.join(vika.stateDir, "engine");
  const workers = controller.registry;
  const tracked = new Map(); // sessionId -> {assignmentId, ticketId, summary, reported}
  const disposers = [];

  const record = sessionId => tracked.get(sessionId);
  const remember = (sessionId, assignment) => {
    tracked.set(sessionId, {
      assignmentId: assignment.id,
      ticketId: assignment.ticketId,
      summary: "",
      reported: false,
    });
  };

  const adapter = {
    async start({ assignment, ticket, trigger }) {
      const created = await controller.createSession({
        title: `[vika] ${ticket?.title || "工单"}`,
        repo: ticket?.repo || "",
        prompt: workerPrompt(ticket, trigger, engine.settings.prompts?.value?.workerHeader),
        unbounded: true,
        requestId: `vika-engine-${assignment.id}`,
      });
      const sessionId = created?.sessionId || "";
      remember(sessionId, assignment);
      return { sessionId };
    },
    async send({ sessionId, text }) {
      await controller.sendMessage({
        sessionId,
        text: `【Vika 线程更新】\n${text}`,
        requestId: `vika-engine-${randomUUID()}`,
      });
      return { ok: true };
    },
    async stop(sessionId) {
      try {
        await controller.cancelSession(sessionId);
      } catch (error) {
        log("warn", `vika native: 取消 worker 失败: ${String(error)}`);
      }
    },
  };

  const engine = new VikaEngine({ stateDir, adapter });

  const onEvent = (session, event) => {
    const item = record(session?.id);
    if (!item || item.reported) return;
    if (event?.type === "assistant/message") {
      const text = assistantTextOf(event);
      if (text !== "") item.summary = text;
    }
  };
  const onStatus = payload => {
    const sessionId = payload?.agent?.id;
    const item = record(sessionId);
    if (!item || item.reported) return;
    const status = typeof payload?.agent?.status === "string" ? payload.agent.status : "";
    if (status !== "idle" || item.summary === "") return;
    item.reported = true;
    engine
      .report(item.assignmentId, { summary: item.summary, state: "ready", sessionId })
      .catch(error => log("warn", `vika native: 自动汇报失败: ${String(error)}`));
  };
  disposers.push(ctx.on("session/event", onEvent), ctx.on("agent/status", onStatus));

  // 供桥与面板读取。
  controller.engine = engine;
  controller.native = { stateDir, tracked, adapterStop: sessionId => adapter.stop(sessionId) };

  const ready = engine.init();

  // 浏览器同源面板 API：/openviking-vika/*，经 DSH 浏览器信任校验。
  const runtime = {
    stateDir: vika.stateDir,
    workspace: vika.workers.defaultCwd,
    reposRoot: vika.workers.reposRoot,
    tasksRoot: vika.workers.tasksRoot,
    bridge: { host: vika.bridge.host, port: vika.bridge.port },
    platform: process.platform,
    node: process.version,
  };
  ctx.inject(["webServer", "connection"], webCtx => {
    const fence = req => {
      try { return webCtx.connection.requestRejection(req) === undefined } catch { return false }
    };
    const handler = createVikaPanelApi({
      fence,
      getEngine: async () => { await ready; return engine },
      getRuntime: () => runtime,
    });
    try {
      disposers.push(webCtx.effect(
        () => webCtx.webServer.register({ kind: "prefix", path: VIKA_PANEL_PREFIX, handler }),
        "vika: panel api",
      ));
    } catch (error) {
      log("warn", `vika native: 面板路由注册失败: ${String(error)}`);
    }
  });

  ready.then(() => {
    log("info", `vika native: engine ready stateDir=${stateDir} repos=${engine.state.repos.length}`);
    // Watchdog：每 60 秒检查一次无心跳 worker（30 分钟阈值），标记 stale 并阻塞工单。
    const watchdog = setInterval(() => {
      engine.sweep({ staleMs: 30 * 60 * 1000 }).catch(error => log("warn", `vika native: watchdog 失败: ${String(error)}`));
    }, 60_000);
    watchdog.unref?.();
    disposers.push(() => clearInterval(watchdog));
    return engine;
  });

  return {
    engine,
    ready,
    dispose() {
      for (const dispose of disposers.splice(0)) {
        try {
          dispose();
        } catch {
          /* 服务已释放 */
        }
      }
      tracked.clear();
    },
  };
}
