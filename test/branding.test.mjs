import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

test("用户可见源码/文档不再出现上游品牌字样", () => {
  const files = [
    ...walk(join(root, "client")),
    ...walk(join(root, "host")),
    ...walk(join(root, "locale")),
    join(root, "cordis.patch.yml"),
    join(root, "package.json"),
  ];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, BRAND, `残留上游品牌：${file}`);
  }
});
