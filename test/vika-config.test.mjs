/**
 * vika 配置归一化：默认关闭、端口/上限纠正、路径白名单与仓库目录映射。
 */
import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { resolveVikaConfig, isAllowedCwd, isInside, repoPathOf, DEFAULT_BRIDGE_PORT } from "../host/vika/config.mjs";

const tmp = path.join(os.tmpdir(), "vika-config-test");

test("默认关闭且端口落在回环", () => {
  const vika = resolveVikaConfig({});
  assert.equal(vika.enabled, false);
  assert.equal(vika.bridge.host, "127.0.0.1");
  assert.equal(vika.bridge.port, DEFAULT_BRIDGE_PORT);
  assert.equal(vika.workers.maxSessions, 6);
});

test("端口与上限被纠正到合法区间", () => {
  const vika = resolveVikaConfig({
    enabled: true,
    bridge: { host: "10.0.0.9", port: 70000, maxBodyBytes: 10, maxWaitMs: 999999 },
    workers: { maxSessions: 0, reportChars: 60, maxPromptChars: 5 },
  });
  assert.equal(vika.bridge.host, "127.0.0.1", "非回环地址必须被拒绝");
  assert.equal(vika.bridge.port, 65535);
  assert.equal(vika.bridge.maxBodyBytes, 1024);
  assert.equal(vika.bridge.maxWaitMs, 120000);
  assert.equal(vika.workers.maxSessions, 1);
  assert.equal(vika.workers.reportChars, 200);
  assert.equal(vika.workers.maxPromptChars, 256);
});

test("路径白名单按 Windows 大小写不敏感判断", () => {
  const root = process.platform === "win32" ? "D:\\Projects" : "/tmp/projects";
  const inside = process.platform === "win32" ? "d:\\projects\\ems\\repo" : "/tmp/projects/ems/repo";
  const outside = process.platform === "win32" ? "D:\\Windows" : "/etc/passwd";
  assert.equal(isInside(root, inside), true);
  assert.equal(isInside(root, outside), false);
  assert.equal(isInside(root, root), true);
});

test("allowedRoots 为空时只允许默认目录与 reposRoot", () => {
  const vika = resolveVikaConfig({
    enabled: true,
    stateDir: path.join(tmp, "state"),
    workers: { defaultCwd: path.join(tmp, "work"), allowedRoots: [] },
  });
  assert.equal(isAllowedCwd(vika, path.join(tmp, "work")), true);
  assert.equal(isAllowedCwd(vika, path.join(vika.workers.reposRoot, "a__b", "t1")), true);
  assert.equal(isAllowedCwd(vika, path.join(tmp, "elsewhere")), false);
});

test("repo+slug 映射到固定目录形状", () => {
  const vika = resolveVikaConfig({ enabled: true, stateDir: path.join(tmp, "state2") });
  const target = repoPathOf(vika, "owner/repo", "fix-1");
  assert.equal(target, path.join(vika.workers.reposRoot, "owner__repo", "fix-1"));
  const sanitized = repoPathOf(vika, "own er/na me", "fix");
  assert.equal(/[\s]/.test(sanitized), false, "仓库名里的空白必须被清洗");
});

test("环境变量可提供 token", () => {
  const previous = process.env.OPENVIKING_EXPAND_VIKA_TOKEN;
  process.env.OPENVIKING_EXPAND_VIKA_TOKEN = "token-from-env";
  try {
    assert.equal(resolveVikaConfig({ enabled: true }).bridge.token, "token-from-env");
  } finally {
    if (previous === undefined) delete process.env.OPENVIKING_EXPAND_VIKA_TOKEN;
    else process.env.OPENVIKING_EXPAND_VIKA_TOKEN = previous;
  }
});
