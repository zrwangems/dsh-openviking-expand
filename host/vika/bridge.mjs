/**
 * vika 组件的本地 HTTP 桥：只绑回环、Bearer token、JSON。
 *
 * Vika 运行在 Docker 里，通过 host.docker.internal 访问它；
 * 这个监听器不属于 DSH 同源路由，浏览器半侧不会、也不应该碰它。
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { VikaError } from "./controller.mjs";
import { searchView, sourceRows, threadView, ticketView, triggerRow } from "./views.mjs";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const ROUTES = [
  ["GET", /^\/v1\/health$/],
  ["POST", /^\/v1\/sessions$/],
  ["GET", /^\/v1\/sessions$/],
  ["GET", /^\/v1\/sessions\/([A-Za-z0-9._:-]+)$/],
  ["POST", /^\/v1\/sessions\/([A-Za-z0-9._:-]+)\/messages$/],
  ["POST", /^\/v1\/sessions\/([A-Za-z0-9._:-]+)\/cancel$/],
  ["POST", /^\/v1\/sessions\/([A-Za-z0-9._:-]+)\/title$/],
  ["GET", /^\/v1\/events$/],
  ["GET", /^\/v1\/debug\/sessions\/([A-Za-z0-9._:-]+)$/],
  ["GET", /^\/v1\/engine\/state$/],
  ["GET", /^\/v1\/engine\/overview$/],
  ["GET", /^\/v1\/engine\/issues$/],
  ["GET", /^\/v1\/engine\/batch$/],
  ["POST", /^\/v1\/engine\/triggers$/],
  ["GET", /^\/v1\/engine\/evaluating$/],
  ["POST", /^\/v1\/engine\/decisions$/],
  ["GET", /^\/v1\/engine\/decisions$/],
  ["GET", /^\/v1\/engine\/tickets$/],
  ["GET", /^\/v1\/engine\/tickets\/([A-Za-z0-9._:-]+)$/],
  ["POST", /^\/v1\/engine\/tickets\/([A-Za-z0-9._:-]+)\/retry$/],
  ["POST", /^\/v1\/engine\/tickets\/([A-Za-z0-9._:-]+)\/stop$/],
  ["GET", /^\/v1\/engine\/threads$/],
  ["POST", /^\/v1\/engine\/threads\/([^/]+)\/unsubscribe$/],
  ["GET", /^\/v1\/engine\/workers$/],
  ["GET", /^\/v1\/engine\/sources$/],
  ["GET", /^\/v1\/engine\/search$/],
  ["POST", /^\/v1\/engine\/triggers\/([A-Za-z0-9._:-]+)\/requeue$/],
  ["GET", /^\/v1\/engine\/repos$/],
  ["POST", /^\/v1\/engine\/repos$/],
  ["POST", /^\/v1\/engine\/repos\/remove$/],
  ["GET", /^\/v1\/engine\/settings$/],
  ["PUT", /^\/v1\/engine\/settings\/([A-Za-z]+)$/],
  ["POST", /^\/v1\/engine\/pause$/],
  ["POST", /^\/v1\/engine\/reports$/],
  ["POST", /^\/v1\/engine\/stop$/],
];

export class VikaBridge {
  /**
   * @param options `{controller, vika, log}`。
   */
  constructor({ controller, vika, log }) {
    this.controller = controller;
    this.vika = vika;
    this.log = log;
    this.server = null;
    this.token = vika.bridge.token || "";
    this.tokenFile = path.join(vika.stateDir, "bridge.json");
    this.auditFile = path.join(vika.stateDir, "audit.jsonl");
  }

  /** 读取或生成 token；返回值统一由这里落盘，便于部署脚本复制给 Vika。 */
  resolveToken() {
    if (this.token) return this.token;
    try {
      const existing = JSON.parse(fs.readFileSync(this.tokenFile, "utf8"));
      if (existing && typeof existing.token === "string" && existing.token.length >= 16) {
        this.token = existing.token;
        return this.token;
      }
    } catch {}
    const token = randomBytes(24).toString("base64url");
    this.token = token;
    try {
      fs.mkdirSync(path.dirname(this.tokenFile), { recursive: true });
      fs.writeFileSync(this.tokenFile, `${JSON.stringify({ host: this.vika.bridge.host, port: this.vika.bridge.port, token, updatedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
    } catch (error) {
      this.log("warn", `vika bridge: token 落盘失败: ${String(error)}`);
    }
    return token;
  }

  start() {
    if (this.server) return Promise.resolve(this.server.address());
    this.resolveToken();
    this.server = http.createServer((req, res) => {
      this.handle(req, res).catch(error => {
        this.log("warn", `vika bridge: 未捕获错误: ${String(error)}`);
        sendJson(res, 500, { ok: false, error: { code: "internal", message: "internal error" } });
      });
    });
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.vika.bridge.port, this.vika.bridge.host, () => {
        this.server.off("error", reject);
        const address = this.server.address();
        this.log("info", `vika bridge: listening on http://${this.vika.bridge.host}:${address.port}`);
        resolve(address);
      });
    });
  }

  close() {
    const server = this.server;
    this.server = null;
    if (!server) return;
    try {
      server.close();
    } catch {}
  }

  async handle(req, res) {
    const startedAt = Date.now();
    const remote = req.socket?.remoteAddress || "";
    // 默认只接受回环；显式绑定 0.0.0.0/:: 时放行容器网关（仍需 Bearer token）。
    const publicBind = this.vika.bridge.host === "0.0.0.0" || this.vika.bridge.host === "::";
    if (!LOOPBACK.has(remote) && !publicBind) {
      sendJson(res, 403, { ok: false, error: { code: "forbidden", message: "loopback only" } });
      return;
    }
    if (!this.authorized(req)) {
      sendJson(res, 401, { ok: false, error: { code: "unauthorized", message: "invalid token" } });
      return;
    }
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const method = (req.method || "GET").toUpperCase();
    const route = ROUTES.find(([verb, pattern]) => verb === method && pattern.test(url.pathname));
    if (!route) {
      sendJson(res, 404, { ok: false, error: { code: "not_found", message: `no route ${method} ${url.pathname}` } });
      return;
    }
    const match = route[1].exec(url.pathname);
    let status = 200;
    try {
      const body = method === "POST" || method === "PUT" ? await readJsonBody(req, this.vika.bridge.maxBodyBytes) : {};
      const result = await this.dispatch(url, method, match, body);
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      if (error instanceof VikaError) {
        status = error.status;
        sendJson(res, status, { ok: false, error: { code: error.code, message: error.message, ...(error.detail ? { detail: error.detail } : {}) } });
      } else {
        status = 500;
        this.log("warn", `vika bridge: ${method} ${url.pathname} 失败: ${String(error)}`);
        sendJson(res, status, { ok: false, error: { code: "internal", message: String(error?.message || error) } });
      }
    } finally {
      this.audit({ at: new Date().toISOString(), method, path: url.pathname, status, ms: Date.now() - startedAt, remote });
    }
  }

  async dispatch(url, method, match, body) {
    const pathname = url.pathname;
    if (pathname === "/v1/health") {
      const sessions = this.controller.listSessions({ limit: 100 });
      return {
        service: "dsh-openviking-expand/vika",
        bridge: { host: this.vika.bridge.host, port: this.vika.bridge.port },
        sessions: {
          total: sessions.length,
          running: sessions.filter(item => item.status === "running").length,
        },
        workers: {
          defaultCwd: this.vika.workers.defaultCwd,
          allowedRoots: this.vika.workers.allowedRoots,
          reposRoot: this.vika.workers.reposRoot,
        },
      };
    }
    if (pathname.startsWith("/v1/engine")) {
      return await this.engineDispatch(pathname, method, url, body);
    }
    if (pathname === "/v1/sessions" && method === "POST") {
      return { session: await this.controller.createSession(body) };
    }
    if (pathname === "/v1/sessions" && method === "GET") {
      return {
        sessions: this.controller.listSessions({
          thread: url.searchParams.get("thread") || "",
          status: url.searchParams.get("status") || "",
          limit: url.searchParams.get("limit") || undefined,
        }),
      };
    }
    const id = decodeURIComponent(match[1] || "");
    // 仅会话消息走通用分支；/v1/vika/messages 由下面自己的处理器接。
    if (pathname.startsWith("/v1/sessions/") && pathname.endsWith("/messages")) {
      return { session: await this.controller.sendMessage({ ...body, sessionId: id }) };
    }
    if (pathname.endsWith("/cancel")) {
      return { session: await this.controller.cancelSession(id) };
    }
    if (pathname.endsWith("/title")) {
      return { session: await this.controller.renameSession(id, body?.title) };
    }
    if (pathname === "/v1/events") {
      const cursor = Number(url.searchParams.get("cursor") || 0) || 0;
      const timeoutMs = clamp(Number(url.searchParams.get("timeoutMs") || 0) || 0, 0, this.vika.bridge.maxWaitMs, 0);
      const events = await this.controller.waitForEvents(cursor, timeoutMs);
      return { cursor: this.controller.cursor, events };
    }
    if (pathname.startsWith("/v1/debug/sessions/")) {
      return { debug: this.controller.debugSession(id) };
    }
    return { session: this.controller.showSession(id) };
  }

  /** 等待原生引擎就绪（vika 组件挂载时创建，初始化异步）。 */
  async engineOf() {
    const engine = this.controller.engine;
    if (engine === undefined || engine === null) throw new VikaError("not_found", "原生引擎未就绪", 503);
    const ready = this.controller.native ? this.controller.native.ready : undefined;
    if (ready && typeof ready.then === "function") await ready;
    return engine;
  }

  /** vika 原生 vika 引擎的桥接口（Vika Router 使用）。 */
  async engineDispatch(pathname, method, url, body) {
    const engine = await this.engineOf();
    if (pathname === "/v1/engine/state") {
      return {
        state: {
          overview: engine.overview(),
          settings: engine.settings,
          repos: engine.state.repos,
          workers: engine.listWorkers().slice(0, 20),
        },
      };
    }
    if (pathname === "/v1/engine/batch") {
      return { batch: engine.batchPending() };
    }
    if (pathname === "/v1/engine/issues") {
      return { issues: engine.issues() };
    }
    if (pathname === "/v1/engine/overview") {
      return { overview: engine.overview() };
    }
    if (pathname === "/v1/engine/triggers" && method === "POST") {
      const received = await engine.receiveTrigger(body || {});
      return { trigger: received.trigger, ignored: received.ignored === true, routed: received.routed === true, needsRouter: received.needsRouter === true };
    }
    const requeueMatch = /^\/v1\/engine\/triggers\/([A-Za-z0-9._:-]+)\/requeue$/.exec(pathname);
    if (requeueMatch && method === "POST") {
      const requeued = await engine.requeueTrigger(requeueMatch[1]);
      return { requeued: requeued.requeued, trigger: triggerRow(requeued.trigger) };
    }
    if (pathname === "/v1/engine/evaluating") {
      return { triggers: engine.listTriggers({ state: "evaluating" }) };
    }
    if (pathname === "/v1/engine/decisions" && method === "POST") {
      const decided = await engine.decide(body?.triggerId, { kind: body?.kind, reason: body?.reason, actor: body?.actor });
      return decided;
    }
    if (pathname === "/v1/engine/decisions") {
      return { decisions: engine.listDecisions().slice(0, 100) };
    }
    if (pathname === "/v1/engine/tickets" && method === "GET") {
      const state = url.searchParams.get("state") || "all";
      return { tickets: engine.listTickets({ state }) };
    }
    const ticketActionMatch = /^\/v1\/engine\/tickets\/([A-Za-z0-9._:-]+)\/(retry|stop)$/.exec(pathname);
    if (ticketActionMatch && method === "POST") {
      const id = ticketActionMatch[1];
      if (ticketActionMatch[2] === "retry") {
        const result = await engine.retryTicket(id);
        return { assignment: result.assignment, ticket: ticketView(engine.state, id) };
      }
      const result = await engine.stopTicket(id);
      return { stopped: result.stopped, ticket: ticketView(engine.state, id) };
    }
    const ticketMatch = /^\/v1\/engine\/tickets\/([A-Za-z0-9._:-]+)$/.exec(pathname);
    if (ticketMatch) {
      const ticket = engine.state.tickets.find(item => item.id === ticketMatch[1]);
      if (ticket === undefined) throw new VikaError("not_found", `工单不存在：${ticketMatch[1]}`, 404);
      const assignments = engine.state.assignments.filter(item => item.ticketId === ticket.id);
      return { ticket: { ...ticket, assignments } };
    }
    if (pathname === "/v1/engine/threads") {
      return { threads: engine.listThreads() };
    }
    const unsubscribeMatch = /^\/v1\/engine\/threads\/([^/]+)\/unsubscribe$/.exec(pathname);
    if (unsubscribeMatch && method === "POST") {
      const key = decodeURIComponent(unsubscribeMatch[1]);
      const result = await engine.unsubscribeThread(key);
      return { removed: result.removed, thread: threadView(engine.state, key) };
    }
    if (pathname === "/v1/engine/workers") {
      return { workers: engine.listWorkers() };
    }
    if (pathname === "/v1/engine/sources") {
      return { sources: sourceRows(engine.state) };
    }
    if (pathname === "/v1/engine/search") {
      return searchView(engine.state, url.searchParams.get("q") || "");
    }
    if (pathname === "/v1/engine/repos" && method === "GET") {
      return { repos: engine.state.repos };
    }
    if (pathname === "/v1/engine/repos" && method === "POST") {
      return { repo: await engine.addRepo(body || {}) };
    }
    if (pathname === "/v1/engine/repos/remove" && method === "POST") {
      return { removed: await engine.removeRepo(String(body?.name || "")) };
    }
    if (pathname === "/v1/engine/settings" && method === "GET") {
      return { settings: engine.settings };
    }
    const settingsMatch = /^\/v1\/engine\/settings\/([A-Za-z]+)$/.exec(pathname);
    if (settingsMatch && method === "PUT") {
      const block = await engine.updateSettings(settingsMatch[1], body?.value, body?.revision);
      return { settings: { block: settingsMatch[1], ...block } };
    }
    if (pathname === "/v1/engine/pause" && method === "POST") {
      return { executor: await engine.setPaused(body?.paused === true) };
    }
    if (pathname === "/v1/engine/reports" && method === "POST") {
      const reported = await engine.report(body?.assignmentId, { summary: body?.summary, state: body?.state, sessionId: body?.sessionId });
      return reported;
    }
    if (pathname === "/v1/engine/stop" && method === "POST") {
      const sessionId = String(body?.sessionId || "");
      const worker = engine.listWorkers().find(item => item.sessionId === sessionId && item.active === true);
      if (worker === undefined) throw new VikaError("not_found", `没有活跃 worker：${sessionId}`, 404);
      if (this.controller.native && this.controller.native.adapterStop) await this.controller.native.adapterStop(sessionId);
      return { stopped: { sessionId } };
    }
    throw new VikaError("not_found", `未知引擎接口：${pathname}`, 404);
  }

  /** 恒定时间比较 token，避免长度/前缀泄露。 */
  authorized(req) {
    const header = String(req.headers.authorization || "");
    const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    const given = bearer || String(req.headers["x-vika-token"] || "").trim();
    if (!given || !this.token) return false;
    const a = createHash("sha256").update(given).digest();
    const b = createHash("sha256").update(this.token).digest();
    return timingSafeEqual(a, b);
  }

  audit(entry) {
    if (!this.vika.bridge.audit) return;
    try {
      fs.mkdirSync(path.dirname(this.auditFile), { recursive: true });
      fs.appendFileSync(this.auditFile, `${JSON.stringify(entry)}\n`, "utf8");
    } catch {}
  }
}

function readJsonBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooBig = false;
    const chunks = [];
    req.on("data", chunk => {
      size += chunk.length;
      if (size > limit) {
        // 继续把请求体读完再回 413，避免直接断 socket 让调用方只看到连接错误。
        tooBig = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooBig) {
        reject(new VikaError("bad_request", `请求体超过 ${limit} 字节`, 413));
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          reject(new VikaError("bad_request", "请求体必须是 JSON 对象", 400));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new VikaError("bad_request", "请求体不是合法 JSON", 400));
      }
    });
    req.on("error", error => reject(new VikaError("bad_request", `读取请求体失败: ${String(error)}`, 400)));
  });
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

function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
