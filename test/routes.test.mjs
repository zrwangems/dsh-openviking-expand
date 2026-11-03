import assert from "node:assert/strict";
import test from "node:test";

import { resolveConfig } from "../host/config.mjs";
import { createRouter, handleRouteRequest } from "../host/routes.mjs";
import { fakeClient, fakeReq, fakeRes } from "./fake.mjs";

function makeConfig(overrides = {}) {
  return resolveConfig({ endpoint: "http://ov.test", ...overrides });
}

async function call(router, url, method = "GET") {
  const res = fakeRes();
  const req = fakeReq(url, method);
  router(req, res);
  // createRouter 故意不返回 promise（Host 路由是回调式），等它把响应写完。
  for (let index = 0; index < 200 && !res.ended; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  assert.equal(res.ended, true, `响应没有结束：${url}`);
  return { status: res.statusCode, payload: res.json() };
}

test("bootstrap 暴露组件开关与根 URI", async () => {
  const router = createRouter({ config: makeConfig({ sidebar: { root: "viking://resources" } }), client: fakeClient(), fence: () => true });
  const { status, payload } = await call(router, "/openviking-expand/bootstrap");
  assert.equal(status, 200);
  assert.deepEqual(payload.result.components, { console: true, sidebar: true });
  assert.equal(payload.result.root, "viking://resources");
  assert.equal(payload.result.showHidden, false);
});

test("ls 把查询参数与根交给访问层", async () => {
  const client = fakeClient({
    list: uri => ({
      entries: [{ uri: `${uri}/EMS_paper`, isDir: true, size: 0 }],
      hasMore: false,
    }),
  });
  const router = createRouter({ config: makeConfig(), client, fence: () => true });
  const { status, payload } = await call(router, "/openviking-expand/ls?uri=viking%3A%2F%2Fresources&showHidden=true");
  assert.equal(status, 200);
  assert.equal(payload.result.uri, "viking://resources");
  assert.deepEqual(payload.result.entries.map(entry => entry.name), ["EMS_paper"]);
  assert.equal(client.calls[0].options.showHidden, true);
});

test("item 缺 uri 时是 400，非法 URI 也是 400", async () => {
  const router = createRouter({ config: makeConfig(), client: fakeClient(), fence: () => true });
  const missing = await call(router, "/openviking-expand/item");
  assert.equal(missing.status, 400);
  assert.equal(missing.payload.error.code, "bad-request");

  const invalid = await call(router, "/openviking-expand/item?uri=%2Fetc%2Fpasswd");
  assert.equal(invalid.status, 400);
  assert.equal(invalid.payload.error.code, "bad-uri");
});

test("item 对目录返回 L0+L1 组合", async () => {
  const uri = "viking://resources/demo";
  const client = fakeClient({
    dirs: [uri],
    files: {
      [`${uri}/.abstract.md`]: "---\ngenerated_by:\n  component: SemanticProcessor\n---\n\n摘要正文",
      [`${uri}/.overview.md`]: "---\ndirectory: viking://resources/demo/\n---\n\n# demo",
    },
    list: () => ({ entries: [{ uri: `${uri}/子项`, isDir: true }], hasMore: false }),
  });
  const router = createRouter({ config: makeConfig(), client, fence: () => true });
  const { status, payload } = await call(router, `/openviking-expand/item?uri=${encodeURIComponent(uri)}`);
  assert.equal(status, 200);
  assert.equal(payload.result.kind, "dir");
  assert.equal(payload.result.l0.meta.component, "SemanticProcessor");
  assert.match(payload.result.l1.body, /demo/);
  assert.equal(payload.result.children.length, 1);
});

test("fence 拒绝时返回 403，非 GET 返回 405，未知路径 404", async () => {
  const denied = createRouter({ config: makeConfig(), client: fakeClient(), fence: () => false });
  const forbidden = await call(denied, "/openviking-expand/bootstrap");
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.payload.error.code, "forbidden");

  const allowed = createRouter({ config: makeConfig(), client: fakeClient(), fence: () => true });
  const wrongMethod = await call(allowed, "/openviking-expand/bootstrap", "POST");
  assert.equal(wrongMethod.status, 405);

  const unknown = await call(allowed, "/openviking-expand/nope");
  assert.equal(unknown.status, 404);
  assert.equal(unknown.payload.error.code, "not-found");
});

test("/console 交给 console 组件自己处理；组件禁用时 404", async () => {
  let called = 0;
  const res = fakeRes();
  await handleRouteRequest({
    handlers: {},
    consoleRoute: async (req, out) => {
      called += 1;
      out.writeHead(200, { "content-type": "application/json" });
      out.end(JSON.stringify({ ok: true, handledBy: "console" }));
    },
    fence: () => true,
  }, fakeReq("/openviking-expand/console"), res);
  assert.equal(called, 1);
  assert.deepEqual(res.json(), { ok: true, handledBy: "console" });

  const disabled = fakeRes();
  await handleRouteRequest({ handlers: {}, consoleRoute: null, fence: () => true }, fakeReq("/openviking-expand/console"), disabled);
  assert.equal(disabled.statusCode, 404);
});

test("console 组件关掉后不再暴露 /console 路由", async () => {
  const router = createRouter({
    config: makeConfig({ console: { enabled: false } }),
    client: fakeClient(),
    fence: () => true,
  });
  const { status, payload } = await call(router, "/openviking-expand/console");
  assert.equal(status, 404);
  assert.match(payload.error.message, /console/);
});
