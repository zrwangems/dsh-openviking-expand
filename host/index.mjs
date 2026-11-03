/**
 * dsh-openviking-expand 的包根入口 —— 加载客户端信封和插件设置接口，不挂载任何组件。
 *
 * 三个组件（console / sidebar / vika）各自是独立 Cordis 插件行，可以任意开关；
 * 包根行只负责客户端与 Vika 容器配置接口，不挂载控制台/侧栏/运行时。
 */
import { fileURLToPath } from "node:url";
import { mountVikaConfigRoutes } from "./vika/config-routes.mjs";

export const name = "openviking-expand";

/** 壳层只需要 Web 服务来暴露插件设置接口；缺失时路由会等待，不影响其它插件。 */
export const inject = [];

export function apply(ctx) {
  const pluginRoot = fileURLToPath(new URL("..", import.meta.url));
  const dispose = mountVikaConfigRoutes(ctx, {
    pluginRoot,
    log: (level, message) => {
      try {
        const logger = ctx.logger;
        const fn = logger && (typeof logger[level] === "function" ? logger[level] : logger.info);
        if (typeof fn === "function") fn.call(logger, message);
      } catch { /* 日志不可用 */ }
    },
  });
  ctx.effect(() => () => dispose(), "openvikingExpand.shellConfig()");
}
