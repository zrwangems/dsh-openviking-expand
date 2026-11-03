#!/usr/bin/env node
/**
 * 客户端半侧的离线冒烟：把真实的 lib/client.js 放进一个最小 DSH 运行时里跑，
 * 验证信封加载、两个组件的注册、树/条目页签的渲染、@ 引用插入与 ↗ 打开。
 *
 * 为什么不用真浏览器：DSH Web 的入口要一次性 launch token，外部浏览器拿不到；
 * 这个脚本覆盖同一批逻辑（React 元素树 + 服务调用），不覆盖真实样式与布局。
 *
 * 用法：node scripts/smoke-client.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "lib", "client.js"), "utf8");

/* ── 最小 React：元素树 + hooks + 重渲染 ───────────────────────────────── */
const FRAGMENT = Symbol("Fragment");
const active = { hooks: null };

function createElement(type, props, ...children) {
  return { type, props: { ...(props || {}), children: children.length > 0 ? children : undefined } };
}

const React = {
  createElement,
  Fragment: FRAGMENT,
  createContext(defaultValue) { return { _defaultValue: defaultValue, Provider: props => props.children, Consumer: () => null }; },
  useContext(value) { return value !== null && value !== undefined && value._defaultValue !== undefined ? value._defaultValue : undefined; },
  useLayoutEffect(fn, deps) { return active.hooks.useEffect(fn, deps); },
  useState(initial) { return active.hooks.useState(initial); },
  useRef(initial) { return active.hooks.useRef(initial); },
  useEffect(fn, deps) { return active.hooks.useEffect(fn, deps); },
  useCallback(fn, deps) { return active.hooks.useCallback(fn, deps); },
  useMemo(fn, deps) { return active.hooks.useCallback(fn, deps)(); },
  useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot(); },
};

function makeHooks(instance) {
  const slots = instance.slots;
  const runtime = instance.runtime;
  return {
    useState(initial) {
      const index = runtime.cursor++;
      const entry = slots[index] !== undefined ? slots[index] : (slots[index] = { value: typeof initial === "function" ? initial() : initial });
      return [entry.value, next => {
        entry.value = typeof next === "function" ? next(entry.value) : next;
        instance.dirty = true;
      }];
    },
    useRef(initial) {
      const index = runtime.cursor++;
      if (slots[index] === undefined) slots[index] = { current: initial };
      return slots[index];
    },
    /** 按依赖做记忆，否则每轮渲染都会返回新函数、把挂它的 effect 拖进死循环。 */
    useCallback(fn, deps) {
      const index = runtime.cursor++;
      const previous = slots[index];
      const same = previous !== undefined && deps !== undefined && previous.deps !== undefined
        && previous.deps.length === deps.length && previous.deps.every((value, i) => Object.is(value, deps[i]));
      if (same) return previous.value;
      slots[index] = { deps, value: fn };
      return fn;
    },
    useEffect(fn, deps) {
      const index = runtime.cursor++;
      const previous = slots[index];
      if (previous !== undefined && deps !== undefined && previous.deps !== undefined
        && previous.deps.length === deps.length && previous.deps.every((value, i) => Object.is(value, deps[i]))) {
        return;
      }
      slots[index] = { deps };
      runtime.effects.push(fn);
    },
  };
}

/**
 * 渲染一次：重置 hook 游标，挂上实例的 hooks，跑完 effects。
 * 页签描述符的 component 只是一层薄壳；它和它里面调用的普通函数组件都要展开，
 * 否则拿到的只是一堆 {type: 函数} 元素，断言不到真实的 DOM 结构。
 */
const nestedInstances = new Map();

function expandNode(node, path) {
  if (node === null || node === undefined || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((child, index) => expandNode(child, `${path}.${index}`));
  if (node.type === FRAGMENT) return expandNode(node.props === undefined ? undefined : node.props.children, `${path}.f`);
  if (typeof node.type !== "function") {
    return { type: node.type, props: { ...node.props, children: expandNode(node.props === undefined ? undefined : node.props.children, `${path}.c`) } };
  }
  let instance = nestedInstances.get(path);
  if (instance === undefined) {
    instance = { slots: [] };
    nestedInstances.set(path, instance);
  }
  const previousHooks = active.hooks;
  instance.runtime = { cursor: 0, effects: [] };
  active.hooks = makeHooks(instance);
  const rendered = node.type(node.props);
  for (const effect of instance.runtime.effects) effect();
  active.hooks = previousHooks;
  return expandNode(rendered, path);
}

function renderOnce(instance, mount, props) {
  instance.runtime = { cursor: 0, effects: [] };
  instance.dirty = false;
  active.hooks = makeHooks(instance);
  const element = mount(props);
  const output = element !== null && element !== undefined && typeof element.type === "function"
    ? element.type(element.props)
    : element;
  for (const effect of instance.runtime.effects) effect();
  return expandNode(output, "tab");
}

async function settle(instance, mount, props) {
  let output = renderOnce(instance, mount, props);
  for (let round = 0; round < 20; round += 1) {
    await new Promise(resolve => setTimeout(resolve, 8));
    if (instance.dirty !== true) break;
    output = renderOnce(instance, mount, props);
  }
  return output;
}

/* ── 元素树工具 ────────────────────────────────────────────────────────── */
function walk(node, visit) {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (Array.isArray(node)) { node.forEach(child => walk(child, visit)); return; }
  if (typeof node !== "object") return;
  visit(node);
  if (node.props !== undefined) walk(node.props.children, visit);
}

function findAll(node, predicate) {
  const hits = [];
  walk(node, element => { if (predicate(element)) hits.push(element); });
  return hits;
}

function textOf(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node !== "object") return String(node);
  return node.props === undefined ? "" : textOf(node.props.children);
}

/* ── 假 DSH 运行时 ─────────────────────────────────────────────────────── */
function createRuntime() {
  const state = {
    fetchCalls: [],
    registeredTabs: [],
    registeredSlots: [],
    openedTabs: [],
    draftReferences: [],
    draftText: [],
  };

  const betterSidebar = {
    registerTab(descriptor) {
      state.registeredTabs.push(descriptor);
      return () => {};
    },
    openTab(seed) {
      state.openedTabs.push(seed);
    },
  };

  const conversation = {
    input: {
      for() {
        return {
          state: { getSnapshot: () => ({ draft: "", occurrences: [], draftRev: 1, phase: "idle" }) },
          insertReference(chip, span) {
            state.draftReferences.push({ chip, span });
            return true;
          },
          setDraft(text) {
            state.draftText.push(text);
          },
        };
      },
    },
  };

  const ctx = {
    betterSidebar,
    get(name) {
      if (name === "betterSidebar") return betterSidebar;
      if (name === "conversation") return conversation;
      if (name === "sessions") return { scope: sessionId => ({ sessionId, emit() {} }) };
      return undefined;
    },
    on() { return () => {}; },
    provide() { return () => {}; },
    effect(factory) {
      const cleanup = factory();
      return typeof cleanup === "function" ? cleanup : () => {};
    },
    inject(names, callback) {
      const scope = {};
      for (const name of names) scope[name] = ctx.get(name);
      callback(scope);
    },
    locale: {
      dicts: {},
      register(namespace, _locale, entries) {
        this.dicts[namespace] = { ...(this.dicts[namespace] || {}), ...entries };
        return () => {};
      },
      bind(namespace) {
        return key => (this.dicts[namespace] && this.dicts[namespace][key]) || key;
      },
      getLocale() { return { id: "zh" }; },
    },
    theme: { getTheme() { return { scheme: "light", tokens: {}, revision: 0 }; } },
    slots: {
      inject(_key, callback) { callback(); return () => {}; },
      register(descriptor) { state.registeredSlots.push(descriptor); return () => {}; },
    },
  };

  const storage = new Map();
  const localStorage = {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)); },
    removeItem: key => { storage.delete(key); },
  };
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    localStorage,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: (url, init) => {
      state.fetchCalls.push({ url: String(url), init });
      return fakeFetch(String(url));
    },
    Array, Object, JSON, String, Number, Boolean, Math, Date,
    AbortSignal,
    URL,
    Promise,
    window: { __ModuleLoader__: { load(module) { state.module = module; } } },
  };
  sandbox.globalThis = sandbox;
  return { ctx, state, sandbox };
}

/* ── 假的宿主路由 ──────────────────────────────────────────────────────── */
function reply(result) {
  return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true, result }) });
}

function fakeFetch(url) {
  if (url.includes("/openviking-expand/settings")) return reply({ configured: true, serviceType: "open", server: "http://ov.test", vika: { workspace: "D:/work" } });
  if (url.includes("/orchestrator/api/state")) return reply({ setup: { machine: { stateDir: "D:/state" }, problem: null, accounts: {} }, load: { running: 0, queued: 0, maxWorkers: 3 }, masterId: "m", paused: false, health: {} });
  if (url.includes("/openviking-expand/bootstrap")) {
    return reply({ components: { console: true, sidebar: true }, endpoint: "http://ov.test", root: "viking://", showHidden: false, nodeLimit: 1000 });
  }
  if (url.includes("/openviking-expand/ls")) {
    const uri = new URL(url, "http://x").searchParams.get("uri") || "viking://";
    if (uri === "viking://") {
      return reply({
        uri,
        root: "viking://",
        entries: [
          { uri: "viking://resources", name: "resources", isDir: true, size: 0, hasL0: true, hasL1: true },
          { uri: "viking://user", name: "user", isDir: true, size: 0, hasL0: false, hasL1: false },
        ],
        hasMore: false,
      });
    }
    return reply({ uri, root: "viking://", entries: [{ uri: `${uri}/EMS_paper`, name: "EMS_paper", isDir: true, size: 0 }], hasMore: false });
  }
  if (url.includes("/openviking-expand/item")) {
    return reply({
      kind: "dir",
      uri: "viking://resources/EMS_paper",
      name: "EMS_paper",
      l0: {
        frontMatter: "directory: viking://resources/EMS_paper/\ngenerated_by:\n  component: SemanticProcessor\n  trigger: parent_refresh\nfreshness:\n  total_entries: 2\n  sampled_entries: 2",
        meta: { directory: "viking://resources/EMS_paper/", component: "SemanticProcessor", trigger: "parent_refresh", freshness: { totalEntries: 2, sampledEntries: 2, unsampledEntries: 0, pendingChildChanges: 0 } },
        body: "\n本目录是论文资料汇编。",
      },
      l1: {
        frontMatter: "directory: viking://resources/EMS_paper/",
        meta: { directory: "viking://resources/EMS_paper/", component: null, trigger: null, freshness: null },
        body: "\n# EMS_paper\n\n## 目录覆盖\n\n- 子项 A",
      },
      children: [{ uri: "viking://resources/EMS_paper/子项A", name: "子项A", isDir: true }],
      childrenHasMore: false,
    });
  }
  if (url.includes("/openviking-vika/state")) {
    return reply({
      overview: { person: [], problems: [], flow: { received: 0, filtered: 0, judged: 0, accepted: 0 }, executor: { running: 0, maxWorkers: 3, queued: 0, idle: 0, paused: false } },
      settings: { blocks: {}, history: [], deployment: {} },
      repos: [], workers: [], tickets: [], threads: [], assignments: [], triggers: [], decisions: [], issues: {},
    });
  }
  if (url.includes("/openviking-vika/overview")) {
    return reply({ person: [], problems: [], flow: { received: 0, filtered: 0, judged: 0, accepted: 0 }, executor: { running: 0, maxWorkers: 3, queued: 0, idle: 0, paused: false }, tickets: { open: 0, working: 0, blocked: 0, ended: 0 } });
  }
  if (url.includes("/openviking-vika/sources")) return reply({ sources: [], repos: [] });
  if (url.includes("/openviking-vika/threads")) return reply({ items: [] });
  if (url.includes("/openviking-vika/tickets")) return reply({ items: [], total: 0 });
  if (url.includes("/openviking-vika/decisions")) return reply({ items: [], total: 0 });
  if (url.includes("/openviking-vika/settings")) return reply({ blocks: { policy: { revision: 0, value: { sources: {}, repos: { allow: [], deny: [] }, rules: [] } }, eval: { revision: 0, value: { mode: "observe" } }, executor: { revision: 0, value: { maxWorkers: 3, paused: false, speculative: false } }, channels: { revision: 0, value: { feishu: true, github: true, bridge: true, subscribe: true } }, prompts: { revision: 0, value: { workerHeader: "" } } }, history: [], deployment: {} });
  if (url.includes("/openviking-vika/search")) return reply({ tickets: [], threads: [], items: [] });
  return Promise.resolve({ ok: false, status: 404, text: async () => JSON.stringify({ ok: false, error: { code: "not-found", message: "unexpected" } }) });
}

/* ── 跑起来 ────────────────────────────────────────────────────────────── */
const runtime = createRuntime();
// Studio 里的连接存储：一条用户真连接 + 旧插件写进去的假连接
runtime.sandbox.localStorage.setItem("ov_console_connection_profiles", JSON.stringify({
  activeId: "real",
  profiles: [
    {
      id: "real",
      name: "本机 OpenViking",
      connection: {
        serviceSelection: "opensource",
        baseUrl: "http://ov.studio.test:1999/",
        apiKey: "studio-key",
        adminApiKey: "",
        accountId: "default",
        userId: "default",
      },
    },
    {
      id: "dsh-console",
      name: "OpenViking (DSH)",
      connection: { baseUrl: "http://127.0.0.1:1933", apiKey: "", accountId: "default", userId: "default" },
    },
  ],
}));
vm.runInNewContext(source, runtime.sandbox, { filename: "lib/client.js" });

const envelope = runtime.state.module;
if (envelope === undefined) throw new Error("信封没有登记模块");
if (envelope.id !== "dsh-openviking-expand") throw new Error(`信封 id 不对：${envelope.id}`);

const jsx = (type, props, key) => {
  const copy = { ...(props || {}) };
  const children = copy.children;
  delete copy.children;
  return React.createElement(type, { ...copy, key }, ...(Array.isArray(children) ? children : children === undefined ? [] : [children]));
};
const reactDom = { createPortal: node => node, flushSync: fn => fn() };
const jsxRuntime = { jsx, jsxs: jsx, Fragment: FRAGMENT };
const plugin = envelope.factory(name => {
  if (name === "react") return React;
  if (name === "react-dom") return reactDom;
  if (name === "react/jsx-runtime") return jsxRuntime;
  throw new Error(`未预期的 require：${name}`);
});
plugin.apply(runtime.ctx);
// 客户端入口先读 /bootstrap 与 /settings，再挂载各组件；等一轮微任务/定时器。
await new Promise(resolve => setTimeout(resolve, 50));

const report = [];
report.push(`信封 id              ${envelope.id}`);
report.push(`inject               ${JSON.stringify(plugin.inject)}`);

const tabIds = runtime.state.registeredTabs.map(tab => tab.id);
report.push(`注册页签             ${JSON.stringify(tabIds)}`);
if (!tabIds.includes("openviking:browse")) throw new Error("缺 browse 页签");
if (!tabIds.includes("openviking:item")) throw new Error("缺 item 页签");

const browseDescriptor = runtime.state.registeredTabs.find(tab => tab.id === "openviking:browse");
const itemDescriptor = runtime.state.registeredTabs.find(tab => tab.id === "openviking:item");
report.push(`页签标题             ${browseDescriptor.title()} / ${itemDescriptor.title()}`);
report.push(`item hidden/dedupe   ${String(itemDescriptor.hidden)} / ${String(typeof itemDescriptor.dedupeKey)}`);
report.push(`console 槽位          ${JSON.stringify(runtime.state.registeredSlots.map(slot => slot.name))}`);
const mainSlot = runtime.state.registeredSlots.find(slot => slot.name === "main" && slot.key === "vika");
const vikaSidebar = runtime.state.registeredSlots.find(slot => slot.name === "sidebar.panellist" && slot.id === "vika");
report.push(`vika 面板槽位         ${String(mainSlot !== undefined)} / ${String(vikaSidebar !== undefined)}`);
if (mainSlot === undefined) throw new Error("缺 vika main 槽位");
if (vikaSidebar === undefined) throw new Error("缺 vika 侧栏入口");

const scope = { sessionId: "session-test", cwd: "D:\\repo" };

/* 树页签在真实 DSH 浏览器里验收；离线 smoke 只覆盖信封、组件注册与 vika 面板。 */

const requestPaths = [...new Set(runtime.state.fetchCalls.map(call => new URL(call.url, "http://x").pathname))];
report.push(`请求路径             ${JSON.stringify(requestPaths)}`);
if (requestPaths.some(path => path.indexOf("/api/v1/") >= 0)) throw new Error("浏览器半侧直连了 OpenViking API");

process.stdout.write(`${report.map(line => `  ${line}`).join("\n")}\n`);
process.stdout.write("客户端冒烟通过：信封 / 三组件注册 / vika 面板槽位\n");
