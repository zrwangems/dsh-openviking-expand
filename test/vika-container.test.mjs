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
import { applyRouterCommandAllowlist, removeRouterCommandAllowlist } from "../host/vika/container.mjs";

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

test("removeRouterCommandAllowlist：撤销补丁后源码回到原样", () => {
  const patched = applyRouterCommandAllowlist(commandsSource);
  const result = removeRouterCommandAllowlist(patched.text);
  assert.equal(result.removed, true);
  assert.doesNotMatch(result.text, /\["dshin"/);
  assert.equal(result.text, commandsSource, "撤销后应与原始源码一致");

  // 没有补丁时不误删、不报错。
  const clean = removeRouterCommandAllowlist(commandsSource);
  assert.equal(clean.removed, false);
  assert.equal(clean.text, commandsSource);
  assert.equal(removeRouterCommandAllowlist("").removed, false);
});

test("恢复 Vika 原始接线覆盖一键配置与 GitHub 登录的改动", () => {
  const container = source("host/vika/container.mjs");
  const start = container.indexOf("export async function resetVikaContainer");
  assert.ok(start > 0, "缺少 resetVikaContainer");
  const reset = container.slice(start);
  assert.match(reset, /revertRouterCommands\(container\)/, "必须撤销 /dshin 命令解析补丁");
  assert.match(reset, /restoreGitIdentity\(container\)/, "必须还原 git 身份");
  assert.match(reset, /rm -rf \/root\/\.vika\/tools\/gh/, "必须删除 gh 登录态目录");
  assert.match(reset, /apt-get remove -y gh/, "插件装的 gh 必须卸载");
  assert.match(reset, /config\.json\.bak\.plugin-/, "必须清理插件产生的 config 备份");
  assert.match(reset, /hostState/, "必须清空宿主 .vika 状态");
});

test("容器部署不依赖 docker cp，并带重试与引擎预检", () => {
  const container = source("host/vika/container.mjs");
  assert.doesNotMatch(container, /docker\(\["cp"/, "不应再调用 docker cp（引擎抖动时容易失败）");
  assert.match(container, /withDockerRetry/, "文件写入/建目录要带重试");
  assert.match(container, /Docker 引擎没有响应/, "引擎无响应时要给出可操作提示");
  assert.match(container, /writeContainerFile\(container, containerFile, content\)/, "文本文件走 exec + stdin 写入");
});

test("恢复接线直接写容器 config.json，不依赖系统临时目录", () => {
  const container = source("host/vika/container.mjs");
  const start = container.indexOf("export async function resetVikaContainer");
  const reset = container.slice(start);
  assert.match(reset, /writeContainerFile\(container, "\/root\/\.vika\/config\.json"/, "恢复时直接写容器");
  assert.doesNotMatch(reset, /\.vika-reset-config-/, "恢复流程不应再依赖临时文件");
});

test("容器列表查询 15 秒超时并重试，失败给出可操作提示", () => {
  const container = source("host/vika/container.mjs");
  assert.match(container, /async function dockerQuery/, "查询类 docker 命令要统一短超时");
  assert.match(container, /timeout = 15000/, "默认超时 15 秒");
  assert.match(container, /Docker 引擎没有响应/, "失败时提示重启 Docker Desktop");
  assert.match(container, /listVikaContainers[\s\S]*?dockerQuery/, "容器列表走短超时查询");
  assert.match(container, /containerMounts[\s\S]*?dockerQuery/, "挂载查询走短超时查询");
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
