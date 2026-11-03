/**
 * vika 本地桥：鉴权、路由、请求上限与长轮询的 HTTP 契约。
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveVikaConfig } from "../host/vika/config.mjs";
import { VikaController } from "../host/vika/controller.mjs";
import { VikaBridge } from "../host/vika/bridge.mjs";
import { fakeCtx } from "./vika-fixtures.mjs";

const root = path.join(os.tmpdir(), `vika-bridge-${process.pid}`);
let bridge;
let controller;
let baseUrl;
const token = "test-token-0123456789";

test.before(async () => {
  const vika = resolveVikaConfig({
    enabled: true,
    stateDir: path.join(root, "state"),
    bridge: { port: 37420, token, maxBodyBytes: 1024, maxWaitMs: 1000, audit: false },
    workers: { defaultCwd: path.join(root, "work"), allowedRoots: [root], reposRoot: path.join(root, "repos") },
  });
  vika.bridge.port = 0;
  const ctx = fakeCtx();
  controller = new VikaController({ ctx, vika, log: () => {} });
  controller.install();
  bridge = new VikaBridge({ controller, vika, log: () => {} });
  const address = await bridge.start();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(() => {
  bridge?.close();
  controller?.close();
  fs.rmSync(root, { recursive: true, force: true });
});

async function call(pathname, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : undefined };
}

test("无 token 与错 token 都是 401", async () => {
  const missing = await call("/v1/health", { headers: { authorization: "" } });
  assert.equal(missing.status, 401);
  const wrong = await call("/v1/health", { headers: { authorization: "Bearer wrong" } });
  assert.equal(wrong.status, 401);
});

test("health 报告桥与会话概况", async () => {
  const result = await call("/v1/health");
  assert.equal(result.status, 200);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.bridge.port, 0);
  assert.equal(typeof result.json.sessions.total, "number");
});

test("create -> list -> show -> messages 的完整往返", async () => {
  const created = await call("/v1/sessions", {
    method: "POST",
    body: { title: "桥任务", cwd: path.join(root, "work", "r1"), prompt: "改一下", requestId: "bridge-1" },
  });
  assert.equal(created.status, 200);
  const sessionId = created.json.session.sessionId;
  assert.match(sessionId, /^vika-/);

  const listed = await call("/v1/sessions");
  assert.equal(listed.json.sessions.length, 1);

  const shown = await call(`/v1/sessions/${sessionId}`);
  assert.equal(shown.json.session.title, "[Vika] 桥任务");

  const followup = await call(`/v1/sessions/${sessionId}/messages`, {
    method: "POST",
    body: { text: "再改一处", requestId: "bridge-2" },
  });
  assert.equal(followup.status, 200);
  assert.equal(followup.json.session.status, "running");

  const renamed = await call(`/v1/sessions/${sessionId}/title`, { method: "POST", body: { title: "新名字" } });
  assert.equal(renamed.json.session.title, "新名字");
});

test("未知路由 404，非法 JSON 400，超大请求 413", async () => {
  assert.equal((await call("/v1/nope")).status, 404);
  const badJson = await fetch(`${baseUrl}/v1/sessions`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: "{oops",
  });
  assert.equal(badJson.status, 400);
  const oversized = await call("/v1/sessions", { method: "POST", body: { title: "x".repeat(2000) } });
  assert.equal(oversized.status, 413);
});

test("events 长轮询立即返回已发生的事件", async () => {
  const result = await call("/v1/events?cursor=0&timeoutMs=50");
  assert.equal(result.status, 200);
  assert.equal(Array.isArray(result.json.events), true);
  assert.equal(result.json.events.some(event => event.type === "created"), true);
});
