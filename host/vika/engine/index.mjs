/**
 * vika 原生 vika 引擎：状态机 + 调度。
 *
 * 角色对应：
 *   Trigger  —— 环境事件（飞书/GitHub/手动/API）
 *   Thread   —— 同一仓库/话题的事件流；worker 可订阅
 *   Ticket   —— 需要执行的任务
 *   Worker   —— 一个 DSH 物理 session（由注入的 adapter 创建）
 *   Report   —— worker 汇报给 router 的结果
 *
 * Router 本体是 Vika（容器里的 agent）：它通过桥读取 evaluating 的 trigger、
 * 调用 decide() 接单或忽略；引擎只负责程序策略、状态机、并发和持久化。
 */
import { dirname, join } from "node:path";
import { JsonStore } from "./store.mjs";
import {
  applyPolicy,
  createAssignment,
  createTicket,
  createTrigger,
  ensureThread,
  newId,
  normalizeText,
  overview,
} from "./model.mjs";

const BLOCKS = ["policy", "eval", "executor", "channels", "prompts"];

export class VikaEngine {
  constructor({ stateDir, adapter = null, subscribe = true, now = () => new Date().toISOString() }) {
    this.stateDir = stateDir;
    this.adapter = adapter;
    this.subscribe = subscribe;
    this.now = now;
    this.store = new JsonStore(join(stateDir, "engine.json"));
    this.state = null;
    this.starting = false;
  }

  async init() {
    this.state = await this.store.load();
    return this;
  }

  snapshot() {
    return this.state;
  }

  get settings() {
    return this.state.settings;
  }

  /** 程序策略过滤 + 订阅直通 + 进入待评估。 */
  async receiveTrigger(input) {
    const trigger = createTrigger(input, this.now());
    const existing = this.state.triggers.find(item => item.id === trigger.id);
    if (existing !== undefined) return { trigger: existing, duplicate: true, needsRouter: existing.state === "evaluating" };
    const thread = ensureThread(this.state.threads, [trigger.thread]);
    thread.repo = trigger.repo || thread.repo;
    thread.triggers.push(trigger.id);
    thread.updatedAt = trigger.at;

    const policy = applyPolicy({ ...trigger, repo: trigger.repo || thread.repo }, this.state.settings.policy.value);
    trigger.reason = policy.reasons;
    this.state.triggers.push(trigger);
    await this.store.event({ type: "trigger", at: trigger.at, id: trigger.id, source: trigger.source, thread: trigger.thread, decision: policy.decision });

    if (policy.decision === "ignore") {
      trigger.state = "ignored";
      trigger.decision = "ignore";
      await this.store.mutate(() => undefined);
      return { trigger, ignored: true, needsRouter: false };
    }

    const subscribeEnabled = this.subscribe && this.state.settings.channels.value.subscribe !== false;
    if (subscribeEnabled) {
      const worker = thread.workers.map(id => this.state.workers[id]).find(item => item !== undefined && item.active === true);
      if (worker !== undefined) {
        trigger.state = "routed";
        trigger.decision = "routed";
        if (this.adapter && typeof this.adapter.send === "function") {
          try {
            await this.adapter.send({ sessionId: worker.sessionId, text: trigger.text, trigger, thread: thread.key });
          } catch (error) {
            trigger.state = "evaluating";
            trigger.decision = null;
            trigger.reason = [...trigger.reason, { code: "routeFailed", message: String(error?.message || error) }];
            await this.store.mutate(() => undefined);
            return { trigger, routed: false, needsRouter: true };
          }
        }
        this.state.decisions.push({
          id: newId("decision"),
          at: trigger.at,
          actor: "engine",
          triggerId: trigger.id,
          ticketId: worker.ticketId,
          kind: "routed",
          reason: [{ code: "subscriptionDirect" }],
        });
        await this.store.event({ type: "routed", at: trigger.at, id: trigger.id, worker: worker.sessionId });
        await this.store.mutate(() => undefined);
        return { trigger, routed: true, needsRouter: false };
      }
    }

    const evalMode = this.state.settings.eval.value.mode;
    const executor = this.state.settings.executor.value;
    if (evalMode === 'auto' && trigger.strength === 'explicit') {
      const auto = await this.accept(trigger, { actor: 'auto', reason: [{ code: 'explicitRequest' }, { code: 'evalAuto' }] });
      return { trigger: auto.trigger, routed: false, ignored: false, needsRouter: false, autoAccepted: true, ticket: auto.ticket };
    }
    if (executor.speculative === true && trigger.strength !== 'explicit') {
      const speculative = await this.accept(trigger, { actor: 'auto', reason: [{ code: 'speculative' }], speculative: true });
      return { trigger: speculative.trigger, routed: false, ignored: false, needsRouter: false, autoAccepted: true, speculative: true, ticket: speculative.ticket };
    }

    trigger.state = "evaluating";
    await this.store.mutate(() => undefined);
    return { trigger, routed: false, ignored: false, needsRouter: true };
  }

  /** 接单：建工单 + assignment，排队交给 executor。 */
  async accept(trigger, { actor = 'vika', reason = [], speculative = false, decision = null } = {}) {
    const record = decision || { id: newId('decision'), at: this.now(), actor, triggerId: trigger.id, kind: 'accept', reason: Array.isArray(reason) ? reason : [reason] };
    this.state.decisions.push(record);
    trigger.decision = 'accept';
    trigger.reason = record.reason;
    const thread = ensureThread(this.state.threads, [trigger.thread]);
    const ticket = createTicket({ ...trigger, repo: trigger.repo || thread.repo }, '', this.now());
    ticket.thread = trigger.thread;
    ticket.repo = trigger.repo || thread.repo;
    ticket.speculative = speculative === true;
    record.ticketId = ticket.id;
    const assignment = createAssignment(ticket, this.now());
    assignment.state = 'queued';
    ticket.assignments.push(assignment.id);
    ticket.state = 'open';
    thread.tickets.push(ticket.id);
    thread.updatedAt = ticket.updatedAt;
    this.state.tickets.push(ticket);
    this.state.assignments.push(assignment);
    trigger.state = 'accepted';
    trigger.ticketId = ticket.id;
    await this.store.event({ type: 'accept', at: record.at, trigger: trigger.id, ticket: ticket.id, assignment: assignment.id, speculative: ticket.speculative });
    await this.store.mutate(() => undefined);
    await this.drain();
    return { decision: record, trigger, ticket };
  }

  /** Vika Router 的判定：accept 建工单并启动 worker；ignore 落盘。 */
  async decide(triggerId, { kind, reason = [], actor = 'vika' } = {}) {
    const trigger = this.state.triggers.find(item => item.id === triggerId);
    if (trigger === undefined) throw new Error(`trigger 不存在：${triggerId}`);
    const decision = { id: newId('decision'), at: this.now(), actor, triggerId, kind, reason: Array.isArray(reason) ? reason : [reason] };
    if (kind !== 'accept') {
      this.state.decisions.push(decision);
      trigger.state = 'ignored';
      trigger.decision = kind;
      trigger.reason = decision.reason;
      await this.store.mutate(() => undefined);
      return { decision, trigger };
    }
    return this.accept(trigger, { actor, reason: decision.reason, decision });
  }
  /** worker 汇报：结束 assignment，必要时结束 ticket。 */
  async report(assignmentId, { summary = "", state = "ready", sessionId = "" } = {}) {
    const assignment = this.state.assignments.find(item => item.id === assignmentId);
    if (assignment === undefined) throw new Error(`assignment 不存在：${assignmentId}`);
    const ticket = this.state.tickets.find(item => item.id === assignment.ticketId);
    assignment.state = "ended";
    assignment.endedAt = this.now();
    assignment.report = { state, summary: normalizeText(summary, 20000), at: assignment.endedAt };
    const worker = Object.values(this.state.workers).find(item => item.assignmentId === assignment.id);
    if (worker !== undefined) {
      worker.active = false;
      worker.lastSeen = assignment.endedAt;
      if (sessionId !== "" && worker.sessionId !== sessionId) worker.replacedBy = sessionId;
    }
    if (ticket !== undefined) {
      ticket.state = "ended";
      ticket.report = assignment.report;
      ticket.updatedAt = assignment.endedAt;
      const thread = this.state.threads[ticket.thread];
      if (thread !== undefined) thread.updatedAt = assignment.endedAt;
    }
    await this.store.event({ type: "report", at: assignment.endedAt, assignment: assignment.id, ticket: assignment.ticketId, state });
    await this.store.mutate(() => undefined);
    await this.drain();
    return { assignment, ticket };
  }

  /** 心跳；worker 超时由面板/Watchdog 读取 lastSeen 判断。 */
  async heartbeat(sessionId) {
    const worker = Object.values(this.state.workers).find(item => item.sessionId === sessionId);
    if (worker === undefined) return null;
    worker.lastSeen = this.now();
    await this.store.mutate(() => undefined);
    return worker;
  }

  /** 按并发上限启动排队中的 assignment（由 adapter 创建真实 DSH session）。 */
  async drain() {
    if (this.starting) return;
    this.starting = true;
    try {
      const maxWorkers = Math.max(1, Number(this.state.settings.executor.value.maxWorkers) || 3);
      const paused = this.state.settings.executor.value.paused === true;
      if (paused || this.adapter === null) return;
      for (;;) {
        const running = this.state.assignments.filter(item => item.state === "running" || item.state === "starting").length;
        if (running >= maxWorkers) return;
        const next = this.state.assignments.find(item => item.state === "queued");
        if (next === undefined) return;
        const ticket = this.state.tickets.find(item => item.id === next.ticketId);
        const trigger = this.state.triggers.find(item => item.ticketId === next.ticketId) || null;
        next.state = "starting";
        try {
          const started = await this.adapter.start({ assignment: next, ticket, trigger });
          const sessionId = started !== null && started !== undefined && typeof started.sessionId === "string" ? started.sessionId : "";
          next.sessionId = sessionId;
          next.startedAt = this.now();
          next.state = "running";
          if (ticket !== undefined) {
            ticket.state = "working";
            ticket.updatedAt = next.startedAt;
          }
          const workerId = `worker-${next.id}`;
          this.state.workers[workerId] = {
            id: workerId,
            sessionId,
            assignmentId: next.id,
            ticketId: next.ticketId,
            active: true,
            createdAt: next.startedAt,
            lastSeen: next.startedAt,
          };
          const thread = ticket !== undefined ? this.state.threads[ticket.thread] : undefined;
          if (thread !== undefined && !thread.workers.includes(workerId)) thread.workers.push(workerId);
          await this.store.event({ type: "start", at: next.startedAt, assignment: next.id, sessionId, ticket: next.ticketId });
        } catch (error) {
          next.state = "ended";
          next.endedAt = this.now();
          next.error = String(error?.message || error);
          if (ticket !== undefined) {
            ticket.state = "blocked";
            ticket.report = { state: "error", summary: next.error, at: next.endedAt };
          }
          await this.store.event({ type: "start-failed", at: next.endedAt, assignment: next.id, error: next.error });
        }
        await this.store.mutate(() => undefined);
      }
    } finally {
      this.starting = false;
    }
  }

  /** 面板"暂停处理"开关。 */
  async setPaused(paused) {
    const block = this.state.settings.executor;
    block.value.paused = paused === true;
    block.revision += 1;
    await this.store.mutate(() => undefined);
    if (!block.value.paused) await this.drain();
    return this.state.settings.executor;
  }

  /** 写设置块（revision CAS），返回最新块。 */
  async updateSettings(blockName, value, revision) {
    if (!BLOCKS.includes(blockName)) throw new Error(`未知设置块：${blockName}`);
    const block = this.state.settings[blockName];
    if (typeof revision === "number" && revision !== block.revision) {
      throw new Error(`设置已被修改（当前 revision=${block.revision}）`);
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      block.value = { ...block.value, ...value };
    }
    block.revision += 1;
    const history = Array.isArray(this.state.settingsHistory) ? this.state.settingsHistory : [];
    history.push({
      at: this.now(),
      block: blockName,
      revision: block.revision,
      keys: value !== null && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [],
    });
    this.state.settingsHistory = history.slice(-100);
    await this.store.mutate(() => undefined);
    if (blockName === "executor") await this.drain();
    return block;
  }

  /** 仓库管理：Vika 作为 router 管理所有仓库。 */
  async addRepo({ name, path, defaultBranch = "main" } = {}) {
    const repo = {
      name: normalizeText(name, 120) || normalizeText(path, 200) || newId("repo"),
      path: normalizeText(path, 400),
      defaultBranch: normalizeText(defaultBranch, 80) || "main",
      createdAt: this.now(),
    };
    this.state.repos = this.state.repos.filter(item => item.name !== repo.name).concat(repo);
    await this.store.mutate(() => undefined);
    return repo;
  }

  async removeRepo(name) {
    this.state.repos = this.state.repos.filter(item => item.name !== name);
    await this.store.mutate(() => undefined);
    return { name };
  }

  overview() {
    return overview(this.state);
  }

  listTickets({ state } = {}) {
    const items = this.state.tickets.filter(item => state === undefined || state === "all" || item.state === state);
    return items.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  listTriggers({ state } = {}) {
    const items = this.state.triggers.filter(item => state === undefined || state === "all" || item.state === state);
    return items.slice().reverse();
  }

  listDecisions() {
    return this.state.decisions.slice().reverse();
  }

  listThreads() {
    return Object.values(this.state.threads).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  listWorkers() {
    return Object.values(this.state.workers).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  /** Watchdog：把长时间无心跳的 running worker 标记为 stale，并把工单标记 blocked。 */
  async sweep({ staleMs = 30 * 60 * 1000 } = {}) {
    const now = Date.parse(this.now());
    const issues = [];
    for (const worker of Object.values(this.state.workers)) {
      if (worker.active !== true) continue;
      const assignment = this.state.assignments.find(item => item.id === worker.assignmentId);
      if (assignment === undefined || assignment.state !== 'running') continue;
      const last = Date.parse(worker.lastSeen || assignment.startedAt || this.now());
      if (!Number.isFinite(last) || now - last < staleMs) continue;
      worker.active = false;
      worker.stale = true;
      assignment.state = 'ended';
      assignment.endedAt = this.now();
      assignment.error = `worker 超时无心跳（>${Math.round(staleMs / 60000)} 分钟）`;
      assignment.report = { state: 'stale', summary: assignment.error, at: assignment.endedAt };
      const ticket = this.state.tickets.find(item => item.id === assignment.ticketId);
      if (ticket !== undefined) {
        ticket.state = 'blocked';
        ticket.report = assignment.report;
        ticket.updatedAt = assignment.endedAt;
      }
      issues.push({ worker: worker.id, sessionId: worker.sessionId, ticketId: assignment.ticketId, message: assignment.error });
      await this.store.event({ type: 'stale', at: assignment.endedAt, worker: worker.id, ticket: assignment.ticketId });
    }
    if (issues.length > 0) await this.store.mutate(() => undefined);
    return issues;
  }

  /** 系统问题快照（面板/桥用）：stale worker、blocked 工单、启动失败。 */
  issues() {
    const stale = Object.values(this.state.workers).filter(item => item.stale === true);
    const blocked = this.state.tickets.filter(item => item.state === 'blocked');
    const failed = this.state.assignments.filter(item => item.state === 'ended' && item.error);
    return { stale, blocked, failed };
  }
  /** 批量评估：按 thread 汇总等待 Vika 判断的 trigger（Router 可一次处理一批）。 */
  batchPending() {
    const groups = new Map();
    for (const trigger of this.state.triggers) {
      if (trigger.state !== 'evaluating') continue;
      if (!groups.has(trigger.thread)) groups.set(trigger.thread, []);
      groups.get(trigger.thread).push(trigger);
    }
    return [...groups.entries()].map(([thread, triggers]) => ({ thread, triggers }));
  }
  /** 停止一个 worker：取消其 DSH 会话并把 assignment/工单收尾。 */
  async stopWorker(sessionId) {
    const worker = Object.values(this.state.workers).find(item => item.sessionId === sessionId && item.active === true);
    if (worker === undefined) throw new Error(`没有活跃 worker：${sessionId}`);
    if (this.adapter && typeof this.adapter.stop === 'function') {
      try { await this.adapter.stop(sessionId); } catch { /* 会话可能已结束 */ }
    }
    const assignment = this.state.assignments.find(item => item.id === worker.assignmentId);
    worker.active = false;
    worker.stopped = true;
    if (assignment !== undefined) {
      assignment.state = 'ended';
      assignment.endedAt = this.now();
      assignment.error = 'stopped by router';
      assignment.report = { state: 'stopped', summary: 'worker 被 Vika 停止', at: assignment.endedAt };
      const ticket = this.state.tickets.find(item => item.id === assignment.ticketId);
      if (ticket !== undefined) {
        ticket.state = 'ended';
        ticket.report = assignment.report;
        ticket.updatedAt = assignment.endedAt;
      }
    }
    await this.store.event({ type: 'stop', at: this.now(), sessionId, worker: worker.id });
    this.state.decisions.push({
      id: newId('decision'),
      at: this.now(),
      actor: 'panel',
      triggerId: '',
      ticketId: assignment?.ticketId || worker.ticketId || '',
      kind: 'stop',
      reason: [{ code: 'stoppedByPerson' }],
    });
    await this.store.mutate(() => undefined);
    await this.drain();
    return { sessionId, stopped: true };
  }

  /** 重新评估：把被过滤/忽略/未完成的触发放回 evaluating，由 Vika Router 重新判断。 */
  async requeueTrigger(triggerId) {
    const trigger = this.state.triggers.find(item => item.id === triggerId);
    if (trigger === undefined) throw new Error(`trigger 不存在：${triggerId}`);
    if (trigger.ticketId || trigger.state === 'accepted' || trigger.state === 'routed') {
      throw new Error('已接单的触发不能重新评估');
    }
    if (trigger.state === 'evaluating') return { trigger, requeued: false };
    trigger.state = 'evaluating';
    trigger.decision = null;
    trigger.reason = [];
    await this.store.event({ type: 'requeue', at: this.now(), trigger: trigger.id });
    await this.store.mutate(() => undefined);
    return { trigger, requeued: true };
  }

  /** 重试工单：保留原派工记录，追加一次新派工；执行中的工单先停止。 */
  async retryTicket(ticketId) {
    const ticket = this.state.tickets.find(item => item.id === ticketId);
    if (ticket === undefined) throw new Error(`工单不存在：${ticketId}`);
    if (ticket.state === 'working') throw new Error('工单仍在执行，先停止再重试');
    const live = this.state.assignments.find(item => item.ticketId === ticket.id && ['queued', 'starting', 'running'].includes(item.state));
    if (live !== undefined) throw new Error('工单已有未结束的派工');
    const assignment = createAssignment(ticket, this.now());
    assignment.state = 'queued';
    ticket.assignments.push(assignment.id);
    ticket.state = 'open';
    ticket.report = null;
    ticket.updatedAt = this.now();
    this.state.assignments.push(assignment);
    this.state.decisions.push({
      id: newId('decision'),
      at: this.now(),
      actor: 'panel',
      triggerId: ticket.triggerId || '',
      ticketId: ticket.id,
      kind: 'reopen',
      reason: [{ code: 'retried' }],
    });
    await this.store.event({ type: 'retry', at: this.now(), ticket: ticket.id, assignment: assignment.id });
    await this.store.mutate(() => undefined);
    await this.drain();
    const updated = this.state.tickets.find(item => item.id === ticket.id);
    return { ticket: updated, assignment };
  }

  /** 停止工单：有活跃 worker 时取消会话；没有 worker 时直接收尾排队派工。 */
  async stopTicket(ticketId) {
    const ticket = this.state.tickets.find(item => item.id === ticketId);
    if (ticket === undefined) throw new Error(`工单不存在：${ticketId}`);
    if (ticket.state === 'ended') return { ticket, stopped: false };
    const worker = Object.values(this.state.workers).find(item => item.ticketId === ticket.id && item.active === true);
    if (worker !== undefined) {
      await this.stopWorker(worker.sessionId);
      const updated = this.state.tickets.find(item => item.id === ticket.id);
      return { ticket: updated, stopped: true };
    }
    for (const assignment of this.state.assignments) {
      if (assignment.ticketId !== ticket.id) continue;
      if (!['queued', 'starting', 'running'].includes(assignment.state)) continue;
      assignment.state = 'ended';
      assignment.endedAt = this.now();
      assignment.error = 'stopped by person';
      assignment.report = { state: 'stopped', summary: '人工停止', at: assignment.endedAt };
    }
    ticket.state = 'ended';
    ticket.report = { state: 'stopped', summary: '人工停止', at: this.now() };
    ticket.updatedAt = ticket.report.at;
    this.state.decisions.push({
      id: newId('decision'),
      at: this.now(),
      actor: 'panel',
      triggerId: ticket.triggerId || '',
      ticketId: ticket.id,
      kind: 'stop',
      reason: [{ code: 'stoppedByPerson' }],
    });
    await this.store.event({ type: 'stop', at: this.now(), ticket: ticket.id });
    await this.store.mutate(() => undefined);
    await this.drain();
    return { ticket, stopped: true };
  }

  /** 取消线程订阅：只断开后续事件的直通，不结束已在运行的 worker。 */
  async unsubscribeThread(threadKey) {
    const thread = this.state.threads[threadKey];
    if (thread === undefined) throw new Error(`线程不存在：${threadKey}`);
    const removed = Array.isArray(thread.workers) ? thread.workers.slice() : [];
    thread.workers = [];
    thread.updatedAt = this.now();
    await this.store.event({ type: 'unsubscribe', at: this.now(), thread: threadKey, workers: removed });
    await this.store.mutate(() => undefined);
    return { thread, removed };
  }
}
