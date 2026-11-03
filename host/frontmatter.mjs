/**
 * OpenViking 生成文件的 YAML front matter 解析。
 *
 * L0/L1 落盘为 `<dir>/.abstract.md`、`<dir>/.overview.md`，开头是一段固定的
 * front matter（Studio 的 L0/L1 视图里那张元数据卡就来自这里）：
 *
 *   ---
 *   directory: viking://resources/EMS_paper/
 *   generated_by:
 *     component: SemanticProcessor
 *     trigger: parent_refresh
 *   freshness:
 *     total_entries: 2
 *     ...
 *   ---
 *   正文 markdown
 *
 * 这里只实现这段固定形状需要的 YAML 子集（一层嵌套的 key: value），
 * 不引第三方 YAML 库，避免给插件增加运行时依赖。
 */

/**
 * 拆出 front matter 与正文。
 * @param {string} raw 文件原文
 * @returns {{frontMatter: string|null, meta: object|null, body: string}}
 */
export function splitFrontMatter(raw) {
  const text = typeof raw === "string" ? raw : "";
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (match === null) return { frontMatter: null, meta: null, body: text };
  return {
    frontMatter: match[1],
    meta: parseBlock(match[1]),
    body: text.slice(match[0].length),
  };
}

/** 解析 front matter 块；未知行忽略，不抛错。 */
export function parseBlock(block) {
  const meta = {};
  let current = null;
  for (const rawLine of String(block || "").split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    if (line === "" || line.startsWith("#")) continue;
    const nested = /^\s+([A-Za-z0-9_.-]+):(?:[ \t]+(.*))?$/.exec(line);
    if (nested !== null) {
      if (current === null) continue;
      if (!isPlainObject(meta[current])) meta[current] = {};
      meta[current][nested[1]] = nested[2] === undefined ? "" : scalar(nested[2]);
      continue;
    }
    const top = /^([A-Za-z0-9_.-]+):(?:[ \t]+(.*))?$/.exec(line);
    if (top === null) continue;
    current = top[1];
    const value = top[2];
    meta[current] = value === undefined || value === "" ? {} : scalar(value);
  }
  return meta;
}

function scalar(value) {
  const text = String(value).trim();
  if (text === "") return "";
  if (text.startsWith('"') && text.endsWith('"') && text.length > 1) return text.slice(1, -1);
  if (text.startsWith("'") && text.endsWith("'") && text.length > 1) return text.slice(1, -1);
  if (/^-?\d+$/.test(text)) return Number(text);
  if (/^-?\d+\.\d+$/.test(text)) return Number(text);
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null" || text === "~") return null;
  return text;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 把 front matter 摊平成视图要显示的四行摘要。
 * 缺字段时对应项为 null，视图按缺失降级，不显示空行。
 */
export function describeMeta(meta) {
  if (!isPlainObject(meta)) return null;
  const generated = isPlainObject(meta.generated_by) ? meta.generated_by : null;
  const freshness = isPlainObject(meta.freshness) ? meta.freshness : null;
  return {
    directory: typeof meta.directory === "string" ? meta.directory : null,
    component: generated !== null && typeof generated.component === "string" ? generated.component : null,
    trigger: generated !== null && typeof generated.trigger === "string" ? generated.trigger : null,
    freshness: freshness === null
      ? null
      : {
        totalEntries: numberOrNull(freshness.total_entries),
        sampledEntries: numberOrNull(freshness.sampled_entries),
        unsampledEntries: numberOrNull(freshness.unsampled_entries),
        pendingChildChanges: numberOrNull(freshness.pending_child_changes),
      },
  };
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
