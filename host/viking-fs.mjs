/**
 * viking:// 只读访问层：把 OpenViking 的 fs/content 接口整理成浏览器半侧要的形状。
 *
 * 三件事：
 *  - URI 校验（只接受 viking://，拒绝 `..` 与控制字符，绝不碰宿主机文件系统）；
 *  - 目录列表（ls）与文件正文（read）；
 *  - 目录的 L0+L1 组合数据（.abstract.md / .overview.md 的 front matter + 正文）。
 */
import { OvError } from "./connection.mjs";
import { describeMeta, splitFrontMatter } from "./frontmatter.mjs";

/** L0 摘要文件（隐藏项，默认不在树里出现）。 */
export const L0_FILE = ".abstract.md";

/** L1 概览文件。 */
export const L1_FILE = ".overview.md";

/** 目录视图里最多带回的子项数量。 */
const CHILDREN_LIMIT = 200;

/** 超大文件的预览行数。 */
const PREVIEW_LINES = 200;

/** URI 合法性：协议、路径段、控制字符、查询串全部检查。 */
export function assertVikingUri(uri) {
  if (typeof uri !== "string" || uri.trim() === "") {
    throw new OvError("bad-uri", "缺少 viking:// URI");
  }
  const text = uri.trim();
  if (!text.startsWith("viking://")) {
    throw new OvError("bad-uri", `只接受 viking:// URI：${text}`);
  }
  if (/[\u0000-\u001f\u007f]/.test(text)) {
    throw new OvError("bad-uri", "URI 含控制字符");
  }
  if (/[?#\\]/.test(text)) {
    throw new OvError("bad-uri", "URI 不能带查询串、片段或反斜杠");
  }
  const path = text.slice("viking://".length);
  if (path.split("/").some(segment => segment === ".." || segment === ".")) {
    throw new OvError("bad-uri", "URI 不能包含 . 或 .. 路径段");
  }
  return text;
}

/** 取 URI 末段作为显示名；根返回 `viking://`。 */
export function uriName(uri) {
  const text = String(uri || "").replace(/\/+$/, "");
  if (text === "viking://" || text === "viking:") return "viking://";
  const index = text.lastIndexOf("/");
  return index === -1 ? text : text.slice(index + 1);
}

/** 拼接子项 URI（父 URI 的无尾斜杠形式 + 名字）。 */
export function childUri(parent, name) {
  const raw = String(parent || "");
  const leaf = String(name || "").replace(/^\/+/, "");
  if (raw === "viking://" || raw === "viking:") return `viking://${leaf}`;
  const base = raw.replace(/\/+$/, "");
  return `${base}/${leaf}`;
}

function toEntry(raw) {
  const uri = typeof raw?.uri === "string" ? raw.uri : "";
  const abstract = typeof raw?.abstract === "string" ? raw.abstract : "";
  const overview = typeof raw?.overview === "string" ? raw.overview : "";
  return {
    uri,
    name: uriName(uri),
    isDir: raw?.isDir === true,
    size: typeof raw?.size === "number" ? raw.size : 0,
    modTime: typeof raw?.modTime === "string" ? raw.modTime : null,
    abstract,
    // 有没有 L0/L1：目录树据此决定要不要给「打开 L0+L1」的入口。
    hasL0: abstract.trim() !== "",
    hasL1: overview.trim() !== "",
  };
}

/**
 * 列一层目录。
 * @returns {Promise<{uri: string, root: string, entries: Array, hasMore: boolean}>}
 */
export async function listDirectory(client, uri, { root, showHidden = false, nodeLimit = 1000 } = {}) {
  const target = assertVikingUri(uri || root);
  const semantic = !/^viking:\/\/system(?:\/|$)/.test(target);
  let page;
  try {
    page = await client.ls(target, { showHidden, nodeLimit, semantic });
  } catch (error) {
    // 旧版 OV 或系统命名空间仍可能拒绝 semantic listing：退回普通目录读取。
    if (!/semantic listing output is not supported/i.test(String(error && error.message ? error.message : error))) throw error;
    page = await client.ls(target, { showHidden, nodeLimit, semantic: false });
  }
  const entries = page.entries
    .map(toEntry)
    .filter(entry => entry.uri !== "");
  return { uri: target, root: root || target, entries, hasMore: page.hasMore };
}

function isProbablyBinary(text) {
  if (text === "") return false;
  let suspicious = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0) return true;
    if (code < 9 || (code > 13 && code < 32)) suspicious += 1;
  }
  return suspicious > text.length * 0.02;
}

/**
 * 读文件正文（L2），按大小给出三种形态。
 * @returns {Promise<object>} kind: text | binary | too-large
 */
export async function readFile(client, uri, { maxFileBytes = 1024 * 1024 } = {}) {
  const target = assertVikingUri(uri);
  const content = await client.read(target);
  const text = typeof content === "string" ? content : String(content ?? "");
  const size = Buffer.byteLength(text, "utf8");
  if (isProbablyBinary(text)) {
    return { kind: "binary", uri: target, name: uriName(target), size, preview: "" };
  }
  if (size > maxFileBytes) {
    const preview = await client.read(target, { offset: 0, limit: PREVIEW_LINES }).catch(() => text.slice(0, 20000));
    return {
      kind: "too-large",
      uri: target,
      name: uriName(target),
      size,
      preview: typeof preview === "string" ? preview : text.slice(0, 20000),
      previewLines: PREVIEW_LINES,
    };
  }
  return { kind: "text", uri: target, name: uriName(target), size, content: text };
}

/**
 * 读一层 L0/L1（生成文件带 front matter）。文件不存在时返回 null 而不是抛错：
 * 不是每个目录都生成过摘要，这是正常状态。
 */
async function readLayer(client, uri) {
  try {
    const raw = await client.read(uri);
    const text = typeof raw === "string" ? raw : String(raw ?? "");
    const parsed = splitFrontMatter(text);
    return {
      frontMatter: parsed.frontMatter,
      meta: describeMeta(parsed.meta),
      rawMeta: parsed.meta,
      body: parsed.body,
    };
  } catch (error) {
    if (error?.code === "not-found") return null;
    throw error;
  }
}

/**
 * 打开一个条目：目录给 L0+L1 组合（附子项名），文件给正文。
 * @returns {Promise<object>} kind: dir | file
 */
export async function openItem(client, uri, { maxFileBytes = 1024 * 1024, nodeLimit = 1000 } = {}) {
  const target = assertVikingUri(uri);
  const stat = await client.request("/api/v1/fs/stat", { uri: target });
  const isDir = stat?.isDir === true;
  if (!isDir) {
    const file = await readFile(client, target, { maxFileBytes });
    // kind:'file' 是条目类型，内容形态单独放在 contentKind，避免两个含义撞在一个字段上。
    return {
      kind: "file",
      contentKind: file.kind,
      uri: file.uri,
      name: file.name,
      size: file.size,
      content: file.content,
      preview: file.preview,
      previewLines: file.previewLines,
    };
  }
  const [l0, l1, children] = await Promise.all([
    readLayer(client, childUri(target, L0_FILE)),
    readLayer(client, childUri(target, L1_FILE)),
    listDirectory(client, target, { nodeLimit: Math.min(nodeLimit, CHILDREN_LIMIT) }).catch(() => ({
      entries: [],
      hasMore: false,
    })),
  ]);
  return {
    kind: "dir",
    uri: target,
    name: uriName(target),
    l0,
    l1,
    children: children.entries.map(entry => ({ uri: entry.uri, name: entry.name, isDir: entry.isDir })),
    childrenHasMore: children.hasMore === true,
  };
}
