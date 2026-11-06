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

test("package.json 与 cordis.patch.yml、entry 导出一致", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.name, "dsh-openviking-expand");
  // 包根入口是纯壳层：DSH 的 client 插件按包根行加载，两个组件都可以单独关闭。
  assert.equal(pkg.main, "host/index.mjs");
  assert.equal(pkg.exports["."], "./host/index.mjs");
  assert.equal(pkg.icon, "./icons/openviking-expand.png");
  assert.ok(readFileSync(join(root, "icons", "openviking-expand.png")).length < 256 * 1024, "插件图标不能超过 256 KiB");
  assert.equal(pkg.exports["./client"], "./lib/client.js");
  // 两个组件各自是一个可单独装的插件入口。
  for (const name of ["console", "sidebar"]) {
    assert.equal(pkg.exports[`./${name}`], `./host/components/${name}/index.mjs`);
  }
  // 插件详情页只放设置：locale 的 meta.detail 指向一个空的占位文档，避免把 README 整段渲染到设置页。
  assert.equal(pkg.files.includes("detail.md"), true, "files 必须包含 detail.md");
  for (const locale of ["locale/zh.json", "locale/en.json"]) {
    const meta = JSON.parse(readFileSync(join(root, locale), "utf8")).meta;
    assert.equal(meta.detail, "detail.md", `${locale} 应把详情指向 detail.md`);
  }
  assert.equal(readFileSync(join(root, "detail.md"), "utf8").trim(), "", "detail.md 不应包含正文");
  assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
  assert.equal(pkg.dsh.client.platform, "web");
  // 0.2.2 起插件兼容性优先按 engines.dsh 判断。
  assert.match(pkg.engines.dsh, /0\.2\.2-rc\.1/);
  assert.match(pkg.engines.dsh, /<0\.3\.0/);

  const patch = readFileSync(join(root, "cordis.patch.yml"), "utf8");
  // 组合补丁只插三行：壳层、console、sidebar；console/sidebar 用子路径。
  assert.match(patch, /name: 'dsh-openviking-expand\/console'/);
  assert.match(patch, /name: 'dsh-openviking-expand\/sidebar'/);
  assert.match(patch, /id: openviking-expand-shell/);
  assert.match(patch, /name: 'dsh-openviking-expand'\s*$/m);
  // 两个组件的显示名来自各自的 locale 资源（console / sidebar），不带图标。
  for (const [dir, title] of [["locale/console", "console"], ["locale/sidebar", "sidebar"]]) {
    const locale = JSON.parse(readFileSync(join(root, dir, "en.json"), "utf8"));
    assert.equal(locale.meta.title, title);
  }
  // agent preset 不再作为插件行出现在补丁里。
  assert.doesNotMatch(patch, /agent-preset|preset/);

  const entry = readFileSync(join(root, "lib", "client.js"), "utf8");
  assert.match(entry, new RegExp(`id: '${pkg.name}'`));

  const locale = JSON.parse(readFileSync(join(root, "locale", "zh.json"), "utf8"));
  assert.match(locale.meta.title, /OpenViking/);
});

test("两个组件文件齐全且会被打包", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  // 包根壳层只加载客户端，不挂载任何组件；两个组件各自是独立 Cordis 插件。
  const host = readFileSync(join(root, "host", "index.mjs"), "utf8");
  assert.doesNotMatch(host, /components\//, "壳层不应直接 import 组件");
  for (const name of ["console", "sidebar"]) {
    const component = readFileSync(join(root, "host", "components", name, "index.mjs"), "utf8");
    assert.match(component, /export const name/, `components/${name} 需要独立插件名`);
    assert.match(component, /export function apply/, `components/${name} 需要 apply`);
  }
  // 图标与 locale 都随包发布。
  for (const file of ["icons/openviking-expand.png", "icons/console.png", "icons/sidebar.png", "locale/zh.json", "locale/en.json"]) {
    assert.doesNotThrow(() => readFileSync(join(root, file), "utf8"), `${file} 缺失`);
  }
  for (const dir of ["host/", "client/", "lib/", "locale/", "scripts/"]) {
    assert.equal(pkg.files.includes(dir), true, `package.json files 必须包含 ${dir}`);
  }
  // 删除 vika 后不再有任何运行时依赖。
  assert.equal(pkg.dependencies, undefined, "插件不应再声明 dependencies");
});

test("已删除的第三个组件不再出现在包里", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  for (const gone of ["./vika", "./vika/locale/*.json", "./vika/icon"]) {
    assert.equal(pkg.exports[gone], undefined, `exports 不应再有 ${gone}`);
  }
  assert.equal(pkg.files.includes("vika/"), false, "files 不应再包含 vika/");
  for (const dir of ["vika", "client/vika", "host/vika", "host/components/vika", "locale/vika"]) {
    assert.equal(existsSync(join(root, dir)), false, `${dir} 应已删除`);
  }
  assert.equal(existsSync(join(root, "icons", "vika.png")), false, "icons/vika.png 应已删除");
  assert.equal(existsSync(join(root, "test", "vika-fixtures.mjs")), false, "vika 测试夹具应已删除");
  const patch = readFileSync(join(root, "cordis.patch.yml"), "utf8");
  assert.doesNotMatch(patch, /vika/i, "组合补丁不应再有 vika 行");
  const bundle = readFileSync(join(root, "lib", "client.js"), "utf8");
  assert.doesNotMatch(bundle, /vika/i, "客户端信封不应再有 vika 代码");
});
