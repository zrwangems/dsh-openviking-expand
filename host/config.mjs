/**
 * 配置归一化：组件选项只控制界面，OV 连接自动从本机配置解析。
 *
 * 连接优先级：显式组合配置（兼容旧安装）→ OPENVIKING_* → ovcli.conf →
 * ov.conf → 旧版插件设置 → 默认值。密钥只在 Host 进程读取，不写回任何文件。
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { readSettingsSync } from "./settings.mjs";

/** OpenViking 服务的默认地址。 */
export const DEFAULT_ENDPOINT = "http://127.0.0.1:1933";

/** 单文件预览硬上限：再大就只给前若干行。 */
const MAX_FILE_BYTES_CEILING = 8 * 1024 * 1024;

/** viking:// 根：整个上下文数据库，可收窄到某个命名空间。 */
const DEFAULT_ROOT = "viking://";

export function resolveConfig(input = {}, options = {}) {
  const raw = isPlainObject(input) ? input : {};
  const env = options.env || process.env;
  const consoleInput = isPlainObject(raw.console) ? raw.console : {};
  const sidebarInput = isPlainObject(raw.sidebar) ? raw.sidebar : {};
  const local = options.local || readLocalOvConfig({ env });
  const legacy = options.legacy || legacyConnection();
  const endpoint = trimUrl(
    raw.endpoint
      || env.OPENVIKING_URL
      || env.OPENVIKING_BASE_URL
      || local.endpoint
      || legacy.endpoint
      || DEFAULT_ENDPOINT,
  );
  return {
    endpoint,
    // 旧版组合行仍可使用；新安装不需要填写这些字段。
    apiKey: text(raw.apiKey)
      || text(env.OPENVIKING_BEARER_TOKEN)
      || text(env.OPENVIKING_API_KEY)
      || local.apiKey
      || legacy.apiKey
      || "",
    adminKey: text(raw.adminKey)
      || text(env.OPENVIKING_ROOT_API_KEY)
      || local.adminKey
      || legacy.adminKey
      || "",
    accountId: text(raw.accountId) || text(env.OPENVIKING_ACCOUNT) || local.accountId || legacy.accountId || "",
    userId: text(raw.userId) || text(env.OPENVIKING_USER) || local.userId || legacy.userId || "",
    configSource: raw.endpoint
      ? "plugin"
      : (env.OPENVIKING_URL || env.OPENVIKING_BASE_URL)
        ? "environment"
        : local.source || legacy.source || "default",
    console: {
      enabled: consoleInput.enabled !== false,
      consoleUrl: trimUrl(consoleInput.consoleUrl || env.OPENVIKING_CONSOLE_URL || ""),
    },
    sidebar: {
      enabled: sidebarInput.enabled !== false,
      root: normalizeRoot(sidebarInput.root),
      showHidden: sidebarInput.showHidden === true,
      nodeLimit: clampInt(sidebarInput.nodeLimit, 50, 5000, 1000),
      maxFileBytes: clampInt(sidebarInput.maxFileBytes, 1024, MAX_FILE_BYTES_CEILING, 1024 * 1024),
      timeoutMs: clampInt(sidebarInput.timeoutMs, 1000, 120000, 15000),
    },
  };
}

/** 同步读取 OV CLI 与服务端配置；只在插件装配时调用，不在请求路径读盘。 */
export function readLocalOvConfig({ env = process.env } = {}) {
  const cli = readJsonConfig(env.OPENVIKING_CLI_CONFIG_FILE, "ovcli.conf");
  const server = readJsonConfig(env.OPENVIKING_CONFIG_FILE, "ov.conf");
  const serverSection = isPlainObject(server.value?.server) ? server.value.server : {};
  const serverUrl = text(serverSection.url)
    || (text(serverSection.host) || text(serverSection.port)
      ? `http://${text(serverSection.host) || "127.0.0.1"}:${text(serverSection.port) || "1933"}`
      : "");
  return {
    endpoint: trimUrl(cli.value?.url || serverUrl),
    apiKey: text(cli.value?.api_key),
    adminKey: text(cli.value?.root_api_key) || text(serverSection.root_api_key),
    accountId: text(cli.value?.account),
    userId: text(cli.value?.user),
    source: cli.value ? "ovcli.conf" : (server.value ? "ov.conf" : ""),
  };
}

function readJsonConfig(configuredPath, filename) {
  const configured = text(configuredPath);
  const path = resolve(configured ? configured.replace(/^~(?=$|[\\/])/, homedir()) : join(homedir(), ".openviking", filename));
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return { value: isPlainObject(value) ? value : null, path };
  } catch {
    return { value: null, path };
  }
}

function legacyConnection() {
  const saved = readSettingsSync().openviking || {};
  return {
    endpoint: trimUrl(saved.server),
    apiKey: text(saved.apiKey),
    adminKey: text(saved.adminKey),
    accountId: text(saved.account),
    userId: text(saved.user),
    source: Object.keys(saved).length > 0 ? "legacy-plugin" : "",
  };
}

/** 把 `viking://a/b/` 规范成无尾斜杠形式；非法值退回根。 */
export function normalizeRoot(value) {
  const raw = text(value);
  if (raw === "" || !raw.startsWith("viking://")) return DEFAULT_ROOT;
  const path = raw.slice("viking://".length).replace(/^\/+/, "").replace(/\/+$/, "");
  if (path === "") return DEFAULT_ROOT;
  if (/[?#\s\\]/.test(path)) return DEFAULT_ROOT;
  if (path.split("/").some(segment => segment === "." || segment === "..")) return DEFAULT_ROOT;
  return `viking://${path}`;
}

function trimUrl(value) {
  return text(value).replace(/\/+$/, "");
}

function text(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const integer = Math.trunc(number);
  if (integer < min) return min;
  if (integer > max) return max;
  return integer;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
