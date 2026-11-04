import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "client", "vika", "runtime.mjs"), "utf8");

/** 在 vm 里加载客户端片段，模拟浏览器环境。 */
function loadFragment(overrides = {}) {
  const sandbox = {
    console,
    fetch: () => Promise.resolve({ ok: false }),
    setTimeout,
    clearTimeout,
    window: {},
    runtimeClientFactory: () => ({ apply() {} }),
    require: () => ({}),
    ...overrides,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "client/vika/runtime.mjs" });
  return sandbox;
}

/** 触发 apply，并返回清理函数（模拟 Cordis effect 的即时执行语义）。 */
function applyFragment(sandbox) {
  let stop = null;
  sandbox.vikaRuntimePart.apply({ effect: callback => { stop = callback() } });
  return () => { if (typeof stop === "function") stop() };
}

function tick(ms = 20) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test("运行时晚就绪时重试探测，就绪后只注册一次并停止", async () => {
  let probes = 0;
  let applied = 0;
  const sandbox = loadFragment({
    fetch: () => {
      probes += 1;
      return Promise.resolve({ ok: probes >= 3 });
    },
    setTimeout: callback => setTimeout(callback, 0),
    runtimeClientFactory: () => ({ apply: () => { applied += 1 } }),
  });
  const cleanup = applyFragment(sandbox);
  try {
    await tick(60);
    assert.equal(probes, 3, "第三次探测成功后才注册");
    assert.equal(applied, 1, "面板只注册一次");
    await tick(40);
    assert.equal(probes, 3, "注册成功后不应继续探测");
  } finally {
    cleanup();
  }
});

test("vika 组件关闭（路由一直不可用）时不注册面板，但持续重试", async () => {
  let probes = 0;
  let applied = 0;
  const sandbox = loadFragment({
    fetch: () => {
      probes += 1;
      return Promise.resolve({ ok: false });
    },
    setTimeout: callback => setTimeout(callback, 1),
    runtimeClientFactory: () => ({ apply: () => { applied += 1 } }),
  });
  const cleanup = applyFragment(sandbox);
  try {
    await tick(40);
    assert.ok(probes >= 2, "失败后应该继续探测");
    assert.equal(applied, 0, "路由不可用时不能注册面板");
  } finally {
    cleanup();
  }
});

test("vendored runtime client 不可用时告警一次并停止探测", async () => {
  let probes = 0;
  const warnings = [];
  const sandbox = loadFragment({
    console: { ...console, warn: message => warnings.push(String(message)) },
    fetch: () => {
      probes += 1;
      return Promise.resolve({ ok: true });
    },
    setTimeout: callback => setTimeout(callback, 0),
    runtimeClientFactory: () => null,
  });
  const cleanup = applyFragment(sandbox);
  try {
    await tick(40);
    assert.equal(probes, 1, "client 缺失后不应继续探测");
    assert.equal(warnings.length, 1, "应恰好告警一次");
    assert.match(warnings[0], /vika 面板客户端无法装载/);
  } finally {
    cleanup();
  }
});

test("插件卸载时停掉探测定时器", async () => {
  let probes = 0;
  const sandbox = loadFragment({
    fetch: () => {
      probes += 1;
      return Promise.resolve({ ok: false });
    },
    setTimeout: callback => setTimeout(callback, 1),
  });
  const cleanup = applyFragment(sandbox);
  await tick(30);
  assert.ok(probes >= 2, "应已开始重试");
  cleanup();
  const afterStop = probes;
  await tick(30);
  assert.equal(probes, afterStop, "清理后不应再探测");
});
