/**
 * 容器配置的纯逻辑回归：
 *  1) /dshin 放行的源码补丁必须可验证、可重复执行，匹配不到时明确返回 patched=false；
 *  2) 插件不得在 cwd/项目目录创建 AgentsDo（临时文件只进系统临时目录）。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { applyRouterCommandAllowlist } from "../host/vika/container.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = target => fs.readFileSync(path.join(root, target), "utf8");

const commandsSource = [
  "function parseCommand(input) {",
  '  const [token = ""] = input.slice(1).split(/\\s+/);',
  '  if (token === "status") return { kind: "status" };',
  "  return { kind: \"unknown\" };",
  "}",
].join("\n");

test("applyRouterCommandAllowlist：插入 /dshin 放行并保持幂等", () => {
  const first = applyRouterCommandAllowlist(commandsSource);
  assert.equal(first.patched, true);
  assert.match(first.text, /if \(\["dshin","dshout","dshnew"\]\.includes\(token\.toLowerCase\(\)\)\) return null;/);
  // 放行判断在状态命令解析之前，模型才能收到原始消息。
  assert.ok(first.text.indexOf("dshin") < first.text.indexOf('token === "status"'));

  const second = applyRouterCommandAllowlist(first.text);
  assert.equal(second.patched, true);
  assert.equal(second.text, first.text, "重复执行不应重复插入");
  assert.equal((second.text.match(/\["dshin"/g) || []).length, 1);
});

test("applyRouterCommandAllowlist：锚点不存在时返回 patched=false（不能假装成功）", () => {
  const result = applyRouterCommandAllowlist("export function unrelated() {\n  return 1;\n}\n");
  assert.equal(result.patched, false);
  assert.equal(result.text, "export function unrelated() {\n  return 1;\n}\n");
  assert.equal(applyRouterCommandAllowlist("").patched, false);
});

test("容器配置成功文案只在补丁命中时给出", () => {
  const container = source("host/vika/container.mjs");
  assert.match(container, /if \(allowlist\.patched\.length > 0\) \{[\s\S]*?steps\.push\(/);
  assert.match(container, /if \(allowlist\.unmatched\.length > 0\) \{[\s\S]*?警告/);
});

test("插件源码不把临时文件写到 cwd/AgentsDo", () => {
  const files = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir.replaceAll("\\", "/"), entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "runtime") continue;
        walk(rel);
      } else if (entry.name.endsWith(".mjs")) files.push(rel);
    }
  };
  walk("host");
  for (const file of files) {
    const text = source(file);
    assert.doesNotMatch(text, /["']AgentsDo["']/, `${file} 不应把 AgentsDo 当作目录名`);
    assert.doesNotMatch(text, /AgentsDo\//, `${file} 不应写 AgentsDo/ 子路径`);
  }
  assert.match(source("host/vika/container.mjs"), /os\.tmpdir\(\)/);
});
