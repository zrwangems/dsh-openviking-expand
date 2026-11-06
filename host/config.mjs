/**
 * 配置归一化：把 DSH 组合行上的 config 整理成各组件需要的形状。
 *
 * 本插件不引入 schemastery（保持零运行时依赖），所有缺省值、上下限、
 * 类型纠正都集中在这里，其它模块只读解析结果。
 */
/** OpenViking 服务的默认地址。 */
export const DEFAULT_ENDPOINT = "http://127.0.0.1:1933";

/** 单文件预览硬上限：再大就只给前若干行。 */
const MAX_FILE_BYTES_CEILING = 8 * 1024 * 1024;

/** viking:// 根：整个上下文数据库，可收窄到某个命名空间。 */
const DEFAULT_ROOT = "viking://";

export function resolveConfig(input = {}) {
  const raw = isPlainObject(input) ? input : {};
  const consoleInput = isPlainObject(raw.console) ? raw.console : {};
  const sidebarInput = isPlainObject(raw.sidebar) ? raw.sidebar : {};
  const endpoint = trimUrl(
    raw.endpoint
      || process.env.OPENVIKING_URL
      || process.env.OPENVIKING_BASE_URL
      || DEFAULT_ENDPOINT,
  );
  return {
    endpoint,
    // 可选：给「Studio 里没有连接 / 没填 key」的兜底，留空则按环境变量、ovcli.conf 找。
    apiKey: text(raw.apiKey),
    console: {
      enabled: consoleInput.enabled !== false,
      consoleUrl: trimUrl(consoleInput.consoleUrl || process.env.OPENVIKING_CONSOLE_URL || ""),
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
