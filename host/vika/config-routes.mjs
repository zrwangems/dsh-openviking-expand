/**
 * 插件设置页的 Vika 容器接口：/openviking-vika-config/*。
 *
 * 独立于 console/sidebar 的 /openviking-expand/* 前缀：只要 vika 组件启用，
 * 插件页就能检测容器并一键配置。所有请求经 DSH 浏览器信任校验。
 */
import { readSettings, publicSettings, resetVikaSettings, saveVikaSettings } from "../settings.mjs";
import { configureVikaContainer, githubSetup, githubStatus, listVikaContainers, resetVikaContainer, resolveContainerWorkspace, resolveVikaContainer, vikaDisplayName } from "./container.mjs";

const PREFIX = "/openviking-vika-config";

function sendJson(res, status, payload) {
  if (res.headersSent) return;
  const body = Buffer.from(`${JSON.stringify(payload)}\n`, "utf8");
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

async function readBody(req, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("请求体过大");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (text === "") return {};
  const parsed = JSON.parse(text);
  return parsed !== null && typeof parsed === "object" ? parsed : {};
}

async function saveVikaFields(body = {}) {
  return saveVikaSettings({
    containerName: body.containerName,
    bridgeHost: body.bridgeHost,
    bridgePort: body.bridgePort,
  });
}

/**
 * 挂载 Vika 容器配置路由。
 *
 * @param ctx 组件上下文。
 * @param options `{pluginRoot, log}`。
 */
export function mountVikaConfigRoutes(ctx, { pluginRoot, log = () => {} }) {
  if (!ctx || typeof ctx.inject !== "function") return () => {};
  let disposed = false;
  const disposers = [];
  ctx.inject(["webServer", "connection"], child => {
    if (disposed) return;
    const fence = req => {
      try { return child.connection.requestRejection(req) === undefined } catch { return false }
    };
    const handler = async (req, res) => {
      let allowed = false;
      try { allowed = fence(req) } catch { allowed = false }
      if (!allowed) { sendJson(res, 403, { ok: false, error: { code: "forbidden", message: "forbidden" } }); return }
      const url = new URL(req.url || "/", "http://dsh.internal");
      const pathname = url.pathname.slice(PREFIX.length) || "/";
      try {
        if (pathname === "/settings" && (req.method || "GET").toUpperCase() === "GET") {
          const settings = publicSettings(await readSettings());
          if (settings.vika.containerName) settings.vika.displayName = await vikaDisplayName(settings.vika.containerName);
          sendJson(res, 200, { ok: true, result: settings });
          return;
        }
        if (pathname === "/settings/vika" && (req.method || "GET").toUpperCase() === "POST") {
          const body = await readBody(req);
          const saved = await saveVikaFields(body);
          sendJson(res, 200, { ok: true, result: { settings: publicSettings(saved) } });
          return;
        }
        if (pathname === "/reset" && (req.method || "GET").toUpperCase() === "POST") {
          const body = await readBody(req);
          const requested = typeof body.container === "string" ? body.container.trim() : "";
          const container = requested || await resolveVikaContainer("");
          if (container === "") throw new Error("没有找到运行中的 Vika 容器");
          const workspace = await resolveContainerWorkspace(container);
          const result = await resetVikaContainer({ container, workspace, log });
          await resetVikaSettings();
          sendJson(res, 200, { ok: true, result });
          return;
        }
        if (pathname === "/github/status" && (req.method || "GET").toUpperCase() === "POST") {
          const body = await readBody(req);
          const container = typeof body.container === "string" ? body.container.trim() : "";
          sendJson(res, 200, { ok: true, result: await githubStatus({ container }) });
          return;
        }
        if (pathname === "/github/setup" && (req.method || "GET").toUpperCase() === "POST") {
          const body = await readBody(req);
          const container = typeof body.container === "string" ? body.container.trim() : "";
          const result = await githubSetup({ container, log });
          sendJson(res, 200, { ok: true, result });
          return;
        }
        if (pathname === "/containers" && (req.method || "GET").toUpperCase() === "GET") {
          sendJson(res, 200, { ok: true, result: { containers: await listVikaContainers() } });
          return;
        }
        if (pathname === "/configure" && (req.method || "GET").toUpperCase() === "POST") {
          const body = await readBody(req);
          const requested = typeof body.container === "string" ? body.container.trim() : "";
          const container = requested || await resolveVikaContainer("");
          if (container === "") throw new Error("没有找到运行中的 Vika 容器，请先点“检测容器”选择");
          // 先保存页面上的 vika 字段，再按已保存设置配置容器。
          const saved = await saveVikaFields({ ...body, containerName: container });
          const result = await configureVikaContainer({ container, settings: saved, pluginRoot, log });
          sendJson(res, 200, { ok: true, result: { ...result, settings: publicSettings(saved) } });
          return;
        }
        sendJson(res, 404, { ok: false, error: { code: "not-found", message: `未知接口：${pathname}` } });
      } catch (error) {
        sendJson(res, 500, { ok: false, error: { code: "internal", message: error instanceof Error ? error.message : String(error) } });
      }
    };
    disposers.push(child.effect(
      () => child.webServer.register({ kind: "prefix", path: PREFIX, handler }),
      "openvikingExpand.vikaConfig()",
    ));
  });
  return () => {
    disposed = true;
    for (const dispose of disposers) {
      try { dispose() } catch { /* 已释放 */ }
    }
    disposers.length = 0;
  };
}
