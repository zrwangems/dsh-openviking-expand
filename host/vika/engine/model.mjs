/**
 * vika 原生 vika 引擎：纯函数核心。
 *
 * 设计参考 vika-upstream 的行为（Trigger/Thread/Ticket/Assignment/Report、
 * 程序策略 + 语义评估、订阅直通、并发上限），但代码为独立原生实现，不复制其源码。
 */

/** 事件来源。 */
export const SOURCES = ["feishu", "github", "manual", "api"];

/** Trigger 状态。 */
export const TRIGGER_STATES = ["received", "filtered", "evaluating", "accepted", "ignored", "routed"];

/** Ticket 状态。 */
export const TICKET_STATES = ["open", "working", "blocked", "ended"];

/** Assignment 状态。 */
export const ASSIGNMENT_STATES = ["starting", "running", "ended"];

let sequence = 0;

/** 生成带前缀的短 id（时间 + 进程内序号，足够本地使用）。 */
export function newId(prefix) {
  sequence = (sequence + 1) % 100000;
  const stamp = Date.now().toString(36);
  const seq = sequence.toString(36).padStart(3, "0");
  const rand = Math.floor(Math.random() * 36 ** 3).toString(36).padStart(3, "0");
  return `${prefix}-${stamp}${seq}${rand}`;
}

/** 文本归一化：去首尾空白、压缩连续空行，限长。 */
export function normalizeText(value, limit = 20000) {
  if (typeof value !== "string") return "";
  const text = value.replace(/\r\n/g, "\n").trim();
  return text.length > limit ? `${text.slice(0, limit)}\n…（已截断）` : text;
}

/** 来源归一化：未知来源归为 api。 */
export function normalizeSource(value) {
  const source = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SOURCES.includes(source) ? source : "api";
}

/** 话题键：允许调用方直接传 `<source>:<key>`；否则补前缀。 */
export function threadKeyOf(source, thread) {
  const prefix = `${source}:`;
  const raw = typeof thread === "string" && thread.trim() !== "" ? thread.trim() : "default";
  return raw.startsWith(prefix) ? raw : `${prefix}${raw}`;
}

/** 由 trigger 生成一条线程记录（幂等）。 */
export function ensureThread(threads, [key]) {
  if (threads === undefined || threads === null) return undefined;
  if (threads[key] !== undefined) return threads[key];
  threads[key] = {
    key,
    repo: "",
    source: key.split(":")[0],
    triggers: [],
    workers: [],
    tickets: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return threads[key];
}

/**
 * 程序层策略（Fast Path）：在调用模型/路由前做确定性过滤。
 *
 * policy 结构：
 *   sources: { feishu: { mode: "candidate"|"ignore"|"manual", allowed: [{id,name}] }, ... }
 *   repos:   { allow: [string], deny: [string] }
 *   rules:   [{ id, when: { source?, repo?, actor? }, action: "ignore"|"candidate"|"require-explicit" }]
 */
export function applyPolicy(trigger, policy = {}) {
  const reasons = [];
  const sourcePolicy = (policy.sources && policy.sources[trigger.source]) || {};
  const mode = sourcePolicy.mode === "ignore" || sourcePolicy.mode === "manual" ? sourcePolicy.mode : "candidate";
  if (mode === "ignore") {
    return { decision: "ignore", reasons: [{ code: "sourceIgnore", source: trigger.source }] };
  }
  if (mode === "manual") {
    return { decision: "candidate", reasons: [{ code: "sourceManual", source: trigger.source }] };
  }
  const allowed = Array.isArray(sourcePolicy.allowed) ? sourcePolicy.allowed : [];
  if (allowed.length > 0) {
    const actor = typeof trigger.actor === "string" ? trigger.actor : "";
    if (actor === "" || !allowed.some(item => [item.id, item.name].includes(actor))) {
      return { decision: "ignore", reasons: [{ code: "actorNotAllowed", actor }] };
    }
    reasons.push({ code: "actorAllowed", actor: trigger.actor });
  }
  const repo = typeof trigger.repo === "string" ? trigger.repo : "";
  if (repo !== "") {
    if (Array.isArray(policy.repos?.deny) && policy.repos.deny.includes(repo)) {
      return { decision: "ignore", reasons: [{ code: "repoDenied", repo }] };
    }
    if (Array.isArray(policy.repos?.allow) && policy.repos.allow.length > 0 && !policy.repos.allow.includes(repo)) {
      return { decision: "ignore", reasons: [{ code: "repoNotAllowed", repo }] };
    }
  }
  for (const rule of Array.isArray(policy.rules) ? policy.rules : []) {
    if (rule === null || typeof rule !== "object") continue;
    if (rule.enabled === false) continue;
    const when = rule.when || {};
    if (when.source !== undefined && when.source !== trigger.source) continue;
    if (when.repo !== undefined && when.repo !== repo) continue;
    if (when.actor !== undefined && when.actor !== trigger.actor) continue;
    const named = { rule: rule.id ?? "", name: typeof rule.name === "string" ? rule.name : "" };
    if (rule.action === "ignore") {
      return { decision: "ignore", reasons: [{ code: "ruleIgnore", ...named }] };
    }
    if (rule.action === "require-explicit" && trigger.strength !== "explicit") {
      return { decision: "ignore", reasons: [{ code: "ruleRequireExplicit", ...named }] };
    }
    reasons.push({ code: "ruleCandidate", ...named });
  }
  return { decision: "candidate", reasons };
}

/** 语义评估的默认策略（由 Vika Router 或规则兜底实现）。 */
export function decideByStrength(trigger) {
  if (trigger.strength === "explicit") return { kind: "accept", reason: [{ code: "explicitRequest" }] };
  return { kind: "ignore", reason: [{ code: "notExplicit" }] };
}

/** 新增一个 trigger 记录（去重由调用方按 id 处理）。 */
export function createTrigger(input, now = new Date().toISOString()) {
  const source = normalizeSource(input.source);
  const thread = threadKeyOf(source, input.thread);
  const text = normalizeText(input.text);
  return {
    id: typeof input.id === "string" && input.id !== "" ? input.id : newId("trigger"),
    source,
    thread,
    actor: typeof input.actor === "string" ? input.actor : "",
    repo: typeof input.repo === "string" ? input.repo : "",
    text,
    strength: input.strength === "explicit" ? "explicit" : "normal",
    state: "received",
    at: now,
    decision: null,
    ticketId: null,
    reason: [],
  };
}

/** 创建 ticket（未落地到 store）。 */
export function createTicket(trigger, title, now = new Date().toISOString()) {
  const headline = title !== undefined && title !== "" ? title : firstLine(trigger.text);
  return {
    id: newId("ticket"),
    thread: trigger.thread,
    repo: trigger.repo,
    title: headline,
    state: "open",
    createdAt: now,
    updatedAt: now,
    triggerId: trigger.id,
    assignments: [],
    report: null,
  };
}

/** 创建 assignment。 */
export function createAssignment(ticket, now = new Date().toISOString()) {
  return {
    id: newId("assign"),
    ticketId: ticket.id,
    state: "starting",
    sessionId: "",
    createdAt: now,
    startedAt: null,
    endedAt: null,
    report: null,
    error: null,
  };
}

/** 第一条非空行，用作工单标题。 */
export function firstLine(text, limit = 80) {
  const line = String(text || "").split("\n").map(item => item.trim()).find(item => item !== "") || "（无标题）";
  return line.length > limit ? `${line.slice(0, limit)}…` : line;
}

/** 计算概览统计。 */
export function overview(state, now = Date.now(), windowMs = 24 * 3600 * 1000) {
  const since = now - windowMs;
  const triggers = (state.triggers || []).filter(item => Date.parse(item.at) >= since);
  return {
    flow: {
      received: triggers.length,
      filtered: triggers.filter(item => item.state === "ignored" && (item.reason || []).some(reason => reason.code !== "explicitRequest")).length,
      evaluated: triggers.filter(item => ["accepted", "ignored", "routed"].includes(item.state)).length,
      accepted: triggers.filter(item => item.state === "accepted" || item.state === "routed").length,
    },
    tickets: {
      open: (state.tickets || []).filter(item => item.state === "open").length,
      working: (state.tickets || []).filter(item => item.state === "working").length,
      ended: (state.tickets || []).filter(item => item.state === "ended").length,
    },
    executor: {
      running: (state.assignments || []).filter(item => item.state === "running").length,
      starting: (state.assignments || []).filter(item => item.state === "starting").length,
      waiting: (state.triggers || []).filter(item => item.state === "evaluating").length,
    },
  };
}
