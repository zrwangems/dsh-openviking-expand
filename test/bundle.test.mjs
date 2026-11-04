import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("lib/client.js 是懒 CJS 信封，且导出 inject/apply", () => {
  const bundle = readFileSync(join(root, "lib", "client.js"), "utf8");
  assert.match(bundle, /^\/\*\*[\s\S]*?\*\/\nwindow\.__ModuleLoader__\.load\(\{/);
  assert.match(bundle, /id: 'dsh-openviking-expand'/);
  assert.match(bundle, /factory: \(require\) => \{/);
  assert.match(bundle, /var React = require\('react'\)/);
  assert.match(bundle, /exports\.inject = ovxPlugin\.inject/);
  assert.match(bundle, /exports\.apply = ovxPlugin\.apply/);
  assert.match(bundle, /return module\.exports/);
  // console 组件与 sidebar 组件都必须在同一个信封里
  assert.match(bundle, /const consolePart = \{/);
  assert.match(bundle, /OVX_BROWSE_TAB/);
  assert.match(bundle, /OVX_ITEM_TAB/);
});

test("片段里不出现 import/export（必须共享同一工厂作用域）", () => {
  const dir = join(root, "client");
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".mjs")) continue;
    const text = readFileSync(join(dir, name), "utf8");
    assert.doesNotMatch(text, /^\s*(import|export)\s/m, `client/${name} 不能含 import/export`);
  }
});

test("插件设置页不再包含 vika 配置（改为 README 提示词）", () => {
  const connect = readFileSync(join(root, "client", "connect.mjs"), "utf8");
  const bundle = readFileSync(join(root, "lib", "client.js"), "utf8");
  for (const text of [connect, bundle]) {
    assert.doesNotMatch(text, /openviking-vika-config/, "不应再有 vika 配置接口调用");
    assert.doesNotMatch(text, /VikaSettingsForm/, "不应再有 vika 配置表单");
    assert.doesNotMatch(text, /一键配置 Vika|恢复 Vika 原始接线/, "不应再有 vika 配置按钮");
  }
  const host = readFileSync(join(root, "host", "index.mjs"), "utf8");
  assert.doesNotMatch(host, /config-routes|mountVikaConfigRoutes/, "壳层不应再挂载 vika 配置路由");
  assert.equal(existsSync(join(root, "host", "vika", "config-routes.mjs")), false, "config-routes.mjs 应已删除");
});

test("package.json 与 cordis.patch.yml、entry 导出一致", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.name, "dsh-openviking-expand");
  // 包根入口是纯壳层：DSH 的 client 插件按包根行加载，三个组件都可以单独关闭。
  assert.equal(pkg.main, "host/index.mjs");
  assert.equal(pkg.exports["."], "./host/index.mjs");
  assert.equal(pkg.icon, "./icons/openviking-expand.png");
  assert.ok(readFileSync(join(root, "icons", "openviking-expand.png")).length < 256 * 1024, "插件图标不能超过 256 KiB");
  assert.equal(pkg.exports["./client"], "./lib/client.js");
  // 三个组件各自是一个可单独装的插件入口。
  for (const name of ["console", "sidebar", "vika"]) {
    assert.equal(pkg.exports[`./${name}`], `./host/components/${name}/index.mjs`);
  }
  assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
  assert.equal(pkg.dsh.client.platform, "web");

  const patch = readFileSync(join(root, "cordis.patch.yml"), "utf8");
  // 组合补丁只插三行组件；console 是独立包根（加载 client.js），其余用子路径。
  assert.match(patch, /name: 'dsh-openviking-expand\/console'/);
  assert.match(patch, /name: 'dsh-openviking-expand\/sidebar'/);
  assert.match(patch, /name: 'dsh-openviking-expand\/vika'/);
  assert.match(patch, /id: openviking-expand-shell/);
  assert.match(patch, /name: 'dsh-openviking-expand'\s*$/m);
  // vika 组件默认关闭：装好后只跑 console/sidebar，需要时在插件页手动打开。
  assert.match(patch, /id: openviking-expand-vika[\s\S]*?disabled: true/);
  // 三个组件的显示名来自各自的 locale 资源（console / sidebar / vika），不带图标。
  for (const [dir, title] of [["locale/console", "console"], ["locale/sidebar", "sidebar"], ["locale/vika", "vika"]]) {
    const locale = JSON.parse(readFileSync(join(root, dir, "en.json"), "utf8"));
    assert.equal(locale.meta.title, title);
  }
  // 两个 agent preset 是 vika 组件的固定输入，由组件运行时注册，不能再作为插件行出现在补丁里。
  assert.doesNotMatch(patch, /agent-preset|preset/);
  const vikaComponent = readFileSync(join(root, "host", "components", "vika", "index.mjs"), "utf8");
  assert.match(vikaComponent, /VIKA_AGENT_PRESETS/);
  assert.match(vikaComponent, /agentPresets/);
  assert.doesNotThrow(() => readFileSync(join(root, "host", "components", "vika", "presets.mjs"), "utf8"));

  const entry = readFileSync(join(root, "lib", "client.js"), "utf8");
  assert.match(entry, new RegExp(`id: '${pkg.name}'`));

  const locale = JSON.parse(readFileSync(join(root, "locale", "zh.json"), "utf8"));
  assert.match(locale.meta.title, /OpenViking/);
});

test("vika 组件文件齐全且会被打包", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.files.includes("vika/"), true, "package.json files 必须包含 vika/");
  for (const name of ["dsh-bridge.mjs", "gh-work.mjs", "gh-inbox.mjs"]) {
    const file = join(root, "vika", "tools", name);
    const text = readFileSync(file, "utf8");
    assert.match(text, /^#!\/usr\/bin\/env node/, `vika/tools/${name} 需要 shebang`);
  }
  for (const name of ["role-dsh.md", "role-github.md"]) {
    assert.match(readFileSync(join(root, "vika", name), "utf8"), /DSH|GitHub/, `vika/${name} 内容不完整`);
  }
  for (const name of ["config.mjs", "registry.mjs", "controller.mjs", "bridge.mjs", "index.mjs"]) {
    assert.doesNotThrow(() => readFileSync(join(root, "host", "vika", name), "utf8"), `host/vika/${name} 缺失`);
  }
  // 包根壳层只加载客户端，不挂载任何组件；三个组件各自是独立 Cordis 插件。
  const host = readFileSync(join(root, "host", "index.mjs"), "utf8");
  assert.doesNotMatch(host, /components\//, "壳层不应直接 import 组件");
  assert.doesNotMatch(host, /mountVika\(/, "壳层不应直接挂载功能");
  for (const name of ["console", "sidebar", "vika"]) {
    const component = readFileSync(join(root, "host", "components", name, "index.mjs"), "utf8");
    assert.match(component, /export const name/, `components/${name} 需要独立插件名`);
    assert.match(component, /export function apply/, `components/${name} 需要 apply`);
  }
  // vika 面板/引擎来自 vendored runtime（Windows 适配版），必须随包发布。
  for (const file of ["lib/index.js", "lib/client.js", "lib/vika-watch.js", "client.js", "locale/zh.json"]) {
    assert.doesNotThrow(() => readFileSync(join(root, "vika", "runtime", file), "utf8"), `vika/runtime/${file} 缺失`);
  }
  assert.equal(existsSync(join(root, "vika", "runtime", "lib", "index.js")), true, "必须包含 vendored vika runtime");
});
