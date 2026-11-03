import assert from "node:assert/strict";
import test from "node:test";

import { describeMeta, parseBlock, splitFrontMatter } from "../host/frontmatter.mjs";

const SAMPLE = [
  "---",
  "directory: viking://resources/EMS_paper/",
  "generated_by:",
  "  component: SemanticProcessor",
  "  trigger: parent_refresh",
  "freshness:",
  "  total_entries: 2",
  "  sampled_entries: 2",
  "  unsampled_entries: 0",
  "  pending_child_changes: 0",
  "---",
  "",
  "本目录是一份论文资料汇编。",
  "",
  "## 目录覆盖",
  "",
  "- 子项 A",
  "",
].join("\n");

test("拆出 front matter 与正文", () => {
  const parsed = splitFrontMatter(SAMPLE);
  assert.ok(parsed.frontMatter.includes("component: SemanticProcessor"));
  // 闭合分隔线之后的空行属于正文（OpenViking 生成文件固定带一个空行）。
  assert.equal(parsed.body, "\n本目录是一份论文资料汇编。\n\n## 目录覆盖\n\n- 子项 A\n");
  assert.equal(parsed.meta.directory, "viking://resources/EMS_paper/");
  assert.equal(parsed.meta.generated_by.component, "SemanticProcessor");
  assert.equal(parsed.meta.freshness.total_entries, 2);
});

test("没有 front matter 时原样返回正文", () => {
  const parsed = splitFrontMatter("# 只有正文\n\n没有元数据。");
  assert.equal(parsed.frontMatter, null);
  assert.equal(parsed.meta, null);
  assert.equal(parsed.body, "# 只有正文\n\n没有元数据。");
});

test("兼容 CRLF 与结尾没有换行的 front matter", () => {
  const raw = "---\r\ndirectory: viking://resources/x/\r\n---\r\n正文";
  const parsed = splitFrontMatter(raw);
  assert.equal(parsed.meta.directory, "viking://resources/x/");
  assert.equal(parsed.body, "正文");
});

test("空字符串与非法输入降级为空正文", () => {
  assert.deepEqual(splitFrontMatter(""), { frontMatter: null, meta: null, body: "" });
  assert.deepEqual(splitFrontMatter(null), { frontMatter: null, meta: null, body: "" });
  const broken = splitFrontMatter("---\ndirectory: viking://x\ntail");
  // 没有闭合分隔线：整段当正文，不吞内容。
  assert.equal(broken.frontMatter, null);
  assert.equal(broken.body, "---\ndirectory: viking://x\ntail");
});

test("标量类型被规范化", () => {
  const meta = parseBlock("flag: true\nsize: 12\nratio: 1.5\nquoted: \"a: b\"\nempty:\n  inner: 1");
  assert.equal(meta.flag, true);
  assert.equal(meta.size, 12);
  assert.equal(meta.ratio, 1.5);
  assert.equal(meta.quoted, "a: b");
  assert.equal(meta.empty.inner, 1);
});

test("describeMeta 摊平成视图字段并保留缺项", () => {
  const meta = describeMeta(splitFrontMatter(SAMPLE).meta);
  assert.equal(meta.directory, "viking://resources/EMS_paper/");
  assert.equal(meta.component, "SemanticProcessor");
  assert.equal(meta.trigger, "parent_refresh");
  assert.deepEqual(meta.freshness, {
    totalEntries: 2,
    sampledEntries: 2,
    unsampledEntries: 0,
    pendingChildChanges: 0,
  });
  assert.equal(describeMeta(null), null);
  const partial = describeMeta({ directory: "viking://resources/y/" });
  assert.equal(partial.component, null);
  assert.equal(partial.freshness, null);
});
