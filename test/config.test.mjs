import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_ENDPOINT, normalizeRoot, readLocalOvConfig, resolveConfig } from "../host/config.mjs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
    const config = resolveConfig({}, { local: {}, legacy: {} });
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

test("自动读取 ovcli.conf 的连接与身份", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ovx-config-"));
  const cliPath = join(dir, "ovcli.conf");
  await writeFile(cliPath, JSON.stringify({
    url: "http://127.0.0.1:2933/",
    api_key: "cli-key",
    root_api_key: "cli-root",
    account: "acc",
    user: "usr",
  }));
  const config = resolveConfig({}, {
    env: { OPENVIKING_CLI_CONFIG_FILE: cliPath, OPENVIKING_CONFIG_FILE: join(dir, "missing.conf") },
    legacy: {},
  });
  assert.equal(config.endpoint, "http://127.0.0.1:2933");
  assert.equal(config.apiKey, "cli-key");
  assert.equal(config.adminKey, "cli-root");
  assert.equal(config.accountId, "acc");
  assert.equal(config.userId, "usr");
  assert.equal(config.configSource, "ovcli.conf");
});

test("环境变量优先，ov.conf 提供 host/port 与 root key", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ovx-server-config-"));
  const serverPath = join(dir, "ov.conf");
  await writeFile(serverPath, JSON.stringify({ server: { host: "0.0.0.0", port: 1934, root_api_key: "root" } }));
  const local = readLocalOvConfig({ env: { OPENVIKING_CONFIG_FILE: serverPath, OPENVIKING_CLI_CONFIG_FILE: join(dir, "missing") } });
  assert.equal(local.endpoint, "http://0.0.0.0:1934");
  assert.equal(local.adminKey, "root");
  const config = resolveConfig({}, {
    env: { OPENVIKING_URL: "https://ov.example/", OPENVIKING_API_KEY: "env-key" },
    local,
    legacy: {},
  });
  assert.equal(config.endpoint, "https://ov.example");
  assert.equal(config.apiKey, "env-key");
  assert.equal(config.configSource, "environment");
});

test("旧插件连接只在本机 OV 配置缺失时兜底", () => {
  const legacy = { endpoint: "http://legacy.test", apiKey: "old-key", source: "legacy-plugin" };
  const fallback = resolveConfig({}, { env: {}, local: {}, legacy });
  assert.equal(fallback.endpoint, "http://legacy.test");
  assert.equal(fallback.apiKey, "old-key");
  const localFirst = resolveConfig({}, { env: {}, local: { endpoint: "http://cli.test", apiKey: "cli-key", source: "ovcli.conf" }, legacy });
  assert.equal(localFirst.endpoint, "http://cli.test");
  assert.equal(localFirst.apiKey, "cli-key");
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
