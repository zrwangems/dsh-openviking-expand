import assert from "node:assert/strict";
import test from "node:test";

import {
  assertVikingUri,
  childUri,
  listDirectory,
  openItem,
  readFile,
  uriName,
} from "../host/viking-fs.mjs";
import { fakeClient } from "./fake.mjs";

test("只接受 viking:// URI，并拒绝路径逃逸", () => {
  assert.equal(assertVikingUri("viking://resources/a"), "viking://resources/a");
  assert.equal(assertVikingUri("viking://"), "viking://");
  for (const bad of [
    "",
    "/etc/passwd",
    "file:///c:/windows",
    "http://127.0.0.1:1933/api/v1/fs/ls",
    "viking://resources/../../etc/passwd",
    "viking://resources/./x",
    "viking://resources/x?y=1",
    "viking://resources\\x",
    "viking://resources/\u0000x",
  ]) {
    assert.throws(() => assertVikingUri(bad), /bad-uri|只接受|控制字符|查询串|路径段|缺少/, `应拒绝：${bad}`);
  }
});

test("uriName 与 childUri 处理根和层级", () => {
  assert.equal(uriName("viking://resources/EMS_paper"), "EMS_paper");
  assert.equal(uriName("viking://resources/EMS_paper/"), "EMS_paper");
  assert.equal(uriName("viking://"), "viking://");
  assert.equal(childUri("viking://resources/EMS_paper", ".abstract.md"), "viking://resources/EMS_paper/.abstract.md");
  assert.equal(childUri("viking://resources/EMS_paper/", ".overview.md"), "viking://resources/EMS_paper/.overview.md");
  assert.equal(childUri("viking://", "resources"), "viking://resources");
});

test("listDirectory 归一化条目并透传隐藏项开关", async () => {
  const client = fakeClient({
    list: () => ({
      entries: [
        { uri: "viking://resources/EMS_paper", isDir: true, size: 0, modTime: "2026-10-30T02:27:28.000Z", abstract: "摘要", overview: "# EMS_paper" },
        { uri: "viking://resources/plain", isDir: true, size: 0 },
        { uri: "viking://resources/index.md", isDir: false, size: 120 },
      ],
      hasMore: true,
    }),
  });
  const page = await listDirectory(client, "viking://resources", { showHidden: true, nodeLimit: 10 });
  assert.equal(page.uri, "viking://resources");
  assert.equal(page.hasMore, true);
  assert.deepEqual(page.entries.map(entry => entry.name), ["EMS_paper", "plain", "index.md"]);
  assert.equal(page.entries[0].isDir, true);
  assert.equal(page.entries[0].abstract, "摘要");
  // 有没有 L0/L1 是目录树决定给不给「打开」按钮的依据
  assert.equal(page.entries[0].hasL0, true);
  assert.equal(page.entries[0].hasL1, true);
  assert.equal(page.entries[1].hasL0, false);
  assert.equal(page.entries[1].hasL1, false);
  assert.equal(page.entries[2].hasL0, false);
  assert.equal(client.calls[0].options.showHidden, true);
  assert.equal(client.calls[0].options.nodeLimit, 10);
});

test("readFile 区分文本、二进制与超大文件", async () => {
  const text = await readFile(fakeClient({ files: { "viking://resources/a.md": "# 标题\n正文" } }), "viking://resources/a.md");
  assert.equal(text.kind, "text");
  assert.equal(text.content, "# 标题\n正文");
  assert.equal(text.name, "a.md");

  const binary = await readFile(fakeClient({ files: { "viking://resources/a.png": "PNG\u0000\u0001binary" } }), "viking://resources/a.png");
  assert.equal(binary.kind, "binary");

  const huge = await readFile(
    fakeClient({ files: { "viking://resources/big.md": "x".repeat(4096) } }),
    "viking://resources/big.md",
    { maxFileBytes: 1024 },
  );
  assert.equal(huge.kind, "too-large");
  assert.equal(huge.previewLines, 200);
});

test("openItem 对目录给出 L0+L1 与子项", async () => {
  const uri = "viking://resources/demo";
  const client = fakeClient({
    dirs: [uri],
    files: {
      [`${uri}/.abstract.md`]: "---\ndirectory: viking://resources/demo/\ngenerated_by:\n  component: SemanticProcessor\n  trigger: parent_refresh\nfreshness:\n  total_entries: 1\n---\n\n目录摘要正文",
      [`${uri}/.overview.md`]: "---\ndirectory: viking://resources/demo/\n---\n\n# demo\n\n## 目录覆盖\n\n- 子项",
    },
    list: () => ({ entries: [{ uri: `${uri}/子项`, isDir: true, size: 0 }], hasMore: false }),
  });
  const item = await openItem(client, uri);
  assert.equal(item.kind, "dir");
  assert.equal(item.name, "demo");
  assert.equal(item.l0.meta.component, "SemanticProcessor");
  assert.match(item.l0.body, /目录摘要正文/);
  assert.match(item.l1.body, /目录覆盖/);
  assert.deepEqual(item.children, [{ uri: "viking://resources/demo/子项", name: "子项", isDir: true }]);
});

test("openItem 对缺失的 L0/L1 返回 null 而不是抛错", async () => {
  const uri = "viking://resources/plain";
  const client = fakeClient({ dirs: [uri], list: () => ({ entries: [], hasMore: false }) });
  const item = await openItem(client, uri);
  assert.equal(item.kind, "dir");
  assert.equal(item.l0, null);
  assert.equal(item.l1, null);
  assert.deepEqual(item.children, []);
});

test("openItem 对文件返回正文", async () => {
  const uri = "viking://resources/note.md";
  const item = await openItem(fakeClient({ files: { [uri]: "hello" } }), uri);
  assert.equal(item.kind, "file");
  assert.equal(item.contentKind, "text");
  assert.equal(item.content, "hello");
});

test("semantic listing 不支持时退回普通目录读取", async () => {
  const calls = [];
  const client = {
    async ls(uri, options) {
      calls.push({ uri, options });
      if (options.semantic !== false) {
        throw new Error("semantic listing output is not supported for namespace: viking://system");
      }
      return { entries: [{ uri: "viking://system/a", name: "a", isDir: false }], hasMore: false };
    },
  };
  const result = await listDirectory(client, "viking://resources", { root: "viking://resources" });
  assert.equal(result.entries.length, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.semantic, true);
  assert.equal(calls[1].options.semantic, false);
});
