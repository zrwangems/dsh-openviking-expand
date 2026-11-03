#!/usr/bin/env node
/**
 * 把 client/*.mjs 拼成 lib/client.js。
 *
 * DSH 的客户端模块系统要求懒 CJS 信封：脚本本身只登记工厂，工厂里
 * `require('react')` 并返回 { inject, apply }。片段共享同一个工厂作用域，
 * 所以片段里不能写 import/export，也不能各自 require。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_NAME = "dsh-openviking-expand";
// 顺序有意义：console 片段最后声明 consolePart，entry 片段最后引用各组件。
const FRAGMENTS = [
  "style.mjs",
  "api.mjs",
  "markdown.mjs",
  "draft.mjs",
  "tree.mjs",
  "item.mjs",
  "console.mjs",
  "connect.mjs",
  "vika/runtime-client.mjs",
  "vika/runtime.mjs",
  "entry.mjs",
];

const header = `/**
 * dsh-openviking-expand —— 浏览器半侧。
 * 生成文件，不要手改：源码在 client/ 下，由 node scripts/build-client.mjs 拼装。
 */
window.__ModuleLoader__.load({
  id: '${PACKAGE_NAME}',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')
    var h = React.createElement
`;

const footer = `    exports.inject = ovxPlugin.inject
    exports.apply = ovxPlugin.apply
    return module.exports
  },
})
`;

// 把 vendored vika runtime 的客户端包转成一个工厂片段，供我们的信封加载。
// 它的 client.js 是独立的 ModuleLoader 信封；提取 factory 主体后在本插件工厂里调用。
const runtimeClientPath = join(root, "vika", "runtime", "client.js");
const runtimeClientText = readFileSync(runtimeClientPath, "utf8");
const factoryMarker = "factory: (require) => {";
const factoryStart = runtimeClientText.indexOf(factoryMarker);
if (factoryStart < 0) throw new Error("vika/runtime/client.js 缺少 factory");
const bodyStart = runtimeClientText.indexOf("\n", factoryStart) + 1;
const bodyEnd = runtimeClientText.lastIndexOf("\n\t}\n});");
if (bodyEnd < 0) throw new Error("vika/runtime/client.js 找不到 factory 结尾");
const runtimeBody = runtimeClientText.slice(bodyStart, bodyEnd).trimEnd();
const runtimeFragment = `/**
 * vika runtime 面板客户端（生成文件，勿手改）。
 * 源：vika/runtime/client.js；由 scripts/build-client.mjs 提取 factory 主体。
 */
var runtimeClientFactory = function (require) {
${runtimeBody}
}
`;
writeFileSync(join(root, "client", "vika", "runtime-client.mjs"), runtimeFragment, "utf8");

const body = FRAGMENTS.map(name => {
  const text = readFileSync(join(root, "client", name), "utf8");
  if (/^\s*(import|export)\s/m.test(text)) {
    throw new Error(`client/${name} 含 import/export：片段必须共享同一工厂作用域`);
  }
  return `    // ---- client/${name} ----\n${text.trimEnd()}\n`;
}).join("\n");

mkdirSync(join(root, "lib"), { recursive: true });
const target = join(root, "lib", "client.js");
const output = `${header}${body}${footer}`;
writeFileSync(target, output, "utf8");
process.stdout.write(`built ${target} (${FRAGMENTS.length} fragments, ${Buffer.byteLength(output)} bytes)\n`);
