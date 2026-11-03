import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_ENDPOINT, normalizeRoot, resolveConfig } from "../host/config.mjs";

test("缺省配置指向本机 1933 与 viking:// 根", () => {
  const previous = {
    OPENVIKING_URL: process.env.OPENVIKING_URL,
    OPENVIKING_BASE_URL: process.env.OPENVIKING_BASE_URL,
    OPENVIKING_CONSOLE_URL: process.env.OPENVIKING_CONSOLE_URL,
  };
  delete process.env.OPENVIKING_URL;
  delete process.env.OPENVIKING_BASE_URL;
  delete process.env.OPENVIKING_CONSOLE_URL;
  try {
    const config = resolveConfig({});
    assert.equal(config.endpoint, DEFAULT_ENDPOINT);
    assert.equal(config.sidebar.root, "viking://");
    assert.equal(config.sidebar.enabled, true);
    assert.equal(config.console.enabled, true);
    assert.equal(config.sidebar.nodeLimit, 1000);
    assert.equal(config.sidebar.maxFileBytes, 1024 * 1024);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("endpoint 去掉尾斜杠，consoleUrl 缺省留空", () => {
  const config = resolveConfig({ endpoint: "http://127.0.0.1:1933/", console: { consoleUrl: "http://ov.test/studio/" } });
  assert.equal(config.endpoint, "http://127.0.0.1:1933");
  assert.equal(config.console.consoleUrl, "http://ov.test/studio");
});

test("根 URI 规范化：补协议、去尾斜杠、拒绝逃逸值", () => {
  assert.equal(normalizeRoot("viking://resources/"), "viking://resources");
  assert.equal(normalizeRoot("viking://"), "viking://");
  assert.equal(normalizeRoot(""), "viking://");
  assert.equal(normalizeRoot("/etc/passwd"), "viking://");
  assert.equal(normalizeRoot("viking://resources/../etc"), "viking://");
  assert.equal(normalizeRoot("viking://resources?x=1"), "viking://");
});

test("数值项有上下限", () => {
  const config = resolveConfig({
    sidebar: { nodeLimit: 1, maxFileBytes: 1, timeoutMs: 1 },
  });
  assert.equal(config.sidebar.nodeLimit, 50);
  assert.equal(config.sidebar.maxFileBytes, 1024);
  assert.equal(config.sidebar.timeoutMs, 1000);
  const big = resolveConfig({ sidebar: { nodeLimit: 10 ** 9, maxFileBytes: 10 ** 12, timeoutMs: 10 ** 9 } });
  assert.equal(big.sidebar.nodeLimit, 5000);
  assert.equal(big.sidebar.maxFileBytes, 8 * 1024 * 1024);
  assert.equal(big.sidebar.timeoutMs, 120000);
});
