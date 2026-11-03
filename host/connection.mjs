/**
 * OpenViking HTTP 客户端（只在 Host 进程内运行）。
 *
 * 浏览器半侧永远不持有 API key：它只请求本插件自己的 /openviking-expand/* 路由，
 * 由这里带着 key 去问 OpenViking。
 *
 * key 的解析顺序：config.apiKey → OPENVIKING_API_KEY → ~/.openviking/ovcli.conf。
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** ov 命令行工具写的凭据文件；与 dsh-memory-plugin 的位置一致。 */
export const CREDENTIAL_FILE = join(homedir(), ".openviking", "ovcli.conf");

/** 一个带错误码的 OpenViking 调用失败；路由层按 code 映射 HTTP 状态。 */
export class OvError extends Error {
  constructor(code, message, { status = 0, uri } = {}) {
    super(message);
    this.name = "OvError";
    this.code = code;
    this.status = status;
    if (uri !== undefined) this.uri = uri;
  }
}

/**
 * @param {object} options
 * @param {string} options.endpoint OpenViking 服务地址（无尾斜杠）
 * @param {string} [options.apiKey] 组合行上写的 key
 * @param {string} [options.accountId] 可信模式下的 account（无 key 时随请求头透传）
 * @param {string} [options.userId] 可信模式下的 user
 * @param {boolean} [options.allowCredentialFallback] 无 key 时是否读环境变量/ovcli.conf
 *   （目标就是本机配置的服务才允许，免得把本机凭据发给别的地址）
 * @param {number} [options.timeoutMs] 单次请求预算
 * @param {Function} [options.fetchImpl] 测试注入
 * @param {string} [options.credentialFile] 测试注入
 */
export function createOvClient({
  endpoint,
  apiKey = "",
  adminApiKey = "",
  accountId = "",
  userId = "",
  allowCredentialFallback = true,
  timeoutMs = 15000,
  fetchImpl,
  credentialFile = CREDENTIAL_FILE,
} = {}) {
  const base = String(endpoint || "").replace(/\/+$/, "");
  let cachedKey;
  let cachedAdminKey;

  async function resolveApiKey() {
    if (apiKey) return apiKey;
    if (!allowCredentialFallback) return "";
    if (cachedKey !== undefined) return cachedKey;
    const fromEnv = String(process.env.OPENVIKING_API_KEY || "").trim();
    if (fromEnv) {
      cachedKey = fromEnv;
      return cachedKey;
    }
    try {
      const parsed = JSON.parse(await readFile(credentialFile, "utf8"));
      cachedKey = typeof parsed?.api_key === "string" ? parsed.api_key.trim() : "";
    } catch {
      cachedKey = "";
    }
    return cachedKey;
  }

  /** root/管理员 Key：显式传入优先，否则读环境变量或本机 ovcli.conf 的 root_api_key。 */
  async function resolveAdminKey() {
    if (adminApiKey) return adminApiKey;
    if (!allowCredentialFallback) return "";
    if (cachedAdminKey !== undefined) return cachedAdminKey;
    const fromEnv = String(process.env.OPENVIKING_ROOT_API_KEY || "").trim();
    if (fromEnv) { cachedAdminKey = fromEnv; return cachedAdminKey; }
    try {
      const parsed = JSON.parse(await readFile(credentialFile, "utf8"));
      cachedAdminKey = typeof parsed?.root_api_key === "string" ? parsed.root_api_key.trim() : "";
    } catch {
      cachedAdminKey = "";
    }
    return cachedAdminKey;
  }

  /** 每个请求的鉴权头：有 key 就用 key；没有 key 时才透传可信模式的 account/user。 */
  async function authHeaders() {
    const headers = { accept: "application/json" };
    const key = await resolveApiKey();
    if (key) {
      headers["x-api-key"] = key;
      return headers;
    }
    if (accountId) headers["x-openviking-account"] = accountId;
    if (userId) headers["x-openviking-user"] = userId;
    return headers;
  }

  /** 调一个 /api/v1/* 接口，返回 `result`；失败统一抛 OvError。 */
  async function request(path, params = {}) {
    const url = new URL(path, `${base}/`);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    const headers = await authHeaders();
    const doFetch = fetchImpl || fetch;
    let response;
    try {
      response = await doFetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const name = error?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        throw new OvError("timeout", `OpenViking 请求超时（${timeoutMs} ms）`);
      }
      throw new OvError("unreachable", `无法连接 OpenViking（${base}）`);
    }
    const bodyText = await response.text().catch(() => "");
    const payload = parseJson(bodyText);
    if (!response.ok || payload?.status === "error") {
      const message = typeof payload?.error?.message === "string" && payload.error.message !== ""
        ? payload.error.message
        : `OpenViking 返回 HTTP ${response.status}`;
      throw new OvError(mapStatus(response.status, payload), message, { status: response.status });
    }
    if (payload === null) throw new OvError("bad-response", "OpenViking 返回了无法解析的 JSON");
    // 标准接口把数据放在 result 里；/health 这类直接返回扁平对象，原样交回。
    return Object.prototype.hasOwnProperty.call(payload, "result") ? payload.result : payload;
  }

  /** 列出目录（一页）。返回 entries 与 hasMore，isDir/abstract 由 OV 给出。 */
  async function ls(uri, { showHidden = false, nodeLimit = 1000, semantic = true } = {}) {
    const url = new URL("/api/v1/fs/ls", `${base}/`);
    url.searchParams.set("uri", uri);
    url.searchParams.set("node_limit", String(nodeLimit));
    // 摘要与概览各取一小段：只用来判断该条目有没有 L0/L1，正文另走 /item。
    // 系统命名空间（viking://system）不支持 semantic listing，调用方需传 semantic:false。
    if (semantic) {
      url.searchParams.set("include_abstract", "true");
      url.searchParams.set("abs_limit", "200");
      url.searchParams.set("include_overview", "true");
      url.searchParams.set("overview_limit", "1");
    }
    url.searchParams.set("sort_by", "name");
    if (showHidden) url.searchParams.set("show_all_hidden", "true");
    const headers = await authHeaders();
    const doFetch = fetchImpl || fetch;
    let response;
    try {
      response = await doFetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      const name = error?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        throw new OvError("timeout", `OpenViking 请求超时（${timeoutMs} ms）`);
      }
      throw new OvError("unreachable", `无法连接 OpenViking（${base}）`);
    }
    const bodyText = await response.text().catch(() => "");
    const payload = parseJson(bodyText);
    if (!response.ok || payload?.status === "error") {
      const message = typeof payload?.error?.message === "string" && payload.error.message !== ""
        ? payload.error.message
        : `OpenViking 返回 HTTP ${response.status}`;
      throw new OvError(mapStatus(response.status, payload), message, { status: response.status });
    }
    if (payload === null) throw new OvError("bad-response", "OpenViking 返回了无法解析的 JSON");
    return {
      entries: Array.isArray(payload.result) ? payload.result : [],
      hasMore: payload.has_more === true,
    };
  }

  /** 读文件正文（L2）。`limit` 是行数，-1 表示读到结尾。 */
  function read(uri, { offset = 0, limit = -1 } = {}) {
    return request("/api/v1/content/read", { uri, raw: "true", offset, limit });
  }

  function abstract(uri) {
    return request("/api/v1/content/abstract", { uri });
  }

  function overview(uri) {
    return request("/api/v1/content/overview", { uri });
  }

  /** console 组件的健康探测：失败也是一种回答，不抛。 */
  async function healthResult() {
    try {
      const payload = await request("/health");
      return { ok: true, status: 200, result: payload, error: null };
    } catch (error) {
      return {
        ok: false,
        status: Number(error?.status) || 0,
        result: null,
        error: { message: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  return { endpoint: base, ls, read, abstract, overview, healthResult, request, getApiKey: resolveApiKey, getAdminKey: resolveAdminKey };
}

function parseJson(text) {
  if (typeof text !== "string" || text.trim() === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function mapStatus(status, payload) {
  const code = typeof payload?.error?.code === "string" ? payload.error.code.toLowerCase() : "";
  if (code === "unauthenticated" || status === 401) return "unauthenticated";
  if (code === "permission_denied" || status === 403) return "forbidden";
  if (code === "not_found" || status === 404) return "not-found";
  if (status === 400) return "bad-request";
  if (status >= 500) return "upstream";
  return "http-error";
}

/** 把 OvError 映射成浏览器半侧该看到的 HTTP 状态。 */
export function httpStatusOf(error) {
  const map = {
    unauthenticated: 401,
    forbidden: 403,
    "not-found": 404,
    "bad-request": 400,
    "bad-uri": 400,
    timeout: 504,
    unreachable: 502,
    upstream: 502,
  };
  return map[error?.code] || (Number(error?.status) >= 400 ? Math.min(Number(error.status), 599) : 500);
}
