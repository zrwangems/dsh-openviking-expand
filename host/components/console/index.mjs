/**
 * console 组件：左侧栏 OpenViking 入口、同源 /studio/* 代理，以及（sidebar 关闭时的）
 * /openviking-expand/* 状态路由。
 *
 * 这是一个独立的 Cordis 插件行：关闭时不注册任何路由、不要求 Web 服务存在。
 * 与 sidebar 共享同一个前缀，由 shared/active.mjs 协调归属。
 */
import { registerComponent } from "../shared/active.mjs";

export const name = "openviking-expand-console";

/** 不强制任何服务；只有真正挂载路由时才注入 webServer / connection。 */
export const inject = [];

export function apply(ctx, input = {}) {
  registerComponent("console", ctx, input);
}
