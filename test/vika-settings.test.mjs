import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  normalizeSettings,
  publicSettings,
  readSettings,
  resolveVikaSettings,
  saveVikaSettings,
  settingsFile,
} from "../host/settings.mjs";

async function withSettingsFile(t) {
  const dir = await mkdtemp(join(tmpdir(), "vika-settings-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "openviking-expand.json");
  process.env.OPENVIKING_EXPAND_SETTINGS = file;
  return { dir, file };
}

test("设置迁移：旧的扁平 OpenViking 字段搬到 openviking", () => {
  const migrated = normalizeSettings({ serviceType: "open", server: "http://127.0.0.1:1933", apiKey: "k" });
  assert.equal(migrated.openviking.server, "http://127.0.0.1:1933");
  assert.equal(migrated.openviking.apiKey, "k");
  assert.equal(migrated.vika.bridgePort, 3742);
});

test("publicSettings 只返回容器名与桥字段，不再有工作区/凭据", () => {
  const settings = normalizeSettings({ vika: { containerName: "vika-src", bridgePort: 4000 } });
  const result = publicSettings(settings);
  const vika = result.vika;
  assert.equal(vika.containerName, "vika-src");
  assert.equal(vika.bridgePort, 4000);
  assert.equal("workspace" in vika, false);
  assert.equal("bridgeToken" in vika, false);
  assert.equal("githubLogin" in vika, false);
  assert.equal("feishuAppId" in vika, false);
});

test("保存 vika 设置（容器名/桥）", async t => {
  const { dir } = await withSettingsFile(t);
  await saveVikaSettings({ containerName: "vika-src", bridgePort: 3900 });
  const saved = await readSettings();
  assert.equal(saved.vika.containerName, "vika-src");
  assert.equal(saved.vika.bridgePort, 3900);
  assert.equal(settingsFile(), join(dir, "openviking-expand.json"));
  assert.equal(resolveVikaSettings(saved).containerName, "vika-src");
});

test("保存 OpenViking 页不覆盖 vika 页", async t => {
  await withSettingsFile(t);
  await saveVikaSettings({ containerName: "vika-src" });
  const { saveSettings } = await import("../host/settings.mjs");
  await saveSettings({ server: "http://127.0.0.1:1933", language: "en" });
  const saved = await readSettings();
  assert.equal(saved.openviking.server, "http://127.0.0.1:1933");
  assert.equal(saved.vika.containerName, "vika-src");
});
