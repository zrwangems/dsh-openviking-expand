/**
 * console / sidebar 两个组件共享的「前缀路由归属」协调器。
 *
 * 两个组件都注册 `/openviking-expand/*` 与（console 的）`/studio/*`，但同一个
 * Web 前缀只能注册一次。这里以进程内状态记录谁在运行：
 *   - sidebar 在时由 sidebar 的 ctx 拥有前缀（bootstrap 里 console 标志按实际组件计算）；
 *   - 只有 console 时由 console 的 ctx 拥有前缀；
 *   - 组件被关闭（行 disabled / HMR）时摘除并重排，另一个组件自动接管。
 */
import { resolveConfig } from "../../config.mjs";
import { mountComponentRoutes } from "../../routes.mjs";

/** @type {Map<string, {ctx: any, input: Record<string, unknown>}>} */
const parts = new Map();
let disposeRoutes = null;
let timer = null;

/** 注册一个组件；ctx 释放时自动摘除并重排。 */
export function registerComponent(name, ctx, input = {}) {
  parts.set(name, { ctx, input });
  ctx.effect(() => () => {
    parts.delete(name);
    schedule();
  }, `openvikingExpand.${name}`);
  schedule();
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    remount();
  }, 0);
  // 不让定时器拖住进程退出（宿主长驻，仅用于避免测试挂起）。
  timer.unref?.();
}

function remount() {
  if (disposeRoutes) {
    try {
      disposeRoutes();
    } catch {
      // 拥有前缀的组件可能已经整体释放，忽略。
    }
    disposeRoutes = null;
  }
  const sidebar = parts.get("sidebar");
  const consolePart = parts.get("console");
  if (!sidebar && !consolePart) return;
  const owner = sidebar ?? consolePart;
  const merged = resolveConfig({
    endpoint: sidebar?.input.endpoint ?? consolePart?.input.endpoint,
    apiKey: sidebar?.input.apiKey ?? consolePart?.input.apiKey,
    console: consolePart?.input.console,
    sidebar: sidebar?.input.sidebar,
  });
  disposeRoutes = mountComponentRoutes(owner.ctx, {
    config: merged,
    components: { console: Boolean(consolePart), sidebar: Boolean(sidebar), bootstrap: true },
    // 前缀永远由当前协调出的 owner 注册；studio 只补 console 的。
    ownPrefix: true,
    studio: Boolean(consolePart),
  });
}
