/**
 * vika 控制器：把桥请求翻译成 DSH 会话操作的行为契约。
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveVikaConfig } from "../host/vika/config.mjs";
import { VikaController } from "../host/vika/controller.mjs";
import { fakeCtx, assistantEvent } from "./vika-fixtures.mjs";

const root = path.join(os.tmpdir(), `vika-controller-${process.pid}`);
const work = path.join(root, "work");
let seq = 0;

function makeController(overrides = {}) {
  const ctx = fakeCtx();
  const vika = resolveVikaConfig({
    enabled: true,
    // 每个用例独立账本，避免 maxSessions 在用例之间串味。
    stateDir: path.join(root, "state", String(++seq)),
    workers: {
      defaultCwd: work,
      allowedRoots: [root],
      reposRoot: path.join(root, "repos"),
      maxSessions: 6,
      ...overrides.workers,
    },
  });
  const logs = [];
  const controller = new VikaController({ ctx, vika, log: (level, message) => logs.push({ level, message }) });
  controller.install();
  return { ctx, vika, controller, logs };
}

test.after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test("createSession 建 workspace、会话并投递首条任务", async () => {
  const { ctx, controller } = makeController();
  const created = await controller.createSession({
    title: "修 bug",
    cwd: path.join(work, "repo-a"),
    threads: ["feishu:oc_1", "feishu:oc_1"],
    prompt: "把 README 的错别字改了",
    requestId: "req-1",
  });
  assert.match(created.sessionId, /^vika-/);
  assert.equal(created.title, "[Vika] 修 bug");
  assert.deepEqual(created.threads, ["feishu:oc_1"]);
  assert.equal(created.status, "running", "首条任务投递后应处于 running");
  const workspace = ctx.calls.find(call => call.op === "workspace.create");
  assert.equal(workspace.cwd, path.join(work, "repo-a"));
  const session = ctx.calls.find(call => call.op === "session.create");
  assert.equal(session.request.workspaceId, "ws-1");
  const prompt = ctx.calls.find(call => call.op === "session.prompt");
  assert.match(prompt.request.content[0].text, /【Vika 工作会话】/);
  assert.match(prompt.request.content[0].text, /把 README 的错别字改了/);
  assert.equal(prompt.request.mode, undefined);
  assert.notEqual(prompt.request.requestId, "req-1");
  assert.equal(ctx.calls.filter(call => call.op === "session.prompt").length, 1);
});

test("同一 requestId 重复 create 返回已有会话", async () => {
  const { ctx, controller } = makeController();
  const first = await controller.createSession({ title: "幂等", cwd: path.join(work, "repo-b"), requestId: "req-idem" });
  const second = await controller.createSession({ title: "幂等", cwd: path.join(work, "repo-b"), requestId: "req-idem" });
  assert.equal(first.sessionId, second.sessionId);
  assert.equal(ctx.calls.filter(call => call.op === "session.create").length, 1);
});

test("超过 maxSessions 拒绝新建", async () => {
  const { controller } = makeController({ workers: { maxSessions: 1 } });
  await controller.createSession({ title: "一", cwd: path.join(work, "r1"), requestId: "a" });
  await assert.rejects(
    () => controller.createSession({ title: "二", cwd: path.join(work, "r2"), requestId: "b" }),
    error => error.code === "limit_exceeded" && error.status === 429,
  );
});

test("允许范围外的 cwd 被拒绝", async () => {
  const { controller } = makeController();
  const outside = process.platform === "win32" ? "C:\\Windows\\Temp\\vika-outside" : "/tmp/vika-outside";
  await assert.rejects(
    () => controller.createSession({ title: "越界", cwd: outside, requestId: "x" }),
    error => error.code === "path_not_allowed" && error.status === 403,
  );
});

test("repo+slug 只定位仓库目录，会话落在固定工作区", async () => {
  const { controller, vika } = makeController();
  const created = await controller.createSession({ title: "仓库任务", repo: "owner/repo", slug: "fix-1", requestId: "r" });
  assert.equal(created.cwd, vika.workers.defaultCwd);
  assert.equal(controller.repoDir({ repo: "owner/repo", slug: "fix-1" }), path.join(vika.workers.reposRoot, "owner__repo", "fix-1"));
});

test("assistant/message 被采集为最终答复并发出完成事件", async () => {
  const { ctx, controller } = makeController();
  const created = await controller.createSession({ title: "采集", cwd: path.join(work, "repo-c"), requestId: "cap" });
  ctx.emit("session/event", { id: created.sessionId }, assistantEvent("改好了，见 README"));
  const shown = controller.showSession(created.sessionId);
  assert.equal(shown.lastAssistant, "改好了，见 README");
  assert.equal(shown.status, "idle");
  assert.equal(shown.messageCount, 1);
  const events = await controller.waitForEvents(0, 10);
  assert.equal(events.some(event => event.type === "completed" && event.sessionId === created.sessionId), true);
});

test("sendMessage 记录 requestId 且重复投递被跳过", async () => {
  const { ctx, controller } = makeController();
  const created = await controller.createSession({ title: "追问", cwd: path.join(work, "repo-d"), requestId: "s" });
  await controller.sendMessage({ sessionId: created.sessionId, text: "继续", requestId: "m-1" });
  await controller.sendMessage({ sessionId: created.sessionId, text: "继续", requestId: "m-1" });
  const prompts = ctx.calls.filter(call => call.op === "session.prompt");
  assert.equal(prompts.length, 1);
  assert.match(prompts[0].request.content[0].text, /【Vika 追问/);
});

test("未知会话与空文本给出明确错误", async () => {
  const { controller } = makeController();
  await assert.rejects(() => controller.sendMessage({ sessionId: "nope", text: "x" }), error => error.code === "not_found");
  const created = await controller.createSession({ title: "空", cwd: path.join(work, "repo-e"), requestId: "e" });
  await assert.rejects(() => controller.sendMessage({ sessionId: created.sessionId, text: "   " }), error => error.code === "bad_request");
});

test("cancel 与 rename 透传到 DSH，并更新账本", async () => {
  const { ctx, controller } = makeController();
  const created = await controller.createSession({ title: "操作", cwd: path.join(work, "repo-f"), requestId: "op" });
  await controller.cancelSession(created.sessionId);
  assert.equal(ctx.calls.some(call => call.op === "session.cancel" && call.request.sessionId === created.sessionId), true);
  await controller.renameSession(created.sessionId, "新标题");
  const rename = ctx.calls.filter(call => call.op === "session.rename").at(-1);
  assert.equal(rename.request.title, "[Vika] 新标题");
  assert.equal(controller.showSession(created.sessionId).title, "新标题");
});

test("agent/status 与 agent/error 更新视图", async () => {
  const { ctx, controller } = makeController();
  const created = await controller.createSession({ title: "状态", cwd: path.join(work, "repo-g"), requestId: "st" });
  const agent = { id: created.sessionId, status: "running", session: {} };
  ctx.agents.set(created.sessionId, agent);
  ctx.emit("agent/status", { agent, status: "running" });
  assert.equal(controller.showSession(created.sessionId).status, "running");
  // 会话冷下来后（agent 不在内存里）状态以账本为准，错误要能被看到。
  ctx.agents.delete(created.sessionId);
  ctx.emit("agent/error", { agent, error: new Error("模型不可用") });
  const shown = controller.showSession(created.sessionId);
  assert.equal(shown.status, "error");
  assert.match(shown.lastError, /模型不可用/);
});

test("listSessions 支持话题过滤与状态过滤", async () => {
  const { controller } = makeController();
  await controller.createSession({ title: "甲", cwd: path.join(work, "r-a"), threads: ["feishu:t1"], requestId: "l1" });
  await controller.createSession({ title: "乙", cwd: path.join(work, "r-b"), threads: ["feishu:t2"], requestId: "l2" });
  const filtered = controller.listSessions({ thread: "feishu:t1" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].title, "[Vika] 甲");
  assert.equal(controller.listSessions({ status: "idle" }).length, 2);
});
