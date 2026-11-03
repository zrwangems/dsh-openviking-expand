/**
 * vika 账本：落盘、恢复、按 requestId/话题查找。
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { VikaRegistry } from "../host/vika/registry.mjs";

const root = path.join(os.tmpdir(), `vika-registry-${process.pid}`);
const file = path.join(root, "registry.json");

test.after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function record(sessionId, extra = {}) {
  return { sessionId, title: sessionId, threads: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...extra };
}

test("增删改查与重新加载", () => {
  const registry = new VikaRegistry(file);
  registry.upsert(record("a", { threads: ["t1"] }));
  registry.upsert(record("b", { threads: ["t2"] }));
  registry.update("a", { status: "running" });
  assert.equal(registry.get("a").status, "running");
  assert.equal(registry.list().length, 2);
  assert.deepEqual(registry.findByThread("t1").map(item => item.sessionId), ["a"]);
  const reloaded = new VikaRegistry(file);
  assert.equal(reloaded.get("a").status, "running");
  assert.equal(reloaded.get("b").sessionId, "b");
});

test("按 requestId 查找并限制保留数量", () => {
  const other = path.join(root, "registry2.json");
  const registry = new VikaRegistry(other);
  registry.upsert(record("c", { requestIds: ["create-1"] }));
  assert.equal(registry.findByRequestId("create-1").sessionId, "c");
  assert.equal(registry.findByRequestId("missing"), undefined);
  for (let index = 0; index < 250; index++) registry.rememberRequest("c", `m-${index}`);
  assert.equal(registry.get("c").requestIds.length, 200);
  assert.equal(registry.get("c").requestIds.includes("m-249"), true);
  assert.equal(registry.get("c").requestIds.includes("m-0"), false);
});

test("坏文件按空账本启动而不是抛错", () => {
  const broken = path.join(root, "broken.json");
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(broken, "{not json", "utf8");
  const registry = new VikaRegistry(broken);
  assert.deepEqual(registry.list(), []);
});
