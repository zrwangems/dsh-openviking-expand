import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { VikaEngine } from "../host/vika/engine/index.mjs";
import {
  decisionList,
  overviewView,
  searchView,
  settingsView,
  sourceRows,
  threadList,
  threadView,
  ticketList,
  ticketView,
} from "../host/vika/views.mjs";

function fakeAdapter() {
  return {
    starts: [],
    sends: [],
    async start({ assignment, ticket }) {
      this.starts.push({ assignment: assignment.id, ticket: ticket.id });
      return { sessionId: `session-${ticket.id}` };
    },
    async send(message) {
      this.sends.push(message);
      return { ok: true };
    },
    stops: 0,
    async stop() {
      this.stops += 1;
    },
  };
}

async function engineWith(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "vika-views-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const adapter = options.adapter === undefined ? fakeAdapter() : options.adapter;
  const engine = new VikaEngine({ stateDir: dir, adapter, ...options.engine });
  await engine.init();
  return { engine, adapter, dir };
}

test("视图：概览/来源/线程/工单/决定/搜索/设置", async t => {
  const { engine } = await engineWith(t);
  await engine.updateSettings("policy", {
    sources: { feishu: { mode: "candidate", allowed: [{ id: "owner" }] } },
    rules: [{ id: "rule-1", name: "只允许明确任务", enabled: true, when: { source: "manual" }, action: "ignore" }],
  });
  const blocked = await engine.receiveTrigger({ source: "feishu", thread: "oc_view", actor: "stranger", text: "忽略我" });
  assert.equal(blocked.ignored, true);
  const accepted = await engine.receiveTrigger({ source: "feishu", thread: "oc_view", actor: "owner", text: "写一个文件", strength: "explicit" });
  const decided = await engine.decide(accepted.trigger.id, { kind: "accept", reason: [{ code: "explicitRequest" }] });
  const assignment = engine.state.assignments.find(item => item.ticketId === decided.ticket.id);
  await engine.report(assignment.id, { summary: "完成", state: "ready" });

  const overview = overviewView(engine.state);
  assert.equal(overview.flow.received, 2);
  assert.equal(overview.flow.filtered, 1);
  assert.equal(overview.flow.accepted, 1);
  assert.equal(overview.tickets.ended, 1);
  assert.equal(overview.person.length, 0);
  assert.equal(overview.setup.ready, true);

  const sources = sourceRows(engine.state);
  assert.equal(sources.length, 4);
  const feishu = sources.find(item => item.id === "feishu");
  assert.equal(feishu.stats.received, 2);
  assert.equal(feishu.stats.filtered, 1);
  assert.equal(feishu.filtered.length, 1);
  assert.equal(feishu.filtered[0].reason[0].code, "actorNotAllowed");

  const threads = threadList(engine.state, "all");
  assert.equal(threads.length, 1);
  assert.equal(threads[0].ticketCount, 1);
  assert.equal(threads[0].state, "ended");
  const detail = threadView(engine.state, "feishu:oc_view");
  assert.equal(detail.triggers.length, 2);
  assert.equal(detail.decisions.length, 1);
  assert.equal(detail.tickets.length, 1);
  assert.equal(detail.tickets[0].report.summary, "完成");

  const tickets = ticketList(engine.state, { filter: "ended" });
  assert.equal(tickets.items.length, 1);
  const ticket = ticketView(engine.state, decided.ticket.id);
  assert.equal(ticket.assignments.length, 1);
  assert.equal(ticket.assignments[0].report.summary, "完成");
  assert.equal(ticket.trigger.id, accepted.trigger.id);
  assert.equal(ticket.decision.kind, "accept");

  const decisions = decisionList(engine.state, { filter: "work" });
  assert.equal(decisions.items.length, 1);
  assert.equal(decisions.items[0].kind, "accept");

  const search = searchView(engine.state, "写一个文件");
  assert.equal(search.items.length, 1);
  assert.equal(search.tickets.length, 1);

  const settings = settingsView(engine.state, { workspace: "D:/work" });
  assert.equal(settings.blocks.eval.value.mode, "observe");
  assert.equal(settings.history.length, 1);
  assert.equal(settings.deployment.workspace, "D:/work");
});

test("策略规则：disabled 不生效，命中时 reason 带规则名", async t => {
  const { engine } = await engineWith(t);
  await engine.updateSettings("policy", {
    rules: [
      { id: "off", name: "停用规则", enabled: false, when: { source: "manual" }, action: "ignore" },
      { id: "on", name: "拦截手动任务", enabled: true, when: { source: "manual" }, action: "ignore" },
    ],
  });
  const result = await engine.receiveTrigger({ source: "manual", thread: "rule", text: "任务", strength: "explicit" });
  assert.equal(result.ignored, true);
  assert.equal(result.trigger.reason[0].code, "ruleIgnore");
  assert.equal(result.trigger.reason[0].name, "拦截手动任务");
});

test("重新评估：被过滤的触发回到 evaluating", async t => {
  const { engine } = await engineWith(t);
  await engine.updateSettings("policy", { sources: { manual: { mode: "ignore" } } });
  const ignored = await engine.receiveTrigger({ source: "manual", thread: "req", text: "任务", strength: "explicit" });
  assert.equal(ignored.trigger.state, "ignored");
  const requeued = await engine.requeueTrigger(ignored.trigger.id);
  assert.equal(requeued.requeued, true);
  assert.equal(requeued.trigger.state, "evaluating");
  assert.equal(engine.listTriggers({ state: "evaluating" }).length, 1);
  await engine.decide(ignored.trigger.id, { kind: "accept" });
  await assert.rejects(() => engine.requeueTrigger(ignored.trigger.id), /已接单/);
});

test("重试工单：追加派工并重新启动", async t => {
  const { engine } = await engineWith(t);
  const received = await engine.receiveTrigger({ source: "manual", thread: "retry", text: "任务", strength: "explicit" });
  const accepted = await engine.decide(received.trigger.id, { kind: "accept" });
  const first = engine.state.assignments.find(item => item.ticketId === accepted.ticket.id);
  await engine.report(first.id, { summary: "第一次完成" });
  const retried = await engine.retryTicket(accepted.ticket.id);
  assert.equal(retried.ticket.state, "working");
  assert.equal(retried.ticket.report, null);
  assert.equal(retried.ticket.assignments.length, 2);
  assert.equal(retried.ticket.assignments[0], first.id);
  const decisions = decisionList(engine.state, { filter: "work" });
  assert.equal(decisions.items.some(item => item.kind === "reopen"), true);
});

test("停止工单：阻塞工单无 worker 时直接收尾", async t => {
  const { engine } = await engineWith(t);
  const received = await engine.receiveTrigger({ source: "manual", thread: "stop-blocked", text: "任务", strength: "explicit" });
  const accepted = await engine.decide(received.trigger.id, { kind: "accept" });
  const worker = engine.listWorkers()[0];
  worker.lastSeen = new Date(Date.now() - 3600 * 1000).toISOString();
  await engine.sweep({ staleMs: 60 * 1000 });
  assert.equal(engine.state.tickets.find(item => item.id === accepted.ticket.id).state, "blocked");
  const stopped = await engine.stopTicket(accepted.ticket.id);
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.ticket.state, "ended");
  assert.equal(stopped.ticket.report.state, "stopped");
  const again = await engine.stopTicket(accepted.ticket.id);
  assert.equal(again.stopped, false);
});

test("停止工单：运行中 worker 走 adapter.stop", async t => {
  const { engine, adapter } = await engineWith(t);
  const received = await engine.receiveTrigger({ source: "manual", thread: "stop-live", text: "任务", strength: "explicit" });
  const accepted = await engine.decide(received.trigger.id, { kind: "accept" });
  const stopped = await engine.stopTicket(accepted.ticket.id);
  assert.equal(stopped.stopped, true);
  assert.equal(adapter.stops, 1);
  assert.equal(stopped.ticket.state, "ended");
});

test("取消线程订阅：断开直通但不结束 worker", async t => {
  const { engine, adapter } = await engineWith(t);
  const first = await engine.receiveTrigger({ source: "feishu", thread: "oc_unsub", text: "任务", strength: "explicit" });
  await engine.decide(first.trigger.id, { kind: "accept" });
  assert.equal(engine.state.threads["feishu:oc_unsub"].workers.length, 1);
  const removed = await engine.unsubscribeThread("feishu:oc_unsub");
  assert.equal(removed.removed.length, 1);
  assert.equal(engine.state.threads["feishu:oc_unsub"].workers.length, 0);
  assert.equal(engine.listWorkers()[0].active, true);
  const second = await engine.receiveTrigger({ source: "feishu", thread: "oc_unsub", text: "补充" });
  assert.equal(second.routed, false);
  assert.equal(adapter.sends.length, 0);
});

test("设置历史：每次保存记录块与 revision", async t => {
  const { engine } = await engineWith(t);
  await engine.updateSettings("eval", { mode: "auto" });
  await engine.updateSettings("executor", { maxWorkers: 2 });
  assert.equal(engine.state.settingsHistory.length, 2);
  assert.equal(engine.state.settingsHistory[0].block, "eval");
  assert.equal(engine.state.settingsHistory[1].block, "executor");
  assert.equal(engine.state.settingsHistory[1].revision, 1);
  const view = settingsView(engine.state);
  assert.equal(view.history[0].block, "executor");
});
