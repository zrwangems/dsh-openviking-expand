/**
 * 工单阶段判定的回归：桥用 host/vika/ticket-stage.mjs 读工单快照，
 * 它的判定必须与 vendored 运行时 index.js 的 ticketStage 顺序一致（阶段表见上游 docs/003）。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ticketStage } from "../host/vika/ticket-stage.mjs";

const at = "2026-11-04T00:00:00.000Z";
const ticket = patch => ({
  id: "ticket-1",
  assignments: [],
  inputs: [],
  ...patch,
});

test("ended 优先于其它状态", () => {
  assert.deepEqual(ticketStage(ticket({ ended: { outcome: "completed" }, attention: { id: "a" } })), { stage: "ended" });
});

test("等人处理的三类：delivery / attention / ready 报告", () => {
  assert.deepEqual(ticketStage(ticket({ delivery: { id: "d" } })), { stage: "person", action: "delivery" });
  assert.deepEqual(ticketStage(ticket({ attention: { id: "a" } })), { stage: "person", action: "answer" });
  assert.deepEqual(
    ticketStage(ticket({ assignments: [{ id: "a1", state: "ended", report: { state: "ready", at } }] })),
    { stage: "person", action: "review" },
  );
});

test("blocked/failed 报告等人接手；有更新的人工消息后不再等待", () => {
  const blocked = ticket({ assignments: [{ id: "a1", state: "ended", report: { state: "blocked", at } }] });
  assert.deepEqual(ticketStage(blocked), { stage: "person", action: "blocked" });

  const followedUp = {
    ...blocked,
    inputs: [{ id: "i1", kind: "trigger", human: true, at: "2026-11-04T00:00:01.000Z" }],
  };
  assert.deepEqual(ticketStage(followedUp), { stage: "idle" });
});

test("无 assignment 或排队中视为 working/queued", () => {
  assert.deepEqual(ticketStage(ticket({})), { stage: "working", action: "queued" });
  assert.deepEqual(ticketStage(ticket({ assignments: [{ id: "a1", state: "pending" }] })), { stage: "working", action: "queued" });
});

test("运行中为 working，waiting 报告后为 idle", () => {
  assert.deepEqual(ticketStage(ticket({ assignments: [{ id: "a1", state: "running" }] })), { stage: "working" });
  assert.deepEqual(
    ticketStage(ticket({ assignments: [{ id: "a1", state: "running", report: { state: "waiting", at } }] })),
    { stage: "idle" },
  );
});
