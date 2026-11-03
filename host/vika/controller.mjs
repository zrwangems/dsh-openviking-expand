/**
 * vika 组件核心：把 Vika 的请求翻译成 DSH 会话操作。
 *
 * 设计约束：
 * - 只用 ctx 上的 DSH 服务（sessionController / workspaceRegistry / agents / events），
 *   不 import 任何 @deepseek-ai 包，插件保持零运行时依赖；
 * - 每个任务一个真实会话，出现在 DSH 会话列表里；人类可直接打开；
 * - 事件采集只认注册表里的会话，避免误伤用户自己的对话。
 */
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { isAllowedCwd, repoPathOf } from "./config.mjs";
import { VikaRegistry } from "./registry.mjs";

/** 允许的 slug 形状：gh-work 与 dsh-bridge 共用同一约定。 */
const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,47}$/;
const REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

/** 带 HTTP 语义的错误，桥层直接映射成状态码。 */
export class VikaError extends Error {
  constructor(code, message, status = 400, detail = undefined) {
    super(message);
    this.name = "VikaError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/** 派发给 worker 的系统性说明，每次新建会话时拼在任务前面。 */
const WORKER_PREAMBLE = [
  "【Vika 工作会话】",
  "你是 Vika（飞书/GitHub 上的智能体）派发到 DSH 的执行会话。这个会话没有人类实时围观，也不要把问题抛回给用户。",
  "工作规则：",
  "- 在当前工作目录内完成下面这件事；需要更多上下文时先在仓库里查证。",
  "- 不要向人提问；如果被阻塞，直接停下并在最后一段说明阻塞点与已尝试的办法。",
  "- 不要执行 git push、不要用 gh 评论或开 PR、不要发任何对外消息：GitHub 的发布动作由 Vika 用她自己的账号完成。只允许只读的 git status/diff/log。",
  "- 结束前用一段简短中文汇报：做了什么、改了哪些文件、跑了什么验证及结果、还有什么没解决。",
  "",
  "任务：",
].join("\n");

/**
 * @typedef {object} VikaControllerDeps
 * @property {object} ctx DSH Cordis 上下文。
 * @property {object} vika 归一化后的 vika 配置。
 * @property {(level: string, message: string) => void} log 日志函数。
 */

export class VikaController {
  constructor({ ctx, vika, log }) {
    this.ctx = ctx;
    this.vika = vika;
    this.log = log;
    this.registry = new VikaRegistry(path.join(vika.stateDir, "registry.json"), { log });
    this.events = [];
    this.cursor = 0;
    this.waiters = new Set();
    this.disposers = [];
    this.closed = false;
  }

  /** 订阅 DSH 事件；插件卸载时由 close() 释放。 */
  install() {
    const onEvent = (session, event) => {
      try {
        this.observeSessionEvent(session, event);
      } catch (error) {
        this.log("warn", `vika: 处理 session/event 失败: ${String(error)}`);
      }
    };
    const onStatus = payload => {
      try {
        const agent = payload?.agent;
        if (!agent || !this.registry.get(agent.id)) return;
        this.recordStatus(agent.id, typeof agent.status === "string" ? agent.status : "unknown");
      } catch (error) {
        this.log("warn", `vika: 处理 agent/status 失败: ${String(error)}`);
      }
    };
    const onError = payload => {
      try {
        const agent = payload?.agent;
        if (!agent || !this.registry.get(agent.id)) return;
        const message = errorText(payload.error);
        this.registry.update(agent.id, { lastError: message, status: "error" });
        this.publish({ type: "error", sessionId: agent.id, message });
      } catch {}
    };
    this.disposers.push(
      this.ctx.on("session/event", onEvent),
      this.ctx.on("agent/status", onStatus),
      this.ctx.on("agent/error", onError),
    );
  }

  close() {
    this.closed = true;
    for (const dispose of this.disposers.splice(0)) {
      try {
        dispose();
      } catch {}
    }
    for (const waiter of this.waiters) waiter([]);
    this.waiters.clear();
  }

  /** 记录一条事件；会话事件只处理注册表里的会话。 */
  observeSessionEvent(session, event) {
    if (this.closed) return;
    if (this.masterSessionId && session.id === this.masterSessionId) {
      if (event.type === "assistant/message") {
        const text = assistantTextOf(event);
        if (text) this.lastMasterAssistant = text;
      }
      return;
    }
    const record = this.registry.get(session.id);
    if (!record) return;
    const patch = { lastEventAt: new Date().toISOString() };
    if (event.type === "assistant/message") {
      const text = assistantTextOf(event);
      if (text) {
        patch.lastAssistant = text.slice(0, this.vika.workers.reportChars);
        patch.lastAssistantAt = new Date().toISOString();
        patch.messageCount = (record.messageCount ?? 0) + 1;
        patch.status = "idle";
      }
    } else if (event.type === "turn/end") {
      patch.status = "idle";
    } else if (event.type === "turn/start") {
      patch.status = "running";
      // 新一轮开始说明上一次错误已被绕过，清掉告警避免一直显示 error。
      patch.lastError = "";
    }
    const next = this.registry.update(session.id, patch);
    if (patch.lastAssistant !== undefined) {
      this.publish({ type: "completed", sessionId: session.id, text: next?.lastAssistant ?? "", at: patch.lastAssistantAt });
    }
  }

  recordStatus(sessionId, status) {
    const patch = { status };
    if (status === "running") patch.lastRunAt = new Date().toISOString();
    const next = this.registry.update(sessionId, patch);
    this.publish({ type: "status", sessionId, status, at: next?.updatedAt });
  }

  /** 往长轮询队列里发一条桥事件。 */
  publish(event) {
    const item = { ...event, cursor: ++this.cursor };
    this.events.push(item);
    if (this.events.length > 500) this.events.splice(0, this.events.length - 500);
    for (const waiter of [...this.waiters]) {
      waiter([item]);
      this.waiters.delete(waiter);
    }
  }

  /**
   * 等新的桥事件：cursor 之后有事件立即返回，否则最多等 timeoutMs。
   * @returns 事件数组（可能为空）。
   */
  waitForEvents(cursor, timeoutMs) {
    if (this.closed) return Promise.resolve([]);
    const pending = this.events.filter(event => event.cursor > cursor);
    if (pending.length > 0) return Promise.resolve(pending);
    return new Promise(resolve => {
      const waiter = events => {
        clearTimeout(timer);
        resolve(events);
      };
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        resolve([]);
      }, timeoutMs);
      this.waiters.add(waiter);
    });
  }

  /** 当前活着的 DSH agent（可能为 undefined，例如 DSH 重启后还没被唤起）。 */
  liveAgent(sessionId) {
    try {
      return this.ctx.agents.get(sessionId);
    } catch {
      return undefined;
    }
  }

  statusOf(record) {
    const agent = this.liveAgent(record.sessionId);
    if (agent && typeof agent.status === "string") return agent.status;
    return record.status || "unknown";
  }

  /**
   * 新建一个 worker 会话并可选地投递首个任务。
   *
   * @param input `{title, cwd?, repo?, slug?, threads?, prompt?, requestId?}`。
   * @returns `{sessionId, title, status, cwd}`。
   */
  async createSession(input = {}) {
    const requestId = trimText(input.requestId);
    if (requestId) {
      const existing = this.registry.findByRequestId(requestId);
      if (existing) return this.publicView(existing);
    }
    const records = this.registry.list();
    if (input.unbounded !== true && records.length >= this.vika.workers.maxSessions) {
      throw new VikaError("limit_exceeded", `已达到 maxSessions=${this.vika.workers.maxSessions}，请先清理旧会话`, 429);
    }
    const cwd = this.resolveCwd(input);
    const title = this.resolveTitle(input, cwd);
    const threads = normalizeThreads(input.threads);
    if (!isAllowedCwd(this.vika, cwd)) {
      throw new VikaError("path_not_allowed", `cwd 不在允许范围内: ${cwd}`, 403);
    }
    ensureDirectory(cwd);
    let project;
    try {
      project = await this.ctx.workspaceRegistry.create(cwd, title);
    } catch (error) {
      throw new VikaError("upstream_error", `创建 workspace 失败（${cwd}）: ${errorText(error)}`, 502);
    }
    const sessionId = `vika-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    let created;
    try {
      created = await this.ctx.sessionController.create({
        sessionId,
        workspaceId: project.id,
        ...(this.vika.workers.preset ? { agentPreset: this.vika.workers.preset } : {}),
      });
    } catch (error) {
      throw mapRemoteError(error, "创建 DSH 会话失败");
    }
    const finalId = created?.sessionId || sessionId;
    // 让 DSH 会话列表里显示同一个标题；标题服务缺失时不影响主流程。
    try {
      await this.ctx.sessionController.rename({ sessionId: finalId, title });
    } catch (error) {
      this.log("warn", `vika: 会话标题设置失败（${finalId}）: ${errorText(error)}`);
    }
    const now = new Date().toISOString();
    const record = this.registry.upsert({
      sessionId: finalId,
      title,
      threads,
      cwd,
      repo: trimText(input.repo) || undefined,
      slug: trimText(input.slug) || undefined,
      status: "idle",
      createdAt: now,
      updatedAt: now,
      lastAssistant: "",
      lastError: "",
      messageCount: 0,
      requestIds: requestId ? [requestId] : [],
    });
    if (trimText(input.prompt)) {
      try {
        // 首条任务的 requestId 必须与 create 的幂等键区分开，否则会被当成重复投递。
        await this.sendMessage({ sessionId: finalId, text: this.withPreamble(trimText(input.prompt), true, this.repoDir(input)), requestId: `${requestId || finalId}:first` });
      } catch (error) {
        this.registry.update(finalId, { lastError: errorText(error), status: "error" });
        throw error;
      }
    }
    this.publish({ type: "created", sessionId: finalId, title });
    return this.publicView(this.registry.get(finalId) || record);
  }

  /**
   * 给已有会话投递消息。默认排队到下一轮；`mode: "steer"` 表示插入下一步。
   */
  async sendMessage(input = {}) {
    const sessionId = trimText(input.sessionId);
    const record = this.registry.get(sessionId);
    if (!record) throw new VikaError("not_found", `没有这个会话: ${sessionId}`, 404);
    const text = trimText(input.text);
    if (!text) throw new VikaError("bad_request", "text 不能为空", 400);
    if (text.length > this.vika.workers.maxPromptChars) {
      throw new VikaError("bad_request", `文本超过 ${this.vika.workers.maxPromptChars} 字符`, 400);
    }
    const requestId = trimText(input.requestId) || `msg-${randomUUID()}`;
    if (record.requestIds?.includes(requestId)) return this.publicView(record);
    const mode = input.mode === "steer" ? "steer" : undefined;
    const payload = text.startsWith("【Vika") ? text : this.withPreamble(text, false);
    try {
      await this.ctx.sessionController.prompt({
        sessionId,
        content: [{ type: "text", text: payload }],
        requestId,
        ...(mode ? { mode } : {}),
      }, AbortSignal.timeout(60_000));
    } catch (error) {
      throw mapRemoteError(error, "投递消息失败");
    }
    this.registry.rememberRequest(sessionId, requestId);
    const next = this.registry.update(sessionId, { status: "running", lastError: "" });
    this.publish({ type: "message", sessionId, mode: mode ?? "queue" });
    return this.publicView(next);
  }

  /** 取消会话当前的回合（不丢待处理 inbox）。 */
  async cancelSession(sessionId) {
    const record = this.registry.get(trimText(sessionId));
    if (!record) throw new VikaError("not_found", `没有这个会话: ${sessionId}`, 404);
    try {
      await this.ctx.sessionController.cancel({ sessionId: record.sessionId });
    } catch (error) {
      throw mapRemoteError(error, "取消失败");
    }
    const next = this.registry.update(record.sessionId, { status: "cancelling" });
    this.publish({ type: "cancelled", sessionId: record.sessionId });
    return this.publicView(next);
  }

  /** 改标题（DSH 会话列表里显示的名字）。 */
  async renameSession(sessionId, title) {
    const record = this.registry.get(trimText(sessionId));
    if (!record) throw new VikaError("not_found", `没有这个会话: ${sessionId}`, 404);
    const nextTitle = trimText(title).slice(0, 200);
    if (!nextTitle) throw new VikaError("bad_request", "title 不能为空", 400);
    try {
      await this.ctx.sessionController.rename({ sessionId: record.sessionId, title: `${this.vika.workers.titlePrefix}${nextTitle}` });
    } catch (error) {
      throw mapRemoteError(error, "改标题失败");
    }
    const next = this.registry.update(record.sessionId, { title: nextTitle });
    return this.publicView(next);
  }

  /** 查一个会话：注册表信息 + 当前状态。 */
  showSession(sessionId) {
    const record = this.registry.get(trimText(sessionId));
    if (!record) throw new VikaError("not_found", `没有这个会话: ${sessionId}`, 404);
    return this.publicView(record);
  }

  /** 列会话，可按话题键与状态过滤，新的在前。 */
  listSessions({ thread, status, limit } = {}) {
    let records = this.registry.list();
    if (trimText(thread)) records = records.filter(record => record.threads?.includes(trimText(thread)));
    const items = records.map(record => this.publicView(record));
    const filtered = trimText(status) ? items.filter(item => item.status === trimText(status)) : items;
    const max = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(100, Math.trunc(Number(limit)))) : 50;
    return filtered.slice(0, max);
  }

  /** 临时诊断：看会话在 DSH 里的真实状态、inbox 大小与最近事件类型。 */
  debugSession(sessionId) {
    const id = trimText(sessionId);
    const agent = this.liveAgent(id);
    let session;
    try {
      session = agent?.session ?? this.ctx.sessions?.get?.(id);
    } catch {}
    let events = [];
    try {
      if (typeof session?.snapshotEvents === "function") events = session.snapshotEvents().slice(-25);
    } catch {}
    const preview = message => {
      const block = Array.isArray(message?.content) ? message.content.find(item => item?.type === "text") : undefined;
      return typeof block?.text === "string" ? block.text.slice(0, 120) : "";
    };
    return {
      sessionId: id,
      active: Boolean(this.registry.get(id)),
      hasAgent: Boolean(agent),
      hasSession: Boolean(session),
      agentStatus: agent?.status,
      header: session?.header ? { agentPreset: session.header.agentPreset, cwd: session.header.cwd } : undefined,
      inbox: agent?.inbox ? {
        nextTurn: (agent.inbox.nextTurn ?? []).map(preview),
        nextStep: (agent.inbox.nextStep ?? []).map(preview),
      } : undefined,
      eventCount: events.length,
      events: events.map(event => ({ seq: event?.seq, type: event?.type })),
    };
  }

  /** 对外展示用：不要直接把整条账本记录（含 requestIds）泄露给调用方。 */
  publicView(record) {    if (!record) return undefined;
    return {
      sessionId: record.sessionId,
      title: record.title,
      status: this.statusOf(record),
      threads: record.threads ?? [],
      cwd: record.cwd,
      repo: record.repo,
      slug: record.slug,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      lastAssistant: (record.lastAssistant ?? "").slice(0, this.vika.workers.reportChars),
      lastAssistantAt: record.lastAssistantAt,
      lastError: record.lastError || "",
      messageCount: record.messageCount ?? 0,
    };
  }

  /** 校验 repo/slug 并返回仓库目录；只写进任务正文，不作为会话 cwd。 */
  repoDir(input = {}) {
    const repo = trimText(input.repo);
    const slug = trimText(input.slug);
    if (!repo && !slug) return "";
    if (!REPO_RE.test(repo)) throw new VikaError("bad_request", `repo 必须是 owner/name: ${repo}`, 400);
    if (!SLUG_RE.test(slug)) throw new VikaError("bad_request", `slug 必须是 1-48 位小写字母数字或 ._-: ${slug}`, 400);
    return repoPathOf(this.vika, repo, slug);
  }

  /** 解析 cwd：显式 cwd > 默认工作区。repo/slug 只用于定位仓库目录，不再作为会话 cwd。 */
  resolveCwd(input = {}) {
    const repo = trimText(input.repo);
    const slug = trimText(input.slug);
    if (repo || slug) {
      // 仓库目录仍校验格式，但会话固定落在唯一的默认工作区，避免 DSH 里出现多余 workspace。
      this.repoDir(input);
      return this.vika.workers.defaultCwd;
    }
    const cwd = trimText(input.cwd);
    if (!cwd) return this.vika.workers.defaultCwd;
    if (!path.isAbsolute(cwd)) throw new VikaError("bad_request", `cwd 必须是绝对路径: ${cwd}`, 400);
    return path.resolve(cwd);
  }

  resolveTitle(input = {}, cwd) {
    const base = trimText(input.title) || path.basename(cwd) || "任务";
    return `${this.vika.workers.titlePrefix}${base}`.slice(0, 200);
  }

  /** 给消息加 worker 说明；首条任务用完整版，追问只提醒一次身份。 */
  withPreamble(text, first = true, repoDir = "") {
    // 会话工作区固定为默认工作区；仓库目录通过正文的绝对路径告知 worker。
    const repoLine = repoDir
      ? `仓库目录：${repoDir}\n注意：当前会话工作区固定为 ${this.vika.workers.defaultCwd}，请用绝对路径进入仓库目录操作。\n`
      : "";
    if (!first) return `【Vika 追问，继续同一任务】\n${repoLine}${text}`;
    return `${WORKER_PREAMBLE}\n${repoLine}${text}`;
  }
}

function normalizeThreads(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => trimText(item)).filter(Boolean))].slice(0, 20);
}

function trimText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function ensureDirectory(cwd) {
  try {
    fs.mkdirSync(cwd, { recursive: true });
  } catch (error) {
    throw new VikaError("bad_request", `无法创建工作目录 ${cwd}: ${errorText(error)}`, 400);
  }
}

/** 从 assistant/message 事件里取纯文本。 */
function assistantTextOf(event) {
  const content = event?.data?.message?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(block => block && block.type === "text" && typeof block.text === "string")
    .map(block => block.text)
    .join("\n")
    .trim();
}

/** DSH Remote 错误转成桥错误。 */
function mapRemoteError(error, prefix) {
  const code = typeof error?.code === "string" ? error.code : "";
  const message = `${prefix}: ${errorText(error)}`;
  if (code.includes("not-found")) return new VikaError("not_found", message, 404, code);
  if (code.includes("bad-request")) return new VikaError("bad_request", message, 400, code);
  if (code.includes("agent-busy")) return new VikaError("session_busy", message, 409, code);
  if (code.includes("model-unavailable")) return new VikaError("upstream_error", message, 502, code);
  return new VikaError("upstream_error", message, 502, code || undefined);
}

function errorText(error) {
  if (!error) return "unknown error";
  if (error instanceof Error) return error.message;
  return String(error);
}
