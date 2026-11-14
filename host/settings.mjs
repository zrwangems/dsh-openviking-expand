/**
 * 旧版插件设置的只读兼容层。
 *
 * 0.3.1 起不再提供设置表单，也不再写这个文件。只有在本机 OV 配置缺项时，
 * 才用 ~/.dsh/openviking-expand.json 里的旧连接兜底，方便已有安装平滑升级。
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const OPENVIKING_KEYS = ["serviceType", "server", "language", "account", "user", "apiKey", "adminKey"];

export function settingsFile() {
  return process.env.OPENVIKING_EXPAND_SETTINGS || join(homedir(), ".dsh", "openviking-expand.json");
}

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
  return { openviking };
}

export function readSettingsSync() {
  try {
    return normalizeSettings(JSON.parse(readFileSync(settingsFile(), "utf8")));
  } catch {
    return normalizeSettings({});
  }
}
