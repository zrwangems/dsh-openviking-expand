import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { VikaEngine } from "../host/vika/engine/index.mjs";

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
  const dir = await mkdtemp(join(tmpdir(), "vika-engine-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const adapter = options.adapter === undefined ? fakeAdapter() : options.adapter;
  const engine = new VikaEngine({ stateDir: dir, adapter, ...options.engine });
  await engine.init();
  return { engine, adapter, dir };
}

test("程序策略：未允许的发送者被忽略", async t => {
  const { engine } = await engineWith(t);
  await engine.updateSettings("policy", { sources: { feishu: { mode: "candidate", allowed: [{ id: "owner" }] } } });
  const result = await engine.receiveTrigger({ source: "feishu", thread: "oc_1", actor: "stranger", text: "帮我改一下" });
  assert.equal(result.ignored, true);
  assert.equal(result.trigger.state, "ignored");
  assert.equal(result.needsRouter, false);
  assert.equal(engine.listTickets().length, 0);
});

test("接单：建工单、启动 worker、线程订阅", async t => {
  const { engine, adapter } = await engineWith(t);
  const received = await engine.receiveTrigger({ source: "feishu", thread: "oc_1", actor: "owner", text: "创建 a.txt", strength: "explicit" });
  assert.equal(received.needsRouter, true);
  assert.equal(received.trigger.state, "evaluating");

  const accepted = await engine.decide(received.trigger.id, { kind: "accept", reason: [{ code: "explicit" }] });
  const ticket = accepted.ticket;
  assert.equal(ticket.state, "working");
  assert.equal(adapter.starts.length, 1);
  const assignment = engine.state.assignments.find(item => item.ticketId === ticket.id);
  assert.equal(assignment.state, "running");
  assert.equal(assignment.sessionId, `session-${ticket.id}`);

  const workers = engine.listWorkers();
  assert.equal(workers.length, 1);
  assert.equal(workers[0].active, true);
  const thread = engine.state.threads["feishu:oc_1"];
  assert.equal(thread.workers.length, 1);
});

test("订阅直通：同一线程的后续事件直接发给 worker", async t => {
  const { engine, adapter } = await engineWith(t);
  const first = await engine.receiveTrigger({ source: "feishu", thread: "oc_1", actor: "owner", text: "任务一", strength: "explicit" });
  await engine.decide(first.trigger.id, { kind: "accept" });
  const second = await engine.receiveTrigger({ source: "feishu", thread: "oc_1", actor: "owner", text: "补充一句" });
  assert.equal(second.routed, true);
  assert.equal(second.trigger.state, "routed");
  assert.equal(adapter.sends.length, 1);
  assert.equal(adapter.sends[0].text, "补充一句");
});

test("汇报：结束 assignment 与 ticket", async t => {
  const { engine } = await engineWith(t);
  const received = await engine.receiveTrigger({ source: "github", thread: "o/r#1", actor: "v", text: "修复 bug", strength: "explicit" });
  const accepted = await engine.decide(received.trigger.id, { kind: "accept" });
  const assignment = engine.state.assignments.find(item => item.ticketId === accepted.ticket.id);
  await engine.report(assignment.id, { summary: "已完成", state: "ready" });
  assert.equal(engine.listTickets()[0].state, "ended");
  assert.equal(engine.listWorkers()[0].active, false);
  assert.equal(engine.listTickets()[0].report.summary, "已完成");
});

test("并发上限：第二个工单排队，汇报后启动", async t => {
  const { engine, adapter } = await engineWith(t);
  await engine.updateSettings("executor", { maxWorkers: 1 });
  const a = await engine.receiveTrigger({ source: "feishu", thread: "oc_a", text: "A", strength: "explicit" });
  const b = await engine.receiveTrigger({ source: "feishu", thread: "oc_b", text: "B", strength: "explicit" });
  const ticketA = (await engine.decide(a.trigger.id, { kind: "accept" })).ticket;
  const ticketB = (await engine.decide(b.trigger.id, { kind: "accept" })).ticket;
  assert.equal(adapter.starts.length, 1);
  const assignmentB = engine.state.assignments.find(item => item.ticketId === ticketB.id);
  assert.equal(assignmentB.state, "queued");

  const assignmentA = engine.state.assignments.find(item => item.ticketId === ticketA.id);
  await engine.report(assignmentA.id, { summary: "A 完成" });
  assert.equal(adapter.starts.length, 2);
  assert.equal(engine.state.assignments.find(item => item.id === assignmentB.id).state, "running");
});

test("暂停：不启动排队任务，恢复后继续", async t => {
  const { engine, adapter } = await engineWith(t);
  await engine.setPaused(true);
  const received = await engine.receiveTrigger({ source: "feishu", thread: "oc_a", text: "A", strength: "explicit" });
  await engine.decide(received.trigger.id, { kind: "accept" });
  assert.equal(adapter.starts.length, 0);
  await engine.setPaused(false);
  assert.equal(adapter.starts.length, 1);
});

test("设置 revision 与持久化恢复", async t => {
  const { engine, dir } = await engineWith(t);
  const block = await engine.updateSettings("eval", { mode: "observe" });
  assert.equal(block.revision, 1);
  assert.equal(block.value.mode, "observe");
  await assert.rejects(() => engine.updateSettings("eval", { mode: "auto" }, 0), /revision/);
  const again = new VikaEngine({ stateDir: dir });
  await again.init();
  assert.equal(again.settings.eval.value.mode, "observe");
});

test("仓库管理", async t => {
  const { engine } = await engineWith(t);
  await engine.addRepo({ name: "dsh-openviking-expand", path: "D:/repos/dsh-openviking-expand" });
  assert.equal(engine.state.repos.length, 1);
  assert.equal(engine.state.repos[0].name, "dsh-openviking-expand");
  await engine.removeRepo("dsh-openviking-expand");
  assert.equal(engine.state.repos.length, 0);
});

test("桥接：引擎接口经 VikaBridge 暴露", async t => {
  const { VikaBridge } = await import("../host/vika/bridge.mjs");
  const { engine, adapter } = await engineWith(t);
  const vika = { bridge: { host: "127.0.0.1", port: 0, maxBodyBytes: 1 << 20, maxWaitMs: 100 }, stateDir: engine.stateDir };
  const controller = { engine, native: { ready: Promise.resolve() }, listSessions: () => [] };
  const bridge = new VikaBridge({ controller, vika, log: () => {} });
  const call = (path, method = "GET", body = {}) =>
    bridge.dispatch(new URL(`http://127.0.0.1${path}`), method, [], body);

  const state = await call("/v1/engine/state");
  assert.equal(state.state.overview.flow.received, 0);
  assert.equal(Array.isArray(state.state.repos), true);

  const received = await call("/v1/engine/triggers", "POST", { source: "feishu", thread: "oc_1", text: "干活", strength: "explicit" });
  assert.equal(received.needsRouter, true);

  const evaluating = await call("/v1/engine/evaluating");
  assert.equal(evaluating.triggers.length, 1);

  const decided = await call("/v1/engine/decisions", "POST", { triggerId: received.trigger.id, kind: "accept" });
  assert.equal(decided.ticket.state, "working");
  assert.equal(adapter.starts.length, 1);

  const tickets = await call("/v1/engine/tickets?state=all");
  assert.equal(tickets.tickets.length, 1);
  const detail = await call(`/v1/engine/tickets/${decided.ticket.id}`);
  assert.equal(detail.ticket.assignments.length, 1);

  const settings = await call("/v1/engine/settings/eval", "PUT", { value: { mode: "observe" }, revision: 0 });
  assert.equal(settings.settings.value.mode, "observe");

  const assignmentId = detail.ticket.assignments[0].id;
  const reported = await call("/v1/engine/reports", "POST", { assignmentId, summary: "完成" });
  assert.equal(reported.ticket.state, "ended");

  const paused = await call("/v1/engine/pause", "POST", { paused: true });
  assert.equal(paused.executor.value.paused, true);

  const repo = await call("/v1/engine/repos", "POST", { name: "demo", path: "D:/demo" });
  assert.equal(repo.repo.name, "demo");
  assert.equal((await call("/v1/engine/repos")).repos.length, 1);
  assert.equal((await call("/v1/engine/workers")).workers.length, 1);
  assert.equal((await call("/v1/engine/threads")).threads.length, 1);

  const sources = await call("/v1/engine/sources");
  assert.equal(sources.sources.length, 4);
  assert.equal(sources.sources.find(item => item.id === "feishu").stats.received >= 1, true);
  const search = await call(`/v1/engine/search?q=${encodeURIComponent("干活")}`);
  assert.equal(search.items.length, 1);

  const retried = await call("/v1/engine/pause", "POST", { paused: false }).then(() => call(`/v1/engine/tickets/${decided.ticket.id}/retry`, "POST"));
  assert.equal(retried.ticket.state, "working");
  assert.equal(retried.ticket.assignments.length, 2);
  const stopped = await call(`/v1/engine/tickets/${decided.ticket.id}/stop`, "POST");
  assert.equal(stopped.ticket.state, "ended");

  const unsub = await call(`/v1/engine/threads/${encodeURIComponent("feishu:oc_1")}/unsubscribe`, "POST");
  assert.equal(unsub.removed.length >= 1, true);
  const pending = await call("/v1/engine/triggers", "POST", { source: "manual", thread: "req", text: "待评估" });
  const requeue = await call(`/v1/engine/triggers/${pending.trigger.id}/requeue`, "POST");
  assert.equal(requeue.requeued, false);
});

test("Watchdog：无心跳 worker 被标记 stale 并阻塞工单", async t => {
  const { engine } = await engineWith(t);
  const received = await engine.receiveTrigger({ source: "manual", thread: "wd", text: "长任务", strength: "explicit" });
  const accepted = await engine.decide(received.trigger.id, { kind: "accept" });
  const worker = engine.listWorkers()[0];
  assert.equal(worker.active, true);
  worker.lastSeen = new Date(Date.now() - 3600 * 1000).toISOString();
  const issues = await engine.sweep({ staleMs: 60 * 1000 });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].ticketId, accepted.ticket.id);
  assert.equal(engine.listWorkers()[0].stale, true);
  assert.equal(engine.state.tickets.find(item => item.id === accepted.ticket.id).state, "blocked");
  const snapshot = engine.issues();
  assert.equal(snapshot.stale.length, 1);
  assert.equal(snapshot.blocked.length, 1);
});

test("订阅直通可关闭：后续事件回到 Router 评估", async t => {
  const { engine, adapter } = await engineWith(t);
  await engine.updateSettings("channels", { subscribe: false });
  const first = await engine.receiveTrigger({ source: "feishu", thread: "oc_off", text: "任务", strength: "explicit" });
  await engine.decide(first.trigger.id, { kind: "accept" });
  const second = await engine.receiveTrigger({ source: "feishu", thread: "oc_off", text: "补充" });
  assert.equal(second.routed, false);
  assert.equal(second.needsRouter, true);
  assert.equal(second.routed, false);
  assert.equal(adapter.sends.length, 0);
});

test("批量评估：按 thread 汇总 evaluating trigger", async t => {
  const { engine } = await engineWith(t);
  await engine.receiveTrigger({ source: "feishu", thread: "oc_b1", text: "a" });
  await engine.receiveTrigger({ source: "feishu", thread: "oc_b1", text: "b" });
  await engine.receiveTrigger({ source: "github", thread: "o/r#2", text: "c" });
  const batch = engine.batchPending();
  assert.equal(batch.length, 2);
  assert.equal(batch.find(item => item.thread === "feishu:oc_b1").triggers.length, 2);
});

test("提示词设置：prompts 块可写并持久化", async t => {
  const { engine, dir } = await engineWith(t);
  const block = await engine.updateSettings("prompts", { workerHeader: "【自定义 worker 头】" });
  assert.equal(block.revision, 1);
  assert.equal(block.value.workerHeader, "【自定义 worker 头】");
  const again = new VikaEngine({ stateDir: dir });
  await again.init();
  assert.equal(again.settings.prompts.value.workerHeader, "【自定义 worker 头】");
});

test("停止 worker：收尾 assignment 与工单", async t => {
  const { engine, adapter } = await engineWith(t);
  const received = await engine.receiveTrigger({ source: "manual", thread: "stop", text: "任务", strength: "explicit" });
  const accepted = await engine.decide(received.trigger.id, { kind: "accept" });
  const assignment = engine.state.assignments.find(item => item.ticketId === accepted.ticket.id);
  const result = await engine.stopWorker(assignment.sessionId);
  assert.equal(result.stopped, true);
  assert.equal(adapter.stops, 1);
  assert.equal(engine.listWorkers()[0].stopped, true);
  const ticket = engine.state.tickets.find(item => item.id === accepted.ticket.id);
  assert.equal(ticket.state, "ended");
  assert.equal(ticket.report.state, "stopped");
});

test("旧状态文件缺新设置块时自动补齐（迁移）", async t => {
  const { writeFile } = await import("node:fs/promises");
  const { dir } = await engineWith(t);
  await writeFile(join(dir, "engine.json"), JSON.stringify({ version: 1, settings: { eval: { revision: 1, value: { mode: "observe" } } }, triggers: [] }), "utf8");
  const engine = new VikaEngine({ stateDir: dir });
  await engine.init();
  assert.equal(engine.settings.eval.value.mode, "observe");
  assert.ok(engine.settings.prompts, "prompts 块应被补齐");
  assert.equal(engine.settings.executor.value.maxWorkers, 3);
});

test("eval=auto：显式请求自动接单，不再等 Router", async t => {
  const { engine, adapter } = await engineWith(t);
  await engine.updateSettings("eval", { mode: "auto" });
  const received = await engine.receiveTrigger({ source: "manual", thread: "auto", text: "自动任务", strength: "explicit" });
  assert.equal(received.needsRouter, false);
  assert.equal(received.autoAccepted, true);
  assert.equal(received.ticket.state, "working");
  assert.equal(adapter.starts.length, 1);
});

test("speculative：普通事件按投机工单自动尝试", async t => {
  const { engine } = await engineWith(t);
  await engine.updateSettings("executor", { speculative: true });
  const received = await engine.receiveTrigger({ source: "manual", thread: "spec", text: "可能相关" });
  assert.equal(received.speculative, true);
  assert.equal(received.ticket.speculative, true);
  assert.equal(received.ticket.state, "working");
});
