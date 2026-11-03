import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { OvError, createOvClient, httpStatusOf } from "../host/connection.mjs";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

test("成功响应返回 payload.result 并带上 API key", async () => {
  const calls = [];
  const client = createOvClient({
    endpoint: "http://ov.test",
    apiKey: "secret-key",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ status: "ok", result: ["a"] });
    },
  });
  const result = await client.request("/api/v1/fs/ls", { uri: "viking://", node_limit: 5 });
  assert.deepEqual(result, ["a"]);
  assert.equal(calls[0].url, "http://ov.test/api/v1/fs/ls?uri=viking%3A%2F%2F&node_limit=5");
  assert.equal(calls[0].init.headers["x-api-key"], "secret-key");
});

test("401 映射成 unauthenticated，404 映射成 not-found", async () => {
  const unauthorized = createOvClient({
    endpoint: "http://ov.test",
    fetchImpl: async () => jsonResponse({ status: "error", error: { code: "UNAUTHENTICATED", message: "Invalid API key" } }, 401),
  });
  await assert.rejects(unauthorized.request("/api/v1/fs/ls"), error => {
    assert.equal(error.code, "unauthenticated");
    assert.equal(error.message, "Invalid API key");
    return true;
  });

  const missing = createOvClient({
    endpoint: "http://ov.test",
    fetchImpl: async () => jsonResponse({ status: "error", error: { code: "NOT_FOUND", message: "no such file" } }, 404),
  });
  await assert.rejects(missing.request("/api/v1/content/read", { uri: "viking://nope" }), error => {
    assert.equal(error.code, "not-found");
    assert.equal(httpStatusOf(error), 404);
    return true;
  });
});

test("超时与网络失败分别映射 timeout / unreachable", async () => {
  const timeout = createOvClient({
    endpoint: "http://ov.test",
    timeoutMs: 5,
    fetchImpl: async () => {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    },
  });
  await assert.rejects(timeout.request("/health"), error => error.code === "timeout" && httpStatusOf(error) === 504);

  const offline = createOvClient({
    endpoint: "http://127.0.0.1:1",
    fetchImpl: async () => { throw new Error("ECONNREFUSED"); },
  });
  await assert.rejects(offline.request("/health"), error => error.code === "unreachable" && httpStatusOf(error) === 502);
});

test("无法解析的响应按 bad-response 处理", async () => {
  const client = createOvClient({
    endpoint: "http://ov.test",
    fetchImpl: async () => jsonResponse("<html>oops</html>"),
  });
  await assert.rejects(client.request("/health"), error => error.code === "bad-response");
});

test("apiKey 缺省时读 ovcli.conf，其次环境变量", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ovx-cred-"));
  const credentialFile = join(dir, "ovcli.conf");
  await writeFile(credentialFile, JSON.stringify({ url: "http://ov.test", api_key: "file-key" }), "utf8");
  const seen = [];
  const client = createOvClient({
    endpoint: "http://ov.test",
    credentialFile,
    fetchImpl: async (url, init) => {
      seen.push(init.headers["x-api-key"]);
      return jsonResponse({ status: "ok", result: "ok" });
    },
  });
  await client.request("/health");
  assert.equal(seen[0], "file-key");

  const previous = process.env.OPENVIKING_API_KEY;
  process.env.OPENVIKING_API_KEY = "env-key";
  try {
    const fromEnv = createOvClient({
      endpoint: "http://ov.test",
      credentialFile,
      fetchImpl: async (url, init) => {
        seen.push(init.headers["x-api-key"]);
        return jsonResponse({ status: "ok", result: "ok" });
      },
    });
    await fromEnv.request("/health");
    assert.equal(seen[1], "env-key");
  } finally {
    if (previous === undefined) delete process.env.OPENVIKING_API_KEY;
    else process.env.OPENVIKING_API_KEY = previous;
  }
});

test("healthResult 把失败当成数据返回", async () => {
  const client = createOvClient({
    endpoint: "http://ov.test",
    fetchImpl: async () => jsonResponse({ status: "error", error: { code: "UNAUTHENTICATED", message: "bad key" } }, 401),
  });
  const health = await client.healthResult();
  assert.equal(health.ok, false);
  assert.equal(health.status, 401);
  assert.match(health.error.message, /bad key/);
});

test("OvError 保留 code 与状态", () => {
  const error = new OvError("bad-uri", "坏 URI", { status: 400, uri: "viking://x" });
  assert.equal(error.code, "bad-uri");
  assert.equal(error.status, 400);
  assert.equal(httpStatusOf(error), 400);
});

test("ls：semantic:false 时不带语义参数（系统命名空间）", async () => {
  const urls = [];
  const client = createOvClient({
    endpoint: "http://ov.test",
    fetchImpl: async url => {
      urls.push(String(url));
      return jsonResponse({ status: "ok", result: [] });
    },
  });
  await client.ls("viking://system", { nodeLimit: 10, semantic: false });
  assert.doesNotMatch(urls[0], /include_abstract|include_overview|abs_limit|overview_limit/);
  await client.ls("viking://resources", { nodeLimit: 10 });
  assert.match(urls[1], /include_abstract=true/);
  assert.match(urls[1], /include_overview=true/);
});
