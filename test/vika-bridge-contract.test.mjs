/**
 * 契约回归：dsh-bridge CLI 暴露的每条命令，都必须在运行中的宿主桥（host/vika/runtime-bridge.mjs）
 * 里有对应端点；同时锁定 sa-decide 的工作区/原因参数确实转发给引擎。
 *
 * 用假 runtime 启动真实桥：只验证桥的 HTTP 契约与 CLI 参数映射，不依赖 DSH/容器。
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { startRuntimeBridge } from "../host/vika/runtime-bridge.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "vika", "tools", "dsh-bridge.mjs");
const token = "contract-test-token";

/** CLI 支持的完整命令表；新增命令必须同时补桥端点并加进这里。 */
const COMMANDS = [
  "health",
  "sa-mode",
  "sa-state",
  "sa-trigger",
  "sa-evaluating",
  "sa-decide",
  "sa-tickets",
  "sa-ticket",
  "sa-wait-ticket",
  "sa-decisions",
  "sa-threads",
  "sa-workers",
  "sa-workspaces",
  "sa-fs",
  "sa-workspace-add",
  "sa-repos",
  "sa-settings",
];

function cliCommandsOf(source) {
  const names = new Set();
  for (const match of source.matchAll(/case "([a-z0-9-]+)":/g)) names.add(match[1]);
  return [...names];
}

function fakeRuntime({ decisions, tickets, state }) {
  const ticket = {
    id: "ticket-1",
    title: "contract ticket",
    decisionId: "decision-1",
    mandate: { strength: "explicit", policyVersion: 1, basis: { rules: [] }, actor: { source: "vika", id: "vika" }, scope: "probe" },
    channels: [],
    assignments: [],
    inputs: [],
    undelivered: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    origin: { triggerId: "trigger-1" },
    ended: { outcome: "completed", reason: "contract done", at: new Date().toISOString() },
  };
  const settings = {
    policy: { version: 1, sources: {}, rules: [] },
    eval: { mode: "observe", timeoutSeconds: 120 },
    executor: { maxWorkers: 2, paused: false, speculative: false, prepare: "" },
    channels: {},
    prompts: { workerHeader: "" },
  };
  return {
    masterId: "master-1",
    health: { state: "ready" },
    setup: { deployment: { repository: "owner/repo" } },
    store: {
      settings: () => settings,
      tickets: { list: () => [ticket], get: id => (id === ticket.id ? ticket : undefined) },
      triggers: { get: id => (id === "trigger-1" ? { id, text: "contract trigger", threads: [{ source: "vika", id: "t" }] } : undefined) },
      threads: { list: () => [] },
      read: { triggerStats: () => ({ vika: { received: 1 } }), recentDecisions: () => [] },
    },
    pendingEvaluations: () => [{ triggerId: "trigger-1", text: "probe", thread: "vika:t", strength: "explicit" }],
    receive: () => "stored",
    decideExternal: (id, outcome) => {
      decisions.push({ id, outcome });
      return { kind: outcome.kind, ticketId: outcome.kind === "accept" ? ticket.id : undefined };
    },
    engine: { retryTicket() {}, stopTicket() {} },
  };
}

function run(args, env, cwd) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [cli, ...args, "--token", token], { env, cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => (stdout += chunk));
    child.stderr.on("data", chunk => (stderr += chunk));
    const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
    child.on("close", status => {
      clearTimeout(timer);
      let json;
      try { json = stdout ? JSON.parse(stdout) : undefined } catch { json = undefined; }
      resolve({ status, stdout, stderr, json });
    });
  });
}

test("CLI 命令与宿主桥端点一一对应，且参数被消费", async t => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "vika-contract-"));
  t.after(() => fs.rmSync(state, { recursive: true, force: true }));
  const workspace = path.join(state, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  const dshHome = path.join(state, "dshhome");
  fs.mkdirSync(path.join(dshHome, "storages"), { recursive: true });
  fs.writeFileSync(path.join(dshHome, "storages", "workspace.json"), JSON.stringify({
    tables: { workspaces: { w1: { id: "w1", title: "Default", path: workspace } } },
  }), "utf8");
  // 桥在测试进程内读取 DSH_HOME，因此要改当前进程的环境变量（CLI 子进程继承同一份）。
  const previousDshHome = process.env.DSH_HOME;
  process.env.DSH_HOME = dshHome;
  t.after(() => {
    if (previousDshHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousDshHome;
  });
  const decisions = [];
  const runtime = fakeRuntime({ decisions });
  const bridge = startRuntimeBridge({
    runtime,
    vika: { bridge: { host: "127.0.0.1", port: 0 }, stateDir: state },
    token,
    log: () => {},
  });
  const address = await bridge.start();
  t.after(() => bridge.close());
  const env = { ...process.env, DSH_HOME: dshHome };
  const call = args => run([...args, "--url", `http://127.0.0.1:${address.port}`], env, state);

  // 先进入 router 模式：桥在其它接口前做模式门禁。
  const mode = await call(["sa-mode", "on"]);
  assert.equal(mode.status, 0, mode.stdout + mode.stderr);

  const newWorkspace = path.join(state, "new-workspace");
  const argsOf = {
    health: [],
    "sa-mode": ["on"],
    "sa-state": [],
    "sa-trigger": ["--text", "干活", "--source", "feishu", "--thread", "contract"],
    "sa-evaluating": [],
    "sa-decide": ["--id", "trigger-1", "--kind", "accept", "--title", "T", "--scope", "S", "--name", "contract", "--reason", "用户确认", "--workspace", workspace],
    "sa-tickets": [],
    "sa-ticket": ["--id", "ticket-1"],
    "sa-wait-ticket": ["--id", "ticket-1", "--timeout", "1", "--interval", "500"],
    "sa-decisions": [],
    "sa-threads": [],
    "sa-workers": [],
    "sa-workspaces": [],
    "sa-fs": ["--path", state],
    "sa-workspace-add": ["--path", newWorkspace],
    "sa-repos": [],
    "sa-settings": [],
  };

  // CLI 源码里出现的命令必须与契约表完全一致（避免悄悄加回没有桥端点的命令）。
  const source = fs.readFileSync(cli, "utf8");
  assert.deepEqual(cliCommandsOf(source).sort(), [...COMMANDS].sort(), "CLI 命令表与契约表不一致");
  for (const command of COMMANDS) assert.match(source, new RegExp(`dsh-bridge ${command}`), `帮助里缺少 ${command}`);

  for (const command of COMMANDS) {
    const result = await call([command, ...argsOf[command]]);
    assert.equal(result.json?.ok, true, `${command} 未被运行中的桥接受：${result.stdout}${result.stderr}`);
    assert.notEqual(result.json?.error?.code, "not_found", `${command} 命中了不存在的桥端点`);
    assert.notEqual(result.json?.error?.code, "not_supported", `${command} 命中了桥不支持的端点`);
  }

  // sa-decide 的 --workspace / --reason 确实进了引擎（而不是被 CLI 丢掉）。
  const accept = decisions.find(item => item.outcome.kind === "accept");
  assert.equal(accept.outcome.workspace, workspace.replaceAll("\\", "/"));
  assert.equal(accept.outcome.reason, "用户确认");

  // 同一 workspace 第二次接单：仍然把 workspace 交给引擎（不缓存、不丢）。
  await call(["sa-decide", "--id", "trigger-1", "--kind", "accept", "--workspace", workspace]);
  const accepts = decisions.filter(item => item.outcome.kind === "accept");
  assert.equal(accepts.length, 2);
  assert.equal(accepts[1].outcome.workspace, workspace.replaceAll("\\", "/"));

  // 不存在的工作区必须被拒绝，不能隐式新建。
  const missing = await call(["sa-decide", "--id", "trigger-1", "--kind", "accept", "--workspace", path.join(state, "no-such")]);
  assert.notEqual(missing.status, 0);
  assert.equal(missing.json?.error?.code, "bad_request");

  // 旧命令已删除：不能静默成功。
  for (const legacy of ["create", "send", "list", "show", "wait", "cancel", "rename", "sa-report", "sa-pause", "sa-repo-add", "sa-repo-remove"]) {
    const result = await call([legacy, "--id", "x"]);
    assert.equal(result.status, 2, `${legacy} 应该被当成未知命令`);
    assert.equal(result.json?.error?.code, "usage");
  }
});
