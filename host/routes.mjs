/**
 * Host 路由：插件在 DSH 同源下的全部对外面。
 *
 *   GET /openviking-expand/bootstrap   组件开关、根 URI、默认偏好
 *   GET /openviking-expand/ls          viking:// 一层目录
 *   GET /openviking-expand/item        一个条目：目录给 L0+L1，文件给正文
 *   GET /openviking-expand/console     console 组件的状态 JSON（fenced）
 *   *   /studio/*                     console 组件的同源 Studio 代理（前缀）
 *
 * 侧边栏读哪个 OpenViking，由浏览器半侧跟着 Studio 里当前选中的连接走：
 *   ?server=<baseUrl>          目标服务地址（缺省用插件配置的 endpoint）
 *   x-ov-key / x-ov-account / x-ov-user   该连接自己的凭据（可信模式才用 account/user）
 *
 * 除 Studio 代理（iframe 导航必须能加载）外，所有路由都要过 DSH 的浏览器信任校验，
 * 且只返回 OpenViking 的只读数据。
 */
import {
  createConsoleRoute,
  createStudioProxy,
  STUDIO_PROXY_PATH,
} from "./console.mjs";
import { OvError, createOvClient, httpStatusOf } from "./connection.mjs";
import { listDirectory, openItem } from "./viking-fs.mjs";
import { readSettings, saveSettings, saveVikaSettings, publicSettings } from "./settings.mjs";

/** 插件自己的路由前缀（DSH 同源）。 */
export const ROUTE_PREFIX = "/openviking-expand";

/** 一次请求最多为多少个不同连接保留客户端实例。 */
const CONNECTION_CACHE_LIMIT = 8;

/** console 组件用的连接配置（它只认 baseUrl / consoleUrl 两个字段）。 */
function consoleConfigOf(config) {
  return {
    baseUrl: config.endpoint,
    consoleUrl: config.console.consoleUrl || config.endpoint,
  };
}

/**
 * 校验浏览器带来的服务地址：只收 http(s)，丢掉查询串/片段/尾斜杠；不合法返回 null。
 * 这只是「目标地址」的合法性，访问权限仍由 DSH 的浏览器信任校验把关。
 */
export function normalizeServer(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/+$/, "");
}

function headerValue(headers, name) {
  if (headers === undefined || headers === null) return "";
  if (typeof headers.get === "function") return String(headers.get(name) || "").trim();
  const value = headers[name];
  return typeof value === "string" ? value.trim() : "";
}

/** 从请求里取出「这次要读哪个连接」。 */
export function connectionOf(req, url) {
  return {
    server: normalizeServer(url.searchParams.get("server")),
    key: headerValue(req.headers, "x-ov-key"),
    account: headerValue(req.headers, "x-ov-account"),
    user: headerValue(req.headers, "x-ov-user"),
  };
}

/**
 * 按连接懒建客户端并缓存：同一 endpoint + 凭据只建一个。
 *
 * 规则：浏览器带来的 key 优先；没给 key 时，只有目标就是配置里的 endpoint
 * 才回退到插件配置 / 环境变量 / ~/.openviking/ovcli.conf —— 本机凭据不能
 * 顺手发给另一个服务地址。
 */
export function createConnectionPool(config, { fetchImpl } = {}) {
  const cache = new Map();
  return function clientFor(connection = {}) {
    const endpoint = connection.server || config.endpoint;
    const isConfigured = endpoint === config.endpoint;
    const providedKey = String(connection.key || "").trim();
    const apiKey = providedKey || (isConfigured ? config.apiKey : "");
    const accountId = apiKey === "" ? String(connection.account || "").trim() : "";
    const userId = apiKey === "" ? String(connection.user || "").trim() : "";
    const id = [endpoint, apiKey, accountId, userId].join("\u0000");
    let client = cache.get(id);
    if (client === undefined) {
      client = createOvClient({
        endpoint,
        apiKey,
        accountId,
        userId,
        timeoutMs: config.sidebar.timeoutMs,
        allowCredentialFallback: isConfigured,
        ...(fetchImpl === undefined ? {} : { fetchImpl }),
      });
      if (cache.size >= CONNECTION_CACHE_LIMIT) cache.delete(cache.keys().next().value);
      cache.set(id, client);
    }
    return client;
  };
}

/**
 * 业务处理器表：键是 ROUTE_PREFIX 之后的路径。
 * 独立出来是为了单测能直接喂 URLSearchParams，不必起 HTTP 服务。
 */
export function createRouteHandlers({ config, pool }) {
  return {
    "/bootstrap": async () => {
      // 已保存的连接设置优先；没有就用插件配置端点 + 本机凭据回退。
      const saved = await readSettings();
      const savedOv = saved.openviking || {};
      const savedServer = normalizeServer(savedOv.server);
      const configured = normalizeServer(config.endpoint);
      const endpoint = savedServer || configured || "";
      let apiKey = typeof savedOv.apiKey === "string" && savedOv.apiKey !== "" ? savedOv.apiKey : "";
      let adminKey = typeof savedOv.adminKey === "string" ? savedOv.adminKey : "";
      const sameConfigured = configured !== null && (savedServer === null || savedServer === configured);
      if (apiKey === "" && sameConfigured) {
        try {
          const client = pool({});
          if (client !== undefined && client !== null && typeof client.getApiKey === "function") {
            apiKey = await client.getApiKey();
          }
        } catch {
          /* 拿不到本机凭据就不暴露 */
        }
      }
      if (adminKey === "" && sameConfigured) {
        try {
          const client = pool({});
          if (client !== undefined && client !== null && typeof client.getAdminKey === "function") adminKey = await client.getAdminKey();
        } catch { /* 拿不到 root key */ }
      }
      return {
        components: {
          console: config.console.enabled,
          sidebar: config.sidebar.enabled,
        },
        endpoint,
        serviceType: savedOv.serviceType === "volc" ? "volc" : "open",
        ...(apiKey === "" ? {} : { apiKey }),
        ...(adminKey === "" ? {} : { adminKey }),
        root: config.sidebar.root,
        showHidden: config.sidebar.showHidden,
        nodeLimit: config.sidebar.nodeLimit,
      };
    },
    "/settings": async () => publicSettings(await readSettings()),
    "/ls": async (params, connection) => {
      const uri = params.get("uri") || config.sidebar.root;
      const showHidden = params.get("showHidden") === "true" || config.sidebar.showHidden;
      return listDirectory(pool(connection), uri, {
        root: config.sidebar.root,
        showHidden,
        nodeLimit: config.sidebar.nodeLimit,
      });
    },
    "/item": async (params, connection) => {
      const uri = params.get("uri");
      if (uri === null || uri === "") throw new OvError("bad-request", "缺少 uri 参数");
      return openItem(pool(connection), uri, {
        maxFileBytes: config.sidebar.maxFileBytes,
        nodeLimit: config.sidebar.nodeLimit,
      });
    },
  };
}

/**
 * 组装前缀路由处理器。`fence` 注入以便单测覆盖拒绝分支；
 * `client` 注入时固定用这一个（单测/终端 profile 用），否则按请求连接建。
 *
 * `components` 是这次要暴露的组件开关：
 *   console  —— /openviking-expand/console 与 /studio/*（由 console 组件自己注册代理）
 *   sidebar  —— /bootstrap、/ls、/item
 *   bootstrap —— 是否暴露 GET /bootstrap（两个组件都关掉时整个前缀都不注册）
 */
export function createRouter({ config, client, fence, components = defaultComponents(config) }) {
  const pool = client === undefined ? createConnectionPool(config) : () => client;
  const handlers = createRouteHandlers({ config, pool });
  const consoleRoute = components.console
    ? createConsoleRoute({ config: consoleConfigOf(config), client: pool({}), fence })
    : null;
  return function route(req, res) {
    void handleRouteRequest({ handlers, consoleRoute, fence, components, config }, req, res).catch(() => {
      try { res.end(); } catch { /* 连接已断，无需收尾 */ }
    });
  };
}

/** 从配置推出组件开关（兼容旧调用）。 */
function defaultComponents(config) {
  return {
    console: config.console.enabled,
    sidebar: config.sidebar.enabled,
    bootstrap: config.console.enabled || config.sidebar.enabled,
  };
}

/** 读取并解析 JSON 请求体（限制大小，避免误发大文件）。 */
async function readJsonRequest(req, limit = 16 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("请求体过大");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("请求体不是合法 JSON");
  }
}

/**
 * 校验一个 OpenViking 连接：用给定地址与凭据调 /health。
 * 只做连通性/鉴权探测，不保存任何配置（配置由浏览器半侧保存）。
 */
async function handleVerify(req, res, config = {}) {
  let body;
  try {
    body = await readJsonRequest(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: { code: "bad-request", message: String(error?.message || error) } });
    return;
  }
  const server = normalizeServer(body.server);
  if (server === null) {
    sendJson(res, 400, { ok: false, error: { code: "bad-request", message: "服务地址必须是合法的 http(s) 地址" } });
    return;
  }
  const saved = await readSettings();
  const savedOv = saved.openviking || {};
  const savedServer = normalizeServer(savedOv.server);
  const sameServer = savedServer !== null && savedServer === server;
  const savedKey = sameServer && typeof savedOv.apiKey === "string" ? savedOv.apiKey : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const adminKey = typeof body.adminKey === "string" ? body.adminKey.trim() : "";
  const account = typeof body.account === "string" ? body.account.trim() : "";
  const user = typeof body.user === "string" ? body.user.trim() : "";
  const key = apiKey || adminKey || savedKey;
  // 只对「插件配置的端点」或「已保存的连接」允许回退本机凭据。
  const allowFallback = normalizeServer(config.endpoint) === server || sameServer;
  try {
    const client = createOvClient({
      endpoint: server,
      apiKey: key,
      accountId: key ? "" : account,
      userId: key ? "" : user,
      allowCredentialFallback: allowFallback,
      timeoutMs: 8000,
    });
    const health = await client.healthResult();
    let resolvedKey = key;
    if (resolvedKey === "" && allowFallback && typeof client.getApiKey === "function") {
      try { resolvedKey = await client.getApiKey(); } catch { /* 没有本机凭据 */ }
    }
    let resolvedAdmin = typeof savedOv.adminKey === "string" ? savedOv.adminKey : "";
    if (resolvedAdmin === "" && allowFallback && typeof client.getAdminKey === "function") {
      try { resolvedAdmin = await client.getAdminKey(); } catch { /* 无 root key */ }
    }
    sendJson(res, 200, { ok: true, result: { server, health, apiKey: resolvedKey, adminKey: resolvedAdmin } });
  } catch (error) {
    sendJson(res, httpStatusOf(error), {
      ok: false,
      error: {
        code: typeof error?.code === "string" ? error.code : "internal",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

/** 火山托管的固定服务地址。 */
const VOLC_SERVER = "https://api.vikingdb.cn-beijing.volces.com/openviking";

/**
 * 保存连接设置：地址/服务类型/语言/账号/用户与可选密钥。
 * 密钥留空表示沿用已保存值；返回公开摘要和实际生效的 Key（供浏览器种子 Studio）。
 */
async function handleSaveSettings(req, res, config = {}) {
  let body;
  try {
    body = await readJsonRequest(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: { code: "bad-request", message: String(error?.message || error) } });
    return;
  }
  const serviceType = body.serviceType === "volc" ? "volc" : "open";
  const server = serviceType === "volc" ? VOLC_SERVER : normalizeServer(body.server);
  if (server === null || server === "") {
    sendJson(res, 400, { ok: false, error: { code: "bad-request", message: "服务地址必须是合法的 http(s) 地址" } });
    return;
  }
  const language = body.language === "en" ? "en" : "zh";
  const account = typeof body.account === "string" && body.account.trim() !== "" ? body.account.trim() : "default";
  const user = typeof body.user === "string" && body.user.trim() !== "" ? body.user.trim() : "default";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const adminKey = typeof body.adminKey === "string" ? body.adminKey.trim() : "";
  const saved = await saveSettings({ serviceType, server, language, account, user, apiKey, adminKey });
  const savedOv = saved.openviking || {};
  if (serviceType === "volc" && (typeof savedOv.apiKey !== "string" || savedOv.apiKey === "")) {
    sendJson(res, 400, { ok: false, error: { code: "bad-request", message: "火山托管需要填写用户 API 密钥" } });
    return;
  }
  let effectiveKey = typeof savedOv.apiKey === "string" ? savedOv.apiKey : "";
  if (effectiveKey === "") {
    try {
      const client = createOvClient({
        endpoint: server,
        allowCredentialFallback: normalizeServer(config.endpoint) === server,
        timeoutMs: 8000,
      });
      if (typeof client.getApiKey === "function") effectiveKey = await client.getApiKey();
    } catch {
      /* 没有本机凭据就留空 */
    }
  }
  let effectiveAdmin = typeof savedOv.adminKey === "string" ? savedOv.adminKey : "";
  if (effectiveAdmin === "") {
    try {
      const client = createOvClient({ endpoint: server, allowCredentialFallback: normalizeServer(config.endpoint) === server, timeoutMs: 8000 });
      if (typeof client.getAdminKey === "function") effectiveAdmin = await client.getAdminKey();
    } catch { /* 无 root key */ }
  }
  sendJson(res, 200, { ok: true, result: { settings: publicSettings(saved), apiKey: effectiveKey, adminKey: effectiveAdmin } });
}

/** 保存 vika 页设置：容器名与桥 host/port。 */
async function handleSaveVikaSettings(req, res) {
  let body;
  try {
    body = await readJsonRequest(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: { code: "bad-request", message: String(error?.message || error) } });
    return;
  }
  const saved = await saveVikaSettings({
    containerName: body.containerName,
    bridgeHost: body.bridgeHost,
    bridgePort: body.bridgePort,
  });
  sendJson(res, 200, { ok: true, result: { settings: publicSettings(saved) } });
}

/**
 * 一次请求的实际处理（返回 Promise，便于单测直接 await，不必起 HTTP 服务）。
 */
export async function handleRouteRequest({ handlers, consoleRoute, fence, components = { console: true, sidebar: true, bootstrap: true }, config = {} }, req, res) {
  let allowed = true;
  try {
    allowed = fence ? Boolean(fence(req)) : true;
  } catch {
    allowed = false;
  }
  if (!allowed) {
    sendJson(res, 403, { ok: false, error: { code: "forbidden", message: "forbidden" } });
    return;
  }
  const url = new URL(req.url || "/", "http://dsh.internal");
  const path = url.pathname.slice(ROUTE_PREFIX.length) || "/";
  // 连接校验与设置保存是仅有的 POST 路由（插件页配置用）。
  if (path === "/verify" && req.method === "POST") {
    await handleVerify(req, res, config);
    return;
  }
  if (path === "/settings" && req.method === "POST") {
    await handleSaveSettings(req, res, config);
    return;
  }
  if (path === "/settings/vika" && req.method === "POST") {
    await handleSaveVikaSettings(req, res);
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: { code: "method-not-allowed", message: "GET only" } });
    return;
  }
  if (path === "/bootstrap" && !components.bootstrap) {
    sendJson(res, 404, { ok: false, error: { code: "not-found", message: "没有启用的界面组件" } });
    return;
  }
  if (path === "/console") {
    if (consoleRoute === null || consoleRoute === undefined) {
      sendJson(res, 404, { ok: false, error: { code: "not-found", message: "console 组件已禁用" } });
      return;
    }
    await consoleRoute(req, res);
    return;
  }
  if ((path === "/ls" || path === "/item") && !components.sidebar) {
    sendJson(res, 404, { ok: false, error: { code: "not-found", message: "sidebar 组件已禁用" } });
    return;
  }
  const handler = handlers[path];
  if (handler === undefined) {
    sendJson(res, 404, { ok: false, error: { code: "not-found", message: `未知接口：${path}` } });
    return;
  }
  try {
    const result = await handler(url.searchParams, connectionOf(req, url));
    sendJson(res, 200, { ok: true, result });
  } catch (error) {
    sendJson(res, httpStatusOf(error), {
      ok: false,
      error: {
        code: typeof error?.code === "string" ? error.code : "internal",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

/**
 * 挂载一组组件路由；终端 profile 没有 webServer 时静默跳过。
 *
 * `ownPrefix`：由哪个组件负责注册 `/openviking-expand/*` 前缀。
 *   - sidebar 启用时由 sidebar 组件拥有（它同时会服务 console 的状态路由）；
 *   - sidebar 关闭、只剩 console 时改由 console 组件拥有（含 bootstrap）。
 * 这样两个组件同时启用时也只会注册一次前缀，不会互相覆盖。
 */
export function mountComponentRoutes(ctx, { config, components, ownPrefix, studio = false }) {
  if (!ctx || typeof ctx.inject !== "function") return () => {};
  if (!components.console && !components.sidebar) return () => {};
  let disposed = false;
  const disposers = [];
  ctx.inject(["webServer", "connection"], webCtx => {
    if (disposed) return;
    const fence = req => {
      try {
        return webCtx.connection.requestRejection(req) === undefined;
      } catch {
        return false;
      }
    };
    const webServer = webCtx.webServer;
    // /studio/* 代理只属于 console 组件；sidebar 注册前缀路由时不能再注册一遍。
    if (studio && components.console) {
      const studioConfig = consoleConfigOf(config);
      disposers.push(webCtx.effect(
        () => webServer.register({
          kind: "prefix",
          path: STUDIO_PROXY_PATH,
          handler: createStudioProxy({ config: studioConfig }),
        }),
        "openvikingExpand.studioProxy()",
      ));
    }
    if (ownPrefix) {
      const route = createRouter({ config, fence, components });
      disposers.push(webCtx.effect(
        () => webServer.register({ kind: "prefix", path: ROUTE_PREFIX, handler: route }),
        "openvikingExpand.routes()",
      ));
    }
  });
  // 让调用方（组件协调器）能在组件开关变化时主动撤掉本次注册。
  return () => {
    disposed = true;
    for (const dispose of disposers) {
      try { dispose() } catch { /* 组件已整体释放 */ }
    }
    disposers.length = 0;
  };
}

/** 兼容旧入口：按配置里的两个开关一次性挂载（单测与旧调用使用）。 */
export function mountRoutes(ctx, { config }) {
  const consoleEnabled = config.console.enabled;
  const sidebarEnabled = config.sidebar.enabled;
  mountComponentRoutes(ctx, {
    config,
    components: { console: consoleEnabled, sidebar: sidebarEnabled, bootstrap: consoleEnabled || sidebarEnabled },
    ownPrefix: consoleEnabled || sidebarEnabled,
    studio: true,
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}
