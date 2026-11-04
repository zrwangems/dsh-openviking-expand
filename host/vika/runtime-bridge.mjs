/**
 * 把 vendored vika 运行时暴露给 Vika 容器的本地桥（127.0.0.1）。
 *
 * Vika 是 Router：它通过 /v1/engine/* 送入事件、读取待评估、提交接单/忽略决定；
 * 运行时负责 Thread/Ticket/Assignment/Worker 和面板。桥只绑回环、Bearer token。
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ticketStage } from "./ticket-stage.mjs";

/** Browse directories for the new-workspace picker. */
function browseDirectories(input) {
  const target = String(input || "").trim();
  if (target === "") {
    if (process.platform === "win32") {
      const roots = [];
      for (const letter of "CDEFGHIJKLMNOPQRSTUVWXYZ") {
        if (fs.existsSync(`${letter}:\\`)) roots.push({ name: `${letter}:\\`, path: `${letter}:\\` });
      }
      return { path: "", parent: "", dirs: roots };
    }
    return { path: "/", parent: "", dirs: [{ name: "/", path: "/" }] };
  }
  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) throw new BridgeError("bad_request", `目录不存在：${resolved}`);
  const dirs = [];
  for (const name of fs.readdirSync(resolved)) {
    if (name.startsWith(".")) continue;
    const child = path.join(resolved, name);
    try { if (fs.statSync(child).isDirectory()) dirs.push({ name, path: child }); } catch { /* skip */ }
  }
  return { path: resolved, parent: path.dirname(resolved) === resolved ? "" : path.dirname(resolved), dirs };
}

/** Create a confirmed new workspace directory on the host. */
function createWorkspaceDirectory(input) {
  const target = String(input || "").trim();
  if (target === "") throw new BridgeError("bad_request", "path 不能为空");
  const resolved = path.resolve(target);
  fs.mkdirSync(resolved, { recursive: true });
  if (!fs.statSync(resolved).isDirectory()) throw new BridgeError("bad_request", `不是目录：${resolved}`);
  return { path: resolved };
}

/** 读取 DSH 已有的工作区（路径/标题），供 Vika 选择 worker 工作区。 */
function hostWorkspaces() {
  try {
    const home = process.env.DSH_HOME?.trim() || path.join(os.homedir(), ".dsh");
    const data = JSON.parse(fs.readFileSync(path.join(home, "storages", "workspace.json"), "utf8"));
    const table = data?.tables?.workspaces;
    if (table && typeof table === "object") {
      return Object.values(table).filter(item => item && typeof item.path === "string" && item.path !== "")
        .map(item => ({ title: String(item.title || ""), path: path.resolve(item.path).replaceAll("\\", "/") }));
    }
  } catch { /* 没有存储就返回空 */ }
  return [];
}

/** Accept a user-confirmed new workspace only after its directory exists. */
function requireConfirmedWorkspace(input) {
  const resolved = path.resolve(String(input || "").trim());
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new BridgeError("bad_request", `工作区目录还不存在：${resolved}；先确认目录并创建`, 400);
  }
  return resolved;
}

/** 校验 Vika 传入的工作区必须是 DSH 已存在的工作区，禁止隐式新建。 */
function requireExistingWorkspace(input) {
  const requested = String(input || "").trim();
  if (requested === "") return "";
  const workspaces = hostWorkspaces();
  const normalized = path.resolve(requested).replaceAll("\\", "/").toLowerCase();
  const found = workspaces.find(item => item.path.toLowerCase() === normalized || (item.title !== "" && item.title === requested));
  if (found === undefined) {
    throw new BridgeError("bad_request", `工作区不存在：${requested}；只能使用已有工作区，新工作区需用户确认后先在 DSH 中创建`, 400);
  }
  return found.path;
}

class BridgeError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

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

async function readBody(req, limit = 256 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new BridgeError("bad_request", "请求体过大", 413);
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (text === "") return {};
  try {
    const parsed = JSON.parse(text);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new BridgeError("bad_request", "请求体不是合法 JSON", 400);
  }
}

function firstLine(text, limit = 160) {
  const value = String(text === undefined || text === null ? "" : text).replace(/\r\n?/g, "\n");
  for (const line of value.split("\n")) {
    const trimmed = line.trim();
    if (trimmed !== "") return trimmed.length > limit ? `${trimmed.slice(0, limit)}…` : trimmed;
  }
  return "Vika 任务";
}

function sourceTicketState(ticket) {
  if (ticket.ended) return "ended";
  const stage = ticketStage(ticket);
  if (stage.stage === "person") return "blocked";
  if (stage.stage === "working") return "working";
  return "open";
}

function ticketView(runtime, ticket) {
  const trigger = runtime.store.triggers.get(ticket.origin.triggerId);
  const assignment = Array.isArray(ticket.assignments) && ticket.assignments.length > 0
    ? ticket.assignments[ticket.assignments.length - 1]
    : null;
  // Prefer the worker's own report (it carries the summary); fall back to the ticket's end outcome.
  const report = assignment?.report || (ticket.ended
    ? { state: ticket.ended.outcome || "ended", summary: ticket.ended.reason || "", at: ticket.ended.at }
    : null);
  return {
    id: ticket.id,
    title: ticket.title,
    state: sourceTicketState(ticket),
    rawState: ticket.ended ? "ended" : ticketStage(ticket).stage,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    thread: trigger?.threads?.[0] ? `${trigger.threads[0].source}:${trigger.threads[0].id}` : "",
    repo: trigger?.meta?.repo || "",
    actor: trigger?.actor?.id || "",
    report: report !== null ? report : null,
    reports: report !== null ? report : null,
    assignments: Array.isArray(ticket.assignments) ? ticket.assignments : [],
    sessionId: `worker-${ticket.id}`,
  };
}

function normalizeSettings(settings) {
  return {
    policy: settings.policy,
    eval: settings.eval,
    executor: settings.executor,
    channels: settings.channels,
    prompts: settings.prompts,
  };
}

function tokenMatch(token, given) {
  if (!token || !given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(token).digest();
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * 启动桥；返回 `{server, close, address, token}`。
 *
 * @param options `{runtime, vika, token, log}`。
 */
export function startRuntimeBridge({ runtime, vika, token, log }) {
  const modeFile = path.join(vika.stateDir, "router-mode.json");
  let routerMode = false;
  try { routerMode = JSON.parse(fs.readFileSync(modeFile, "utf8"))?.enabled === true; } catch { /* 默认关闭 */ }
  const setRouterMode = enabled => {
    routerMode = enabled;
    fs.mkdirSync(path.dirname(modeFile), { recursive: true });
    fs.writeFileSync(modeFile, `${JSON.stringify({ enabled, at: new Date().toISOString() })}
`, "utf8");
    return { enabled };
  };
  const auditFile = path.join(vika.stateDir, "audit.jsonl");
  const audit = entry => {
    try {
      fs.mkdirSync(path.dirname(auditFile), { recursive: true });
      fs.appendFileSync(auditFile, `${JSON.stringify(entry)}\n`, "utf8");
    } catch {
      /* 审计失败不影响业务 */
    }
  };
  const server = http.createServer((req, res) => {
    const startedAt = Date.now();
    handle(req, res).catch(error => {
      log("warn", `vika bridge: ${req.method} ${req.url} 失败: ${String(error?.stack || error)}`);
      sendJson(res, error instanceof BridgeError ? error.status : 500, {
        ok: false,
        error: { code: error?.code || "internal", message: error instanceof Error ? error.message : String(error) },
      });
    }).finally(() => {
      audit({ at: new Date().toISOString(), method: req.method, path: req.url, ms: Date.now() - startedAt });
    });
  });

  async function handle(req, res) {
    const remote = req.socket?.remoteAddress || "";
    const publicBind = vika.bridge.host === "0.0.0.0" || vika.bridge.host === "::";
    if (!publicBind && remote !== "127.0.0.1" && remote !== "::1" && remote !== "::ffff:127.0.0.1") {
      sendJson(res, 403, { ok: false, error: { code: "forbidden", message: "loopback only" } });
      return;
    }
    const header = String(req.headers.authorization || "");
    const given = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : String(req.headers["x-vika-token"] || "").trim();
    if (!tokenMatch(token, given)) {
      sendJson(res, 401, { ok: false, error: { code: "unauthorized", message: "invalid token" } });
      return;
    }
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const pathname = url.pathname;
    const method = (req.method || "GET").toUpperCase();
    const body = method === "GET" ? {} : await readBody(req);
    const result = await dispatch(pathname, method, url, body);
    sendJson(res, 200, { ok: true, ...result });
  }

  async function dispatch(pathname, method, url, body) {
    if (pathname === "/v1/engine/mode") {
      if (method === "POST") return setRouterMode(body.enabled === true || body.mode === "on");
      return { enabled: routerMode };
    }
    if (!routerMode && pathname !== "/v1/health") {
      throw new BridgeError("router_mode_off", "当前不在 router 模式；请先在飞书发送 /dshin", 409);
    }
    if (pathname === "/v1/health") {
      return {
        service: "dsh-openviking-expand/vika",
        bridge: { host: vika.bridge.host, port: vika.bridge.port },
        runtime: runtime.health,
        masterId: runtime.masterId,
      };
    }
    if (pathname === "/v1/engine/state") {
      const settings = runtime.store.settings();
      const tickets = runtime.store.tickets.list();
      return {
        state: {
          masterId: runtime.masterId,
          health: runtime.health,
          paused: settings.paused,
          overview: {
            flow: { received: runtime.store.read.triggerStats(new Date(Date.now() - 86400000).toISOString()).vika?.received || 0, accepted: 0 },
            tickets: { open: tickets.filter(item => !item.ended).length, working: tickets.filter(item => sourceTicketState(item) === "working").length, ended: tickets.filter(item => item.ended).length },
            executor: { running: tickets.filter(item => sourceTicketState(item) === "working").length, maxWorkers: settings.executor.maxWorkers },
          },
          settings: normalizeSettings(settings),
          tickets: tickets.map(item => ticketView(runtime, item)),
          repos: runtime.setup?.deployment?.repository ? [{ name: runtime.setup.deployment.repository, defaultBranch: "main", path: "" }] : [],
          workers: tickets.filter(item => sourceTicketState(item) === "working").map(item => ({ sessionId: `worker-${item.id}`, ticketId: item.id, active: true })),
        },
      };
    }
    if (pathname === "/v1/engine/triggers" && method === "POST") {
      const text = String(body.text || "").trim();
      if (text === "") throw new BridgeError("bad_request", "text 不能为空");
      const channel = String(body.source || "vika");
      const thread = String(body.thread || `vika-${Date.now()}`);
      const actor = String(body.actor || "vika");
      const trigger = {
        id: String(body.id || `vika-${randomBytes(8).toString("hex")}`),
        source: "vika",
        threads: [{ source: "vika", id: thread }],
        actor: { source: "vika", id: actor },
        human: true,
        addressed: "direct",
        at: new Date().toISOString(),
        text,
        meta: { vika: true, channel, thread, strength: String(body.strength || "explicit") },
      };
      const result = runtime.receive(trigger);
      return { trigger, result, ignored: result === "filtered", stored: result === "stored", needsRouter: result === "stored" };
    }
    if (pathname === "/v1/engine/evaluating") {
      return { triggers: runtime.pendingEvaluations() };
    }
    if (pathname === "/v1/engine/decisions" && method === "POST") {
      const triggerId = String(body.triggerId || "").trim();
      if (triggerId === "") throw new BridgeError("bad_request", "triggerId 不能为空");
      const trigger = runtime.store.triggers.get(triggerId);
      if (trigger === undefined) throw new BridgeError("not_found", `trigger 不存在：${triggerId}`, 404);
      const kind = String(body.kind || "accept");
      let outcome;
      if (kind === "accept") {
        outcome = {
          kind: "accept",
          title: String(body.title || firstLine(trigger.text, 120)),
          scope: String(body.scope || trigger.text || "Vika 任务"),
          reason: String(body.reason || "Vika 接单"),
          name: String(body.name || `vika-${triggerId.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase() || "task"}`),
          ...(body.workspace ? { workspace: body.workspaceNew ? requireConfirmedWorkspace(body.workspace) : requireExistingWorkspace(body.workspace) } : {}),
        };
      } else if (kind === "ignore" || kind === "unavailable") {
        outcome = { kind, reason: String(body.reason || "Vika 决定") };
      } else if (kind === "stop") {
        if (!body.ticketId) throw new BridgeError("bad_request", "stop 需要 ticketId");
        outcome = { kind: "stop", ticketId: String(body.ticketId), reason: String(body.reason || "Vika 停止") };
      } else {
        throw new BridgeError("bad_request", `未知决定：${kind}`);
      }
      const decision = runtime.decideExternal(triggerId, outcome);
      const ticketId = decision?.ticketId || "";
      return { decision, ticket: ticketId ? ticketView(runtime, runtime.store.tickets.get(ticketId)) : null };
    }
    if (pathname === "/v1/engine/decisions" && method === "GET") {
      return { decisions: runtime.store.read.recentDecisions(0, 100) };
    }
    if (pathname === "/v1/engine/tickets" && method === "GET") {
      const state = url.searchParams.get("state") || "all";
      const tickets = runtime.store.tickets.list().map(item => ticketView(runtime, item));
      return { tickets: state === "all" ? tickets : tickets.filter(item => item.state === state) };
    }
    const ticketActionMatch = /^\/v1\/engine\/tickets\/([A-Za-z0-9._:-]+)\/(retry|stop)$/.exec(pathname);
    if (ticketActionMatch && method === "POST") {
      const id = ticketActionMatch[1];
      if (ticketActionMatch[2] === "retry") runtime.engine.retryTicket(id);
      else runtime.engine.stopTicket(id, "Vika 停止");
      const ticket = runtime.store.tickets.get(id);
      return { ticket: ticket !== undefined ? ticketView(runtime, ticket) : null };
    }
    const ticketMatch = /^\/v1\/engine\/tickets\/([A-Za-z0-9._:-]+)$/.exec(pathname);
    if (ticketMatch && method === "GET") {
      const ticket = runtime.store.tickets.get(ticketMatch[1]);
      if (ticket === undefined) throw new BridgeError("not_found", `工单不存在：${ticketMatch[1]}`, 404);
      return { ticket: ticketView(runtime, ticket) };
    }
    if (pathname === "/v1/engine/threads" && method === "GET") {
      return { threads: runtime.store.threads.list() };
    }
    if (pathname === "/v1/engine/workers" && method === "GET") {
      return { workers: runtime.store.tickets.list().filter(item => sourceTicketState(item) === "working").map(item => ({ sessionId: `worker-${item.id}`, ticketId: item.id, active: true })) };
    }
    if (pathname === "/v1/engine/settings" && method === "GET") {
      return { settings: normalizeSettings(runtime.store.settings()) };
    }
    if (pathname === "/v1/engine/fs" && method === "GET") {
      return browseDirectories(url.searchParams.get("path") || "");
    }
    if (pathname === "/v1/engine/workspaces" && method === "POST") {
      return createWorkspaceDirectory(body.path);
    }
    if (pathname === "/v1/engine/workspaces" && method === "GET") {
      return { workspaces: hostWorkspaces() };
    }
    if (pathname === "/v1/engine/repos" && method === "GET") {
      const repository = runtime.setup?.deployment?.repository || "";
      return { repos: repository ? [{ name: repository, defaultBranch: "main", path: "" }] : [] };
    }
    if (pathname === "/v1/engine/pause" && method === "POST") {
      throw new BridgeError("not_supported", "暂停请在 vika 面板的「执行」页操作", 501);
    }
    throw new BridgeError("not_found", `未知接口：${method} ${pathname}`, 404);
  }

  return {
    token,
    server,
    start: () => new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(vika.bridge.port, vika.bridge.host, () => {
        server.off("error", reject);
        resolve(server.address());
      });
    }),
    close: () => {
      try { server.close(); } catch { /* 已关闭 */ }
    },
  };
}
