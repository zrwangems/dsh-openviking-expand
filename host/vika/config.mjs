/**
 * vika 组件配置归一化。
 *
 * 输入是 DSH 组合行上的 `config.vika`，输出是本组件其它模块只读的形状。
 * 不引入 schemastery，保持插件零运行时依赖；所有缺省值、上下限与类型纠正都集中在这里。
 */
import os from "node:os";
import path from "node:path";

/** 桥的默认端口：避开 Vika 自己的 3737/3738 与 DSH 的 59587。 */
export const DEFAULT_BRIDGE_PORT = 3742;

/** 默认状态目录：%USERPROFILE%\.dsh\openviking-expand\vika。 */
export function defaultStateDir() {
  return path.join(os.homedir(), ".dsh", "openviking-expand", "vika");
}

/** 会话标题前缀，方便在 DSH 会话列表里一眼认出 Vika 派发的会话。 */
export const DEFAULT_TITLE_PREFIX = "[Vika] ";

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function list(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => text(item)).filter(item => item !== "");
}

/**
 * 归一化 vika 配置。
 *
 * @param raw 组合行上的 `config.vika`，可能是 undefined。
 * @param base 顶层配置（endpoint/apiKey 等），仅用于日志与健康信息。
 * @returns 组件配置；`enabled` 为 false 时其余字段也应视为不生效。
 */
export function resolveVikaConfig(raw = {}, base = {}) {
  const input = isPlainObject(raw) ? raw : {};
  const bridgeInput = isPlainObject(input.bridge) ? input.bridge : {};
  const workersInput = isPlainObject(input.workers) ? input.workers : {};
  const stateDir = path.resolve(text(input.stateDir) || defaultStateDir());
  const defaultCwd = path.resolve(text(workersInput.defaultCwd) || process.cwd());
  const reposRoot = path.resolve(text(workersInput.reposRoot) || path.join(stateDir, "repos"));
  const tasksRoot = path.resolve(text(workersInput.tasksRoot) || path.join(stateDir, "tasks"));
  const allowedRoots = list(workersInput.allowedRoots).map(item => path.resolve(item));
  return {
    enabled: input.enabled === true,
    bridge: {
      host: normalizeHost(bridgeInput.host),
      port: clampInt(bridgeInput.port, 1024, 65535, DEFAULT_BRIDGE_PORT),
      // 空字符串表示启动时生成并持久化到 stateDir/bridge.json。
      token: text(bridgeInput.token) || text(process.env.OPENVIKING_EXPAND_VIKA_TOKEN),
      // 单次请求体上限，防止误发大文件。
      maxBodyBytes: clampInt(bridgeInput.maxBodyBytes, 1024, 4 * 1024 * 1024, 256 * 1024),
      // 长轮询上限；再长就让调用方自己分多次等。
      maxWaitMs: clampInt(bridgeInput.maxWaitMs, 1000, 120000, 30000),
      audit: bridgeInput.audit !== false,
    },
    workers: {
      defaultCwd,
      allowedRoots,
      reposRoot,
      tasksRoot,
      // 会话使用 DSH 的哪个 agent preset；空表示用 profile 默认。
      preset: text(workersInput.preset),
      // 单次任务提示词最多带多少字符的正文。
      maxPromptChars: clampInt(workersInput.maxPromptChars, 256, 60000, 20000),
      // 单个 worker 的最终答复最多保留多少字符。
      reportChars: clampInt(workersInput.reportChars, 200, 60000, 4000),
      // 注册表里最多保留多少条会话（超出拒绝新建，交给人工清理）。
      maxSessions: clampInt(workersInput.maxSessions, 1, 200, 6),
      titlePrefix: text(workersInput.titlePrefix) || DEFAULT_TITLE_PREFIX,
    },
    stateDir,
    // 顶层 OpenViking 配置留给 console/sidebar；这里只记录一个只读快照。
    openvikingEndpoint: text(base.endpoint),
  };
}

/** 桥默认只绑回环；显式配置 0.0.0.0/:: 时允许容器网关访问（仍需 token）。 */
function normalizeHost(value) {
  const host = text(value);
  if (host === "0.0.0.0" || host === "::" || host === "[::]") return host;
  if (host === "127.0.0.1" || host === "localhost" || host === "::1") return host === "localhost" ? "127.0.0.1" : host;
  return "127.0.0.1";
}

/** 判断路径是否落在允许的根目录内（Windows 大小写不敏感）。 */
export function isInside(root, target) {
  const normalize = value => (process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value));
  const parent = normalize(root);
  const child = normalize(target);
  if (child === parent) return true;
  const withSep = parent.endsWith(path.sep) ? parent : parent + path.sep;
  return child.startsWith(withSep);
}

/** 该路径是否被配置允许作为 worker 的 cwd。 */
export function isAllowedCwd(vika, cwd) {
  const target = path.resolve(cwd);
  const roots = vika.workers.allowedRoots.length > 0
    ? [...vika.workers.allowedRoots, vika.workers.reposRoot]
    : [vika.workers.defaultCwd, vika.workers.reposRoot];
  return roots.some(root => isInside(root, target));
}

/** 把仓库名与 slug 映射到宿主机上的任务目录。 */
export function repoPathOf(vika, repo, slug) {
  const [owner, name] = String(repo).split("/");
  const safeOwner = owner.replace(/[^A-Za-z0-9._-]/g, "_");
  const safeName = name.replace(/[^A-Za-z0-9._-]/g, "_");
  return path.join(vika.workers.reposRoot, `${safeOwner}__${safeName}`, slug);
}
