import assert from "node:assert/strict";
import test from "node:test";

import { resolveConfig } from "../host/config.mjs";
import {
  connectionOf,
  createConnectionPool,
  normalizeServer,
} from "../host/routes.mjs";

function makeConfig(overrides = {}) {
  return resolveConfig({ endpoint: "http://ov.test", ...overrides });
}

function captureClient(config, response = { status: "ok", result: [] }) {
  const calls = [];
  const pool = createConnectionPool(config, {
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), headers: init.headers });
      return { ok: true, status: 200, text: async () => JSON.stringify(response) };
    },
  });
  return { pool, calls };
}

test("normalizeServer 只收 http(s)，去掉查询串与尾斜杠", () => {
  assert.equal(normalizeServer("http://127.0.0.1:1933/"), "http://127.0.0.1:1933");
  assert.equal(normalizeServer("https://ov.example.com/ov?x=1#y"), "https://ov.example.com/ov");
  for (const bad of ["", "   ", "not a url", "ftp://ov.test", "javascript:alert(1)", "file:///c:/x", null, undefined]) {
    assert.equal(normalizeServer(bad), null, `应拒绝：${String(bad)}`);
  }
});

test("connectionOf 从查询串与请求头取连接信息", () => {
  const req = {
    method: "GET",
    headers: { "x-ov-key": " studio-key ", "x-ov-account": "acc", "x-ov-user": "usr" },
  };
  const url = new URL("http://dsh.internal/openviking-expand/ls?server=http%3A%2F%2Fov.studio.test%2F");
  const connection = connectionOf(req, url);
  assert.deepEqual(connection, {
    server: "http://ov.studio.test",
    key: "studio-key",
    account: "acc",
    user: "usr",
  });
  const empty = connectionOf({ method: "GET", headers: {} }, new URL("http://dsh.internal/x"));
  assert.deepEqual(empty, { server: null, key: "", account: "", user: "" });
});

test("Studio 带来的 key 优先，并且只发给它指定的服务", async () => {
  const config = makeConfig({ apiKey: "config-key" });
  const { pool, calls } = captureClient(config);
  const client = pool({ server: "http://ov.studio.test", key: "studio-key" });
  await client.ls("viking://");
  assert.match(calls[0].url, /^http:\/\/ov\.studio\.test\/api\/v1\/fs\/ls/);
  assert.equal(calls[0].headers["x-api-key"], "studio-key");
});

test("目标就是配置的 endpoint 时才回退到配置里的 key", async () => {
  const config = makeConfig({ apiKey: "config-key" });
  const { pool, calls } = captureClient(config);
  await pool({}).ls("viking://");
  assert.equal(calls[0].headers["x-api-key"], "config-key");
  const studio = pool({ key: "studio-key" });
  await studio.ls("viking://");
  assert.equal(calls[1].headers["x-api-key"], "studio-key");
});

test("别的服务地址没给 key 时不会把本机凭据带过去", async () => {
  const config = makeConfig({ apiKey: "config-key" });
  const { pool, calls } = captureClient(config);
  const client = pool({ server: "http://other.test" });
  await client.ls("viking://");
  assert.equal(calls[0].headers["x-api-key"], undefined);
  // 可信模式：没有 key 时才透传 account/user
  const trusted = pool({ server: "http://other.test", account: "acc", user: "usr" });
  await trusted.ls("viking://");
  assert.equal(calls[1].headers["x-openviking-account"], "acc");
  assert.equal(calls[1].headers["x-openviking-user"], "usr");
});

test("同一连接复用客户端实例", () => {
  const config = makeConfig();
  const { pool } = captureClient(config);
  const first = pool({ server: "http://ov.test", key: "k" });
  const second = pool({ server: "http://ov.test", key: "k" });
  const third = pool({ server: "http://ov.test", key: "other" });
  assert.equal(first, second);
  assert.notEqual(first, third);
});
