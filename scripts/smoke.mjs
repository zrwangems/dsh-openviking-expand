#!/usr/bin/env node
/**
 * 对着真实的 OpenViking 跑一遍 Host 访问层，确认接口形状没变。
 *
 * 用法（先让 OpenViking 起来）：
 *   node scripts/smoke.mjs [viking://root]
 *
 * 只读：列根目录、列一层、读一个目录的 L0+L1。不写任何东西。
 */
import { resolveConfig } from "../host/config.mjs";
import { createOvClient } from "../host/connection.mjs";
import { listDirectory, openItem } from "../host/viking-fs.mjs";

const endpoint = process.env.OPENVIKING_URL || process.env.OPENVIKING_BASE_URL;
const config = resolveConfig(endpoint ? { endpoint } : {});
const client = createOvClient({ endpoint: config.endpoint, timeoutMs: config.sidebar.timeoutMs });
const root = process.argv[2] || config.sidebar.root;

function line(label, value) {
  process.stdout.write(`${label.padEnd(14)}${value}\n`);
}

const health = await client.healthResult();
line("endpoint", config.endpoint);
line("health", health.ok ? `ok (${health.result?.version || "?"})` : `失败：${health.error?.message}`);

const page = await listDirectory(client, root, { showHidden: false, nodeLimit: 50 });
line("root", page.uri);
line("entries", String(page.entries.length));
for (const entry of page.entries.slice(0, 8)) {
  line("", `${entry.isDir ? "目录" : "文件"}  ${entry.name}${entry.abstract ? `  — ${entry.abstract.slice(0, 40)}…` : ""}`);
}

const firstDir = page.entries.find(entry => entry.isDir);
if (firstDir !== undefined) {
  const item = await openItem(client, firstDir.uri, { maxFileBytes: config.sidebar.maxFileBytes });
  line("item", item.uri);
  line("kind", item.kind);
  if (item.kind === "dir") {
    line("L0", item.l0 === null ? "缺失" : `${item.l0.body.trim().length} 字（front matter ${item.l0.frontMatter ? "有" : "无"}）`);
    line("L1", item.l1 === null ? "缺失" : `${item.l1.body.trim().length} 字`);
    line("子项", String(item.children.length));
    const l0Meta = item.l0?.meta;
    if (l0Meta) line("元数据", `component=${l0Meta.component || "-"} trigger=${l0Meta.trigger || "-"}`);
  }
}

const firstFile = await findFirstFile(client, root, 0);
if (firstFile !== null) {
  const item = await openItem(client, firstFile, { maxFileBytes: config.sidebar.maxFileBytes });
  line("file", item.uri);
  line("kind", `${item.kind}/${item.contentKind}`);
  line("size", String(item.size));
}

async function findFirstFile(ovClient, uri, depth) {
  if (depth > 2) return null;
  const listing = await listDirectory(ovClient, uri, { nodeLimit: 50 }).catch(() => null);
  if (listing === null) return null;
  const file = listing.entries.find(entry => entry.isDir !== true);
  if (file !== undefined) return file.uri;
  for (const entry of listing.entries.filter(candidate => candidate.isDir)) {
    const nested = await findFirstFile(ovClient, entry.uri, depth + 1);
    if (nested !== null) return nested;
  }
  return null;
}
