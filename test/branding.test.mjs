import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { VIKA_AGENT_PRESETS } from "../host/components/vika/presets.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEXT = /\.(?:mjs|js|json|md|ya?ml|tsx?|txt)$/i;
const BRAND = /superagent|super-agent/i;

function walk(dir, result = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "lib" || name === "icons") continue;
    const file = join(dir, name);
    if (statSync(file).isDirectory()) {
      walk(file, result);
    } else if (TEXT.test(name)) {
      result.push(file);
    }
  }
  return result;
}

test("用户可见源码/提示词/文档不再出现上游品牌字样", () => {
  const files = [
    ...walk(join(root, "client")),
    ...walk(join(root, "host")),
    ...walk(join(root, "vika")),
    ...walk(join(root, "locale")),
    join(root, "cordis.patch.yml"),
    join(root, "package.json"),
  ].filter(file => !file.endsWith("vika-vs-superagent.md"));
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, BRAND, `残留上游品牌：${file}`);
  }
});

test("两个 agent preset 使用 vika 名称与 ID", () => {
  assert.deepEqual(VIKA_AGENT_PRESETS.map(item => item.id), ["vika-worker", "vika-router"]);
  assert.deepEqual(VIKA_AGENT_PRESETS.map(item => item.name), ["vika执行器", "vika主session"]);
  for (const preset of VIKA_AGENT_PRESETS) {
    assert.equal(typeof preset.description, "string");
    assert.equal(preset.description.includes("vika"), true);
  }
});
