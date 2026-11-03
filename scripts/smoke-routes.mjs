#!/usr/bin/env node
/**
 * 起一个临时 HTTP 服务挂上插件路由，用 fetch 打一遍真实 OpenViking。
 *
 * 用法（先用 node scripts/smoke.mjs 确认 Host 访问层正常）：
 *   node scripts/smoke-routes.mjs
 *
 * 只读：bootstrap / ls / item 三条路由各打一次，并把前 200 字符打印出来。
 */
import { createServer } from "node:http";

import { resolveConfig } from "../host/config.mjs";
import { createOvClient } from "../host/connection.mjs";
import { createRouter } from "../host/routes.mjs";

const PORT = Number(process.env.OVX_SMOKE_PORT) || 19399;
const config = resolveConfig({});
const client = createOvClient({ endpoint: config.endpoint, timeoutMs: config.sidebar.timeoutMs });
// 这里 fence 恒真：只是本地验证数据形状，不模拟浏览器信任。
const route = createRouter({ config, client, fence: () => true });

const server = createServer((req, res) => route(req, res));
await new Promise(resolve => server.listen(PORT, "127.0.0.1", resolve));
process.stdout.write(`listening on http://127.0.0.1:${PORT}\n`);

const probes = [
  "/openviking-expand/bootstrap",
  "/openviking-expand/ls?uri=viking%3A%2F%2Fresources",
  "/openviking-expand/item?uri=viking%3A%2F%2Fresources%2FEMS_paper",
];

try {
  for (const path of probes) {
    const response = await fetch(`http://127.0.0.1:${PORT}${path}`);
    const text = await response.text();
    process.stdout.write(`${response.status}  ${path}\n      ${text.slice(0, 200).replace(/\s+/g, " ")}\n`);
  }
  const forbidden = await fetch(`http://127.0.0.1:${PORT}/openviking-expand/nope`);
  process.stdout.write(`${forbidden.status}  /openviking-expand/nope（应当 404）\n`);
} finally {
  await new Promise(resolve => server.close(resolve));
}
