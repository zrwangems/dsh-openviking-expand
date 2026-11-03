/**
 * vika 原生面板的浏览器同源 API（/openviking-vika/*）。
 *
 * 浏览器不能直连 3742 桥（Bearer token + 不同源），所以由宿主把面板需要的
 * 引擎操作再暴露一份同源、经 DSH 浏览器信任校验的 JSON 接口。
 *
 * 面板按页取数：overview / sources / threads / decisions / tickets / settings /
 * search 各自独立；动作走 POST/PUT。旧的 /state 保留兼容，不再作为主数据源。
 */
import { VikaError } from "./controller.mjs";
import {
  decisionList,
  decisionRow,
  overviewView,
  searchView,
  settingsView,
  sourceRows,
  threadList,
  threadView,
  ticketList,
  ticketView,
  triggerRow,
} from "./views.mjs";

const PREFIX = "/openviking-vika";

function sendJson(res, status, payload) {
  if (res.headersSent) return;
  const body = Buffer.from(`${JSON.stringify(payload)}\n`, "utf8");
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

async function readBody(req, limit = 32 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new VikaError("bad_request", "请求体过大", 413);
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (text === "") return {};
  try {
    const parsed = JSON.parse(text);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new VikaError("bad_request", "请求体不是合法 JSON", 400);
  }
}

/**
 * 创建面板 API 处理器。
 *
 * @param options `{getEngine, getRuntime, fence}`；getEngine 返回已初始化的引擎，
 * getRuntime 返回工作区/桥/状态目录等只读部署信息。
 */
export function createVikaPanelApi({ getEngine, getRuntime, fence }) {
  return async function handler(req, res) {
    let allowed = true;
    try {
      allowed = fence ? Boolean(fence(req)) : true;
    } catch {
      allowed = false;
    }
    if (!allowed) {
      sendJson(res, 403, { ok: false, error: { code: "forbidden", message: "forbidden" } });
      return;
    }
    const url = new URL(req.url || "/", "http://dsh.internal");
    const path = url.pathname.slice(PREFIX.length) || "/";
    const method = (req.method || "GET").toUpperCase();
    try {
      const engine = await getEngine();
      if (engine === null || engine === undefined) throw new VikaError("not_found", "原生引擎未就绪", 503);
      const runtime = typeof getRuntime === "function" ? getRuntime() : {};
      const body = method === "GET" ? {} : await readBody(req);
      const result = await dispatch(engine, runtime, path, method, url, body);
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      const status = typeof error?.status === "number" ? error.status : 500;
      sendJson(res, status, {
        ok: false,
        error: { code: typeof error?.code === "string" ? error.code : "internal", message: error instanceof Error ? error.message : String(error) },
      });
    }
  };
}

async function dispatch(engine, runtime, path, method, url, body) {
  const state = engine.state;
  if (path === "/state" && method === "GET") {
    return {
      overview: overviewView(state),
      settings: settingsView(state, runtime),
      repos: state.repos,
      workers: engine.listWorkers().slice(0, 50),
      tickets: engine.listTickets({ state: "all" }).slice(0, 50),
      threads: engine.listThreads().slice(0, 50),
      assignments: state.assignments.slice(-100),
      triggers: engine.listTriggers({ state: "all" }).slice(0, 100),
      decisions: engine.listDecisions().slice(0, 50),
      issues: engine.issues(),
    };
  }
  if (path === "/runtime" && method === "GET") {
    return runtime;
  }
  if (path === "/overview" && method === "GET") {
    return overviewView(state);
  }
  if (path === "/issues" && method === "GET") {
    return engine.issues();
  }
  if (path === "/sources" && method === "GET") {
    return { sources: sourceRows(state), repos: state.repos };
  }
  if (path === "/repos" && method === "GET") {
    return state.repos;
  }
  if (path === "/repos" && method === "POST") {
    return engine.addRepo(body);
  }
  if (path === "/repos/remove" && method === "POST") {
    return engine.removeRepo(String(body.name || ""));
  }
  if (path === "/threads" && method === "GET") {
    return { items: threadList(state, url.searchParams.get("filter") || "all") };
  }
  const unsubscribeMatch = /^\/threads\/(.+)\/unsubscribe$/.exec(path);
  if (unsubscribeMatch && method === "POST") {
    const key = decodeURIComponent(unsubscribeMatch[1]);
    const result = await engine.unsubscribeThread(key);
    return { removed: result.removed, thread: threadView(state, key) };
  }
  const threadMatch = /^\/threads\/(.+)$/.exec(path);
  if (threadMatch && method === "GET") {
    const key = decodeURIComponent(threadMatch[1]);
    const view = threadView(state, key);
    if (view === null) throw new VikaError("not_found", `线程不存在：${key}`, 404);
    return view;
  }
  if (path === "/decisions" && method === "GET") {
    return decisionList(state, {
      filter: url.searchParams.get("filter") || "work",
      window: url.searchParams.get("window") || "",
      limit: Number(url.searchParams.get("limit") || 30) || 30,
    });
  }
  if (path === "/decisions" && method === "POST") {
    const result = await engine.decide(body.triggerId, { kind: body.kind, reason: body.reason, actor: body.actor });
    return { ...result, decision: result.decision !== undefined ? result.decision : null };
  }
  if (path === "/tickets" && method === "GET") {
    return ticketList(state, {
      filter: url.searchParams.get("filter") || "open",
      limit: Number(url.searchParams.get("limit") || 30) || 30,
    });
  }
  const ticketActionMatch = /^\/tickets\/([A-Za-z0-9._:-]+)\/(retry|stop)$/.exec(path);
  if (ticketActionMatch && method === "POST") {
    const id = ticketActionMatch[1];
    if (ticketActionMatch[2] === "retry") {
      const result = await engine.retryTicket(id);
      return { assignment: result.assignment, ticket: ticketView(state, id) };
    }
    const result = await engine.stopTicket(id);
    return { stopped: result.stopped, ticket: ticketView(state, id) };
  }
  const ticketMatch = /^\/tickets\/([A-Za-z0-9._:-]+)$/.exec(path);
  if (ticketMatch && method === "GET") {
    const view = ticketView(state, ticketMatch[1]);
    if (view === null) throw new VikaError("not_found", `工单不存在：${ticketMatch[1]}`, 404);
    return view;
  }
  if (path === "/triggers" && method === "GET") {
    return engine.listTriggers({ state: url.searchParams.get("state") || "all" });
  }
  if (path === "/triggers" && method === "POST") {
    return engine.receiveTrigger(body);
  }
  const requeueMatch = /^\/triggers\/([A-Za-z0-9._:-]+)\/requeue$/.exec(path);
  if (requeueMatch && method === "POST") {
    const result = await engine.requeueTrigger(requeueMatch[1]);
    return { requeued: result.requeued, trigger: triggerRow(result.trigger) };
  }
  if (path === "/reports" && method === "POST") {
    return engine.report(body.assignmentId, { summary: body.summary, state: body.state });
  }
  if (path === "/pause" && method === "POST") {
    return engine.setPaused(body.paused === true);
  }
  if (path === "/stop" && method === "POST") {
    return engine.stopWorker(String(body.sessionId || ""));
  }
  if (path === "/workers" && method === "GET") {
    return engine.listWorkers();
  }
  if (path === "/batch" && method === "GET") {
    return engine.batchPending();
  }
  if (path === "/settings" && method === "GET") {
    return settingsView(state, runtime);
  }
  const settingsMatch = /^\/settings\/([A-Za-z]+)$/.exec(path);
  if (settingsMatch && method === "PUT") {
    const block = await engine.updateSettings(settingsMatch[1], body.value, body.revision);
    return { block: settingsMatch[1], settings: settingsView(state, runtime), value: block.value, revision: block.revision };
  }
  if (path === "/search" && method === "GET") {
    return searchView(state, url.searchParams.get("q") || "");
  }
  throw new VikaError("not_found", `未知面板接口：${method} ${path}`, 404);
}

export { PREFIX as VIKA_PANEL_PREFIX };
