/**
 * 插件设置（两页：OpenViking 连接 / vika）。
 *
 * 存放 `~/.dsh/openviking-expand.json`，与 profile 的 cordis 配置解耦：
 *  - openviking：服务类型、地址、语言、账号/用户、用户/管理员 Key；
 *  - vika：容器名、桥 host/port。工作区从容器挂载自动读取，不由用户配置。
 *
 * 兼容旧版扁平结构（serviceType/server/... 在顶层），读取时自动迁移。
 */
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync, realpathSync } from "node:fs";

const OPENVIKING_KEYS = ["serviceType", "server", "language", "account", "user", "apiKey", "adminKey"];
const VIKA_STRING_KEYS = ["containerName", "bridgeHost"];

/** 设置文件路径；测试可用环境变量覆盖。 */
export function settingsFile() {
  return process.env.OPENVIKING_EXPAND_SETTINGS || join(homedir(), ".dsh", "openviking-expand.json");
}

export function defaultVikaSettings() {
  return {
    containerName: "",
    bridgeHost: "127.0.0.1",
    bridgePort: 3742,
  };
}

/** 把磁盘上的旧/新结构统一成 `{openviking, vika}`。 */
export function normalizeSettings(raw = {}) {
  const source = raw !== null && typeof raw === "object" ? raw : {};
  const openviking = {};
  if (source.openviking !== null && typeof source.openviking === "object") {
    Object.assign(openviking, source.openviking);
  } else {
    for (const key of OPENVIKING_KEYS) {
      if (source[key] !== undefined) openviking[key] = source[key];
    }
  }
  const vika = { ...defaultVikaSettings(), ...(source.vika !== null && typeof source.vika === "object" ? source.vika : {}) };
  return { openviking, vika, updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : undefined };
}

/** 读设置（异步）；不存在或坏文件都当空对象。 */
export async function readSettings() {
  try {
    const text = await readFile(settingsFile(), "utf8");
    return normalizeSettings(JSON.parse(text));
  } catch {
    return normalizeSettings({});
  }
}

/** 读设置（同步）：用于 Cordis 组件 apply 阶段决定桥/工作区。 */
export function readSettingsSync() {
  try {
    return normalizeSettings(JSON.parse(readFileSync(settingsFile(), "utf8")));
  } catch {
    return normalizeSettings({});
  }
}

async function writeSettings(settings) {
  const file = settingsFile();
  const payload = { openviking: settings.openviking, vika: settings.vika, updatedAt: new Date().toISOString() };
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

/** 合并写 OpenViking 页；`undefined`/空字符串沿用已有值（密钥留空=沿用）。 */
export async function saveSettings(patch = {}) {
  const settings = await readSettings();
  for (const key of ["serviceType", "server", "language", "account", "user"]) {
    if (typeof patch[key] === "string" && patch[key].trim() !== "") settings.openviking[key] = patch[key].trim();
  }
  for (const key of ["apiKey", "adminKey"]) {
    if (typeof patch[key] === "string" && patch[key] !== "") settings.openviking[key] = patch[key];
  }
  return writeSettings(settings);
}

/** 合并写 vika 页；容器名/桥地址。 */
export async function saveVikaSettings(patch = {}) {
  const settings = await readSettings();
  const next = settings.vika;
  for (const key of VIKA_STRING_KEYS) {
    if (typeof patch[key] === "string" && patch[key].trim() !== "") next[key] = patch[key].trim();
  }
  const port = Number(patch.bridgePort);
  if (Number.isFinite(port) && port >= 1024 && port <= 65535) next.bridgePort = Math.trunc(port);
  return writeSettings(settings);
}

/** 恢复 vika 页默认值（插件注入的接线配置全部清空）。 */
export async function resetVikaSettings() {
  const settings = await readSettings();
  settings.vika = defaultVikaSettings();
  return writeSettings(settings);
}

/** vika 页设置（工作区从容器挂载自动发现，不在这里配置）。 */
export function resolveVikaSettings(settings = normalizeSettings({})) {
  return { ...defaultVikaSettings(), ...(settings.vika || {}) };
}

/** 给浏览器看的设置摘要（OpenViking 页字段保持顶层；vika 页放在 vika 下）。 */
export function publicSettings(settings = normalizeSettings({})) {
  const openviking = settings.openviking || {};
  const vika = resolveVikaSettings(settings);
  return {
    configured: typeof openviking.server === "string" && openviking.server !== "",
    serviceType: openviking.serviceType === "volc" ? "volc" : "open",
    server: typeof openviking.server === "string" ? openviking.server : "",
    language: openviking.language === "en" ? "en" : "zh",
    account: typeof openviking.account === "string" ? openviking.account : "",
    user: typeof openviking.user === "string" ? openviking.user : "",
    hasApiKey: typeof openviking.apiKey === "string" && openviking.apiKey !== "",
    hasAdminKey: typeof openviking.adminKey === "string" && openviking.adminKey !== "",
    vika: {
      containerName: vika.containerName || "",
      bridgeHost: vika.bridgeHost || "127.0.0.1",
      bridgePort: Number(vika.bridgePort) || 3742,
    },
  };
}

/** 服务地址合法性（与 routes 里保持同一规则）。 */
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

export { isAbsolute };
