/**
 * vika 组件装配：配置 -> 控制器 -> 本地桥。
 *
 * 组件默认关闭（`vika.enabled: false`）；关闭时不建账本、不监听端口。
 * 所有注册都挂在 ctx.effect 上，插件卸载或 HMR 重载时自动释放。
 */
import { VikaController } from "./controller.mjs";
import { VikaBridge } from "./bridge.mjs";

/**
 * 挂载 vika 组件。
 *
 * @param ctx DSH Cordis 上下文。
 * @param config 插件顶层配置（含 vika 段）。
 * @returns `{ controller, bridge }`，未启用时返回 undefined。
 */
export function mountVika(ctx, config) {
  const vika = config?.vika;
  if (!vika || vika.enabled !== true) return undefined;
  const log = (level, message) => {
    try {
      const logger = ctx.logger;
      if (!logger) return;
      const fn = typeof logger[level] === "function" ? logger[level] : logger.info;
      if (typeof fn === "function") fn.call(logger, message);
    } catch {}
  };
  const controller = new VikaController({ ctx, vika, log });
  controller.install();
  const bridge = new VikaBridge({ controller, vika, log });
  ctx.effect(() => {
    let disposed = false;
    bridge.start().catch(error => log("warn", `vika bridge: 启动失败: ${String(error)}`));
    return () => {
      if (disposed) return;
      disposed = true;
      bridge.close();
      controller.close();
    };
  }, "vika: bridge");
  return { controller, bridge };
}
