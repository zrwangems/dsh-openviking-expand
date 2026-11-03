/**
 * sidebar 组件：viking:// 目录树的数据路由（/openviking-expand/*，bootstrap / ls / item）。
 *
 * 这是一个独立的 Cordis 插件行：关闭时不注册任何路由、不要求 Web 服务存在。
 * 与 console 共享同一个前缀，由 shared/active.mjs 协调归属（sidebar 在时优先由它拥有）。
 */
import { registerComponent } from "../shared/active.mjs";

export const name = "openviking-expand-sidebar";

/** 不强制任何服务；只有真正挂载路由时才注入 webServer / connection。 */
export const inject = [];

export function apply(ctx, input = {}) {
  registerComponent("sidebar", ctx, input);
}
