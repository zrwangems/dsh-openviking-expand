/**
 * vika 面板视图层：把引擎状态整理成面板要用的只读结构。
 *
 * 这里只做纯函数转换，不改状态、不写磁盘；动作仍由 VikaEngine 负责。
 * 字段命名尽量贴近 vika 的面板语义（ticket stage、flow、problems），
 * 但实现独立，不复制原型代码。
 */

export const SOURCE_IDS = ["feishu", "github", "manual", "api"];

export const SOURCE_LABELS = {
  feishu: "飞书",
  github: "GitHub",
  manual: "手动",
  api: "API",
};

const POLICY_FILTER_CODES = new Set([
  "sourceIgnore",
  "actorNotAllowed",
  "repoDenied",
  "repoNotAllowed",
  "ruleIgnore",
  "ruleRequireExplicit",
]);

/** 截断到单行，面板预览用。 */
export function clip(text, limit = 120) {
  const line = String(text === undefined || text === null ? "" : text)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(item => item.trim())
    .find(item => item !== "") || "";
  return line.length > limit ? `${line.slice(0, limit)}…` : line;
}

export function sourceLabel(source) {
  return SOURCE_LABELS[source] || source || "未知";
}

/** 线程显示名：优先仓库，其次“来源 · 短键”。 */
export function threadTitle(thread) {
  if (thread === undefined || thread === null) return "";
  if (typeof thread.repo === "string" && thread.repo !== "") return thread.repo;
  const key = String(thread.key || "");
  const index = key.indexOf(":");
  const raw = index >= 0 ? key.slice(index + 1) : key;
  return `${sourceLabel(thread.source)} · ${clip(raw, 80)}`;
}

/** 是否被程序层策略过滤（不是 Vika 的语义忽略）。 */
export function isPolicyFiltered(trigger) {
  if (trigger === undefined || trigger === null) return false;
  if (trigger.state !== "ignored") return false;
  return Array.isArray(trigger.reason) && trigger.reason.some(item => POLICY_FILTER_CODES.has(item.code));
}

/** 工单阶段：面板用它决定状态点、筛选和文案。 */
export function ticketStage(ticket, assignments = []) {
  if (ticket === undefined || ticket === null) return "ended";
  if (ticket.state === "blocked") return "person";
  if (ticket.state === "ended") return "ended";
  if (ticket.state === "working") {
    return assignments.some(item => item.state === "running" || item.state === "starting") ? "working" : "idle";
  }
  return "open";
}

function sortedAssignments(state, ticketId) {
  return state.assignments
    .filter(item => item.ticketId === ticketId)
    .slice()
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

function triggerOfTicket(state, ticket) {
  if (ticket === undefined || ticket === null) return null;
  return state.triggers.find(item => item.id === ticket.triggerId) || null;
}

/** 触发行。 */
export function triggerRow(trigger) {
  if (trigger === undefined || trigger === null) return null;
  return {
    id: trigger.id,
    source: trigger.source,
    sourceLabel: sourceLabel(trigger.source),
    thread: trigger.thread,
    actor: trigger.actor || "",
    repo: trigger.repo || "",
    text: trigger.text || "",
    preview: clip(trigger.text, 180),
    strength: trigger.strength,
    state: trigger.state,
    at: trigger.at,
    decision: trigger.decision || null,
    ticketId: trigger.ticketId || "",
    reason: Array.isArray(trigger.reason) ? trigger.reason : [],
    filtered: isPolicyFiltered(trigger),
  };
}

/** 工单行。 */
export function ticketRow(state, ticket) {
  if (ticket === undefined || ticket === null) return null;
  const assignments = sortedAssignments(state, ticket.id);
  const latest = assignments.length > 0 ? assignments[assignments.length - 1] : null;
  const running = assignments.slice().reverse().find(item => item.state === "running" || item.state === "starting") || null;
  const trigger = triggerOfTicket(state, ticket);
  const thread = state.threads[ticket.thread];
  const report = ticket.report || (latest !== null ? latest.report : null);
  const stage = ticketStage(ticket, assignments);
  return {
    id: ticket.id,
    title: ticket.title || "（无标题）",
    state: ticket.state,
    stage,
    source: trigger !== null ? trigger.source : (thread !== undefined ? thread.source : ""),
    sourceLabel: sourceLabel(trigger !== null ? trigger.source : (thread !== undefined ? thread.source : "")),
    actor: trigger !== null ? trigger.actor || "" : "",
    repo: ticket.repo || (thread !== undefined ? thread.repo || "" : ""),
    thread: ticket.thread || "",
    threadTitle: thread !== undefined ? threadTitle(thread) : ticket.thread || "",
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    speculative: ticket.speculative === true,
    report: report === undefined ? null : report,
    sessionId: running !== null ? running.sessionId : (latest !== null ? latest.sessionId : ""),
    assignments: assignments.length,
    triggerId: ticket.triggerId || "",
    actions: {
      retry: ticket.state === "ended" || ticket.state === "blocked",
      stop: ticket.state !== "ended",
    },
  };
}

/** 线程行。 */
export function threadRow(thread, state) {
  if (thread === undefined || thread === null) return null;
  const triggers = (Array.isArray(thread.triggers) ? thread.triggers : [])
    .map(id => state.triggers.find(item => item.id === id))
    .filter(Boolean);
  const tickets = (Array.isArray(thread.tickets) ? thread.tickets : [])
    .map(id => state.tickets.find(item => item.id === id))
    .filter(Boolean);
  const workers = (Array.isArray(thread.workers) ? thread.workers : [])
    .map(id => state.workers[id])
    .filter(Boolean);
  const activeWorkers = workers.filter(item => item.active === true);
  const evaluating = triggers.filter(item => item.state === "evaluating");
  const allEnded = tickets.length > 0 && tickets.every(item => item.state === "ended");
  const latest = triggers.slice().sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null;
  const status = evaluating.length > 0
    ? "evaluating"
    : activeWorkers.length > 0
      ? "working"
      : tickets.length === 0
        ? "idle"
        : allEnded
          ? "ended"
          : "open";
  return {
    key: thread.key,
    title: threadTitle(thread),
    repo: thread.repo || "",
    source: thread.source || String(thread.key || "").split(":")[0],
    sourceLabel: sourceLabel(thread.source || String(thread.key || "").split(":")[0]),
    createdAt: thread.createdAt,
    latestAt: thread.updatedAt || (latest !== null ? latest.at : thread.createdAt),
    triggerCount: triggers.length,
    ticketCount: tickets.length,
    workerCount: activeWorkers.length,
    subscribed: activeWorkers.length > 0,
    evaluating: evaluating.length > 0,
    state: status,
  };
}

/** 决定行。 */
export function decisionRow(decision, state) {
  if (decision === undefined || decision === null) return null;
  const trigger = state.triggers.find(item => item.id === decision.triggerId) || null;
  const ticket = decision.ticketId ? state.tickets.find(item => item.id === decision.ticketId) : null;
  const thread = trigger !== null ? trigger.thread : (ticket !== null ? ticket.thread : "");
  const reason = Array.isArray(decision.reason) ? decision.reason : [];
  return {
    id: decision.id,
    kind: decision.kind,
    at: decision.at,
    actor: decision.actor || "",
    triggerId: decision.triggerId || "",
    ticketId: decision.ticketId || (ticket !== null ? ticket.id : ""),
    thread,
    preview: trigger !== null ? clip(trigger.text, 160) : (ticket !== null ? ticket.title : ""),
    source: trigger !== null ? trigger.source : "",
    sourceLabel: sourceLabel(trigger !== null ? trigger.source : ""),
    reason,
  };
}

/** 概览页数据。 */
export function overviewView(state, now = Date.now()) {
  const since = now - 24 * 3600 * 1000;
  const windowTriggers = state.triggers.filter(item => Date.parse(item.at) >= since);
  const flow = {
    received: windowTriggers.length,
    filtered: windowTriggers.filter(isPolicyFiltered).length,
    judged: windowTriggers.filter(item => ["accepted", "ignored", "routed"].includes(item.state)).length,
    accepted: windowTriggers.filter(item => item.state === "accepted" || item.state === "routed").length,
    dropped: 0,
  };
  const runningAssignments = state.assignments.filter(item => item.state === "running").length;
  const queuedAssignments = state.assignments.filter(item => item.state === "queued" || item.state === "starting").length;
  const workingTickets = state.tickets.filter(item => item.state === "working").length;
  const paused = state.settings.executor.value.paused === true;
  const person = state.tickets
    .filter(item => item.state === "blocked")
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 20)
    .map(item => ticketRow(state, item));

  const problems = [];
  if (paused) {
    problems.push({ kind: "paused", title: "处理已暂停", detail: "新的评估、派工和回复都会等待恢复", action: "resume" });
  }
  const seenTickets = new Set();
  for (const worker of Object.values(state.workers)) {
    if (worker.stale !== true) continue;
    const row = state.tickets.find(item => item.id === worker.ticketId);
    if (row === undefined) continue;
    seenTickets.add(row.id);
    problems.push({
      kind: "stale",
      title: "worker 超时无心跳",
      detail: `${worker.sessionId || worker.id} · ${row.title || row.id}`,
      ticketId: row.id,
      sessionId: worker.sessionId || "",
    });
  }
  for (const ticket of state.tickets) {
    if (ticket.state !== "blocked") continue;
    if (seenTickets.has(ticket.id)) continue;
    problems.push({
      kind: "blocked",
      title: "工单受阻",
      detail: ticket.report !== null && ticket.report !== undefined && ticket.report.summary
        ? clip(ticket.report.summary, 160)
        : ticket.title || ticket.id,
      ticketId: ticket.id,
    });
  }
  for (const assignment of state.assignments) {
    if (assignment.state !== "ended" || !assignment.error) continue;
    const ticket = state.tickets.find(item => item.id === assignment.ticketId);
    if (ticket === undefined || ticket.state === "ended") continue;
    problems.push({
      kind: "failed",
      title: "派工启动失败",
      detail: clip(assignment.error, 160),
      ticketId: ticket.id,
    });
  }
  const idle = Math.max(0, workingTickets - runningAssignments);
  return {
    person,
    problems,
    flow,
    executor: {
      running: runningAssignments,
      maxWorkers: Math.max(1, Number(state.settings.executor.value.maxWorkers) || 3),
      queued: queuedAssignments,
      idle,
      paused,
      speculative: state.settings.executor.value.speculative === true,
    },
    tickets: {
      open: state.tickets.filter(item => item.state === "open").length,
      working: workingTickets,
      blocked: state.tickets.filter(item => item.state === "blocked").length,
      ended: state.tickets.filter(item => item.state === "ended").length,
    },
    setup: { ready: true },
  };
}

/** 来源页：四个渠道的状态与 24 小时计数。 */
export function sourceRows(state, now = Date.now()) {
  const since = now - 24 * 3600 * 1000;
  const channels = state.settings.channels.value;
  return SOURCE_IDS.map(id => {
    const enabled = id === "manual" || id === "api" ? true : channels[id] !== false;
    const triggers = state.triggers.filter(item => item.source === id && Date.parse(item.at) >= since);
    const filtered = triggers.filter(isPolicyFiltered).map(triggerRow).slice(0, 10);
    const latest = triggers.slice().sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null;
    return {
      id,
      title: sourceLabel(id),
      enabled,
      state: !enabled ? "off" : triggers.length > 0 ? "running" : "idle",
      note: id === "feishu" || id === "github" ? "由 Vika 容器消费；凭据与监听在 Vika 侧配置" : "由插件或手动调用直接送入引擎",
      stats: {
        received: triggers.length,
        filtered: filtered.length,
        lastAt: latest !== null ? latest.at : "",
      },
      filtered,
    };
  });
}

/** 线程列表。 */
export function threadList(state, filter = "all") {
  const rows = Object.values(state.threads).map(thread => threadRow(thread, state)).filter(Boolean);
  const since = Date.now() - 24 * 3600 * 1000;
  const selected = rows.filter(row => {
    if (filter === "subscribed") return row.subscribed;
    if (filter === "evaluating") return row.evaluating;
    if (filter === "recent") return Date.parse(row.latestAt) >= since;
    return true;
  });
  return selected.sort((a, b) => String(b.latestAt).localeCompare(String(a.latestAt)));
}

/** 线程详情。 */
export function threadView(state, key) {
  const thread = state.threads[key];
  if (thread === undefined) return null;
  const row = threadRow(thread, state);
  const triggerIds = Array.isArray(thread.triggers) ? thread.triggers : [];
  const triggers = triggerIds
    .map(id => state.triggers.find(item => item.id === id))
    .filter(Boolean)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .map(triggerRow);
  const ticketIds = new Set(Array.isArray(thread.tickets) ? thread.tickets : []);
  const decisions = state.decisions
    .filter(item => triggerIds.includes(item.triggerId) || (item.ticketId && ticketIds.has(item.ticketId)))
    .slice()
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .map(item => decisionRow(item, state));
  const tickets = [...ticketIds]
    .map(id => state.tickets.find(item => item.id === id))
    .filter(Boolean)
    .map(item => ticketRow(state, item))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const workers = (Array.isArray(thread.workers) ? thread.workers : [])
    .map(id => state.workers[id])
    .filter(Boolean)
    .map(worker => ({
      id: worker.id,
      sessionId: worker.sessionId,
      active: worker.active === true,
      stale: worker.stale === true,
      ticketId: worker.ticketId,
      lastSeen: worker.lastSeen,
    }));
  const evaluating = triggers.filter(item => item.state === "evaluating");
  let evaluatingInfo = null;
  if (evaluating.length > 0) {
    const latest = evaluating[0];
    const timeout = Math.max(10, Number(state.settings.eval.value.timeoutSeconds) || 120);
    evaluatingInfo = {
      count: evaluating.length,
      strength: latest.strength,
      deadline: new Date(Date.parse(latest.at) + timeout * 1000).toISOString(),
    };
  }
  return { ...row, triggers, decisions, tickets, workers, evaluatingInfo, earlier: false };
}

/** 决定列表。 */
export function decisionList(state, { filter = "work", window = "", limit = 30 } = {}) {
  const kindSets = {
    work: ["accept", "reopen", "routed"],
    stop: ["stop"],
    ignore: ["ignore"],
    unavailable: ["unavailable"],
    all: null,
  };
  const kinds = kindSets[filter] !== undefined ? kindSets[filter] : null;
  const since = window === "24h" ? Date.now() - 24 * 3600 * 1000 : null;
  const items = state.decisions
    .filter(item => kinds === null || kinds.includes(item.kind))
    .filter(item => since === null || Date.parse(item.at) >= since)
    .slice()
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .map(item => decisionRow(item, state));
  return { items: items.slice(0, limit), total: items.length };
}

/** 工单列表。 */
export function ticketList(state, { filter = "open", limit = 30 } = {}) {
  const rows = state.tickets.map(ticket => ticketRow(state, ticket)).filter(Boolean);
  const selected = rows.filter(row => {
    if (filter === "open") return row.state === "open" || row.state === "working";
    if (filter === "person") return row.stage === "person";
    if (filter === "working") return row.stage === "working";
    if (filter === "idle") return row.stage === "idle";
    if (filter === "ended") return row.stage === "ended";
    return true;
  });
  selected.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return { items: selected.slice(0, limit), total: selected.length };
}

/** 工单详情。 */
export function ticketView(state, id) {
  const ticket = state.tickets.find(item => item.id === id);
  if (ticket === undefined) return null;
  const row = ticketRow(state, ticket);
  const assignments = sortedAssignments(state, id)
    .slice()
    .reverse()
    .map(item => ({
      id: item.id,
      state: item.state,
      sessionId: item.sessionId || "",
      createdAt: item.createdAt,
      startedAt: item.startedAt || null,
      endedAt: item.endedAt || null,
      report: item.report || null,
      error: item.error || null,
    }));
  const trigger = triggerOfTicket(state, ticket);
  const decision = state.decisions
    .filter(item => item.ticketId === id || (trigger !== null && item.triggerId === trigger.id))
    .slice()
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null;
  const thread = state.threads[ticket.thread];
  return {
    ...row,
    trigger: trigger !== null ? triggerRow(trigger) : null,
    decision: decision !== null ? decisionRow(decision, state) : null,
    assignments,
    threads: thread !== undefined ? [threadRow(thread, state)] : [],
  };
}

/** 设置页：设置块 + 保存历史 + 部署信息。 */
export function settingsView(state, runtime = {}) {
  return {
    blocks: state.settings,
    history: (Array.isArray(state.settingsHistory) ? state.settingsHistory : []).slice(-30).reverse(),
    deployment: runtime,
  };
}

/** 搜索：工单、线程、触发。 */
export function searchView(state, text, limit = 20) {
  const query = String(text === undefined || text === null ? "" : text).trim().toLowerCase();
  if (query === "") return { tickets: [], threads: [], items: [] };
  const match = value => String(value === undefined || value === null ? "" : value).toLowerCase().includes(query);
  const tickets = state.tickets
    .filter(item => match(item.id) || match(item.title) || match(item.thread) || match(item.repo))
    .slice(0, limit)
    .map(item => ticketRow(state, item));
  const threads = Object.values(state.threads)
    .filter(item => match(item.key) || match(item.repo))
    .slice(0, limit)
    .map(item => threadRow(item, state));
  const items = state.triggers
    .filter(item => match(item.id) || match(item.text) || match(item.actor) || match(item.thread) || match(item.repo))
    .slice(-limit)
    .reverse()
    .map(triggerRow);
  return { tickets, threads, items };
}
