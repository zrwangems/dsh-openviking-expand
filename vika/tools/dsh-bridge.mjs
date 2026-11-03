#!/usr/bin/env node
/**
 * dsh-bridge：Vika 容器内操控 DSH 会话的命令行。
 *
 * 零依赖、Node 18+；默认向 http://host.docker.internal:3742 的 vika 组件桥发请求。
 * 配置查找顺序：命令行参数 > 环境变量 > 配置文件（/root/.dsh-bridge.json）> 默认值。
 *
 * 命令：
 *   health
 *   create --title T (--cwd DIR | --repo owner/name --slug s) [--thread K]... [--prompt TEXT] [--prompt-file F]
 *   send   --session ID (--text TEXT | --text-file F) [--steer]
 *   list   [--thread K] [--status S] [--limit N]
 *   show   --session ID
 *   wait   [--session ID] [--cursor N] [--timeout SEC]
 *   cancel --session ID
 *   rename --session ID --title T
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const VERSION = "0.2.0";
const DEFAULT_URL = "http://host.docker.internal:3742";
const CONFIG_CANDIDATES = [
  process.env.DSH_BRIDGE_CONFIG,
  "/root/.vika-tools.json",
  "/root/.dsh-bridge.json",
  "/workspace/.dsh-bridge.json",
  path.join(os.homedir(), ".dsh-bridge.json"),
].filter(Boolean);

const HELP = `dsh-bridge ${VERSION}

用法：
  dsh-bridge health
  dsh-bridge create --title <标题> (--cwd <目录> | --repo <owner/name> --slug <slug>)
                    [--thread <话题键>]... [--prompt <文本> | --prompt-file <文件>] [--request-id <id>]
  dsh-bridge send   --session <会话ID> (--text <文本> | --text-file <文件>) [--steer] [--request-id <id>]
  dsh-bridge list   [--thread <话题键>] [--status <状态>] [--limit <N>]
  dsh-bridge show   --session <会话ID>
  dsh-bridge wait   [--session <会话ID>] [--cursor <游标>] [--timeout <秒>]
  dsh-bridge cancel --session <会话ID>
  dsh-bridge rename --session <会话ID> --title <新标题>

  # vika 原生引擎（Vika 是 Router，每个 DSH 物理 session 是 worker）
  dsh-bridge sa-mode on|off   # /dshin 进入、/dshout 退出 router 模式
  dsh-bridge sa-state
  dsh-bridge sa-trigger (--text <文本> | --text-file <文件>) [--source feishu|github|manual] [--thread <话题键>] [--actor <id>] [--id <trigger-id>] [--strength explicit|normal]
  dsh-bridge sa-evaluating
  dsh-bridge sa-decide --id <trigger-id> [--kind accept|ignore] [--actor <id>] [--title <标题>] [--scope <范围>] [--name <worktree-name>] [--workspace <已有工作区路径>]
  dsh-bridge sa-tickets [--state open|working|ended|all]
  dsh-bridge sa-ticket --id <工单ID>
  dsh-bridge sa-wait-ticket --id <工单ID> [--timeout <秒>] [--interval <毫秒>]
  dsh-bridge sa-decisions
  dsh-bridge sa-threads
  dsh-bridge sa-workers
  dsh-bridge sa-workspaces
  dsh-bridge sa-fs [--path <目录>]
  dsh-bridge sa-workspace-add --path <目录>
  dsh-bridge sa-report --id <assignment-id> (--text <摘要> | --text-file <文件>)
  dsh-bridge sa-repos
  dsh-bridge sa-repo-add --name <仓库名> [--path <本地路径>] [--branch <默认分支>]
  dsh-bridge sa-repo-remove --name <仓库名>
  dsh-bridge sa-pause [--paused | --resume]
  dsh-bridge sa-settings [--block policy|eval|executor|channels] [--value-file <json> | --value <json>] [--revision <N>]

全局参数：
  --url <地址>     桥地址，默认 ${DEFAULT_URL}（也认 DSH_BRIDGE_URL）
  --token <token>  桥 token（也认 DSH_BRIDGE_TOKEN 或配置文件）
  --config <文件>  配置文件路径（默认 /root/.dsh-bridge.json）
  --help           显示本帮助

输出：成功时向 stdout 打印 JSON（{"ok":true,...}）；失败时打印 {"ok":false,"error":...} 并以非零码退出。`;

function parseArgs(argv) {
  const options = { _: [] };
  const takeValue = name => {
    const index = argv.indexOf(name);
    if (index === -1) return undefined;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw usageError(`${name} 缺参数`);
    argv.splice(index, 2);
    return value;
  };
  const takeAll = name => {
    const values = [];
    for (;;) {
      const value = takeValue(name);
      if (value === undefined) break;
      values.push(value);
    }
    return values;
  };
  const flags = new Set();
  const flagNames = ["--steer", "--help", "--json", "--stdin", "--paused", "--resume", "--workspace-new"];
  for (const flag of flagNames) {
    const index = argv.indexOf(flag);
    if (index !== -1) {
      flags.add(flag);
      argv.splice(index, 1);
    }
  }
  options.help = flags.has("--help");
  options.steer = flags.has("--steer");
  options.stdin = flags.has("--stdin");
  options.paused = flags.has("--paused");
  options.resume = flags.has("--resume");
  options.workspaceNew = flags.has("--workspace-new");
  for (const name of ["--url", "--token", "--config", "--title", "--cwd", "--repo", "--slug", "--prompt", "--prompt-file", "--session", "--text", "--text-file", "--request-id", "--status", "--limit", "--cursor", "--timeout", "--source", "--actor", "--id", "--state", "--block", "--value", "--value-file", "--revision", "--interval", "--name", "--path", "--branch", "--kind", "--actor", "--state", "--strength", "--title", "--scope", "--name", "--workspace"]) {
    const key = name.slice(2).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    const value = takeValue(name);
    if (value !== undefined) options[key] = value;
  }
  options.thread = takeAll("--thread");
  options._ = argv;
  return options;
}

function usageError(message) {
  const error = new Error(message);
  error.code = "usage";
  return error;
}

function readConfigFile(file) {
  const candidates = file ? [file] : CONFIG_CANDIDATES;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (parsed && typeof parsed === "object") return parsed;
    } catch {}
  }
  return {};
}

function resolveBridge(options) {
  const file = readConfigFile(options.config);
  const bridge = file.bridge !== null && typeof file.bridge === "object" ? file.bridge : {};
  const url = String(options.url || process.env.DSH_BRIDGE_URL || bridge.url || file.url || DEFAULT_URL).replace(/\/+$/, "");
  const token = String(options.token || process.env.DSH_BRIDGE_TOKEN || bridge.token || file.token || "");
  if (!token) throw usageError("缺少桥 token：用 --token、DSH_BRIDGE_TOKEN 或配置文件提供");
  const timeoutMs = Number(file.timeoutMs) > 0 ? Number(file.timeoutMs) : 60_000;
  return { url, token, timeoutMs };
}

function readJsonInput(options, valueKey, fileKey) {
  const text = String(options[valueKey] ?? readTextInput(options, "", "")).trim() || (fileKey ? String(readTextInput(options, "", fileKey)).trim() : "");
  if (!text) throw usageError("设置需要 --value 或 --value-file");
  try { return JSON.parse(text); } catch { throw usageError("设置值不是合法 JSON"); }
}

async function request(bridge, method, pathname, body) {
  const response = await fetch(`${bridge.url}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${bridge.token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(bridge.timeoutMs),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`桥返回了非 JSON 响应（HTTP ${response.status}）: ${text.slice(0, 200)}`);
  }
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload?.error?.message || `HTTP ${response.status}`);
    error.code = payload?.error?.code || `http_${response.status}`;
    error.status = response.status;
    throw error;
  }
  return payload;
}

function readTextInput(options, textKey, fileKey) {
  if (options[fileKey]) return fs.readFileSync(options[fileKey], "utf8");
  if (options.stdin) return fs.readFileSync(0, "utf8");
  return options[textKey] ?? "";
}

function print(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  const argv = process.argv.slice(2);
  const options = parseArgs(argv);
  if (options.help || options._.length === 0) {
    process.stdout.write(`${HELP}\n`);
    return options._.length === 0 && !options.help ? 2 : 0;
  }
  const command = options._[0];
  const bridge = resolveBridge(options);
  switch (command) {
    case "health": {
      print(await request(bridge, "GET", "/v1/health"));
      return 0;
    }
    case "create": {
      if (!options.title) throw usageError("create 需要 --title");
      if (!options.cwd && !(options.repo && options.slug)) throw usageError("create 需要 --cwd 或 --repo/--slug");
      const body = {
        title: options.title,
        ...(options.cwd ? { cwd: options.cwd } : {}),
        ...(options.repo ? { repo: options.repo } : {}),
        ...(options.slug ? { slug: options.slug } : {}),
        ...(options.thread.length ? { threads: options.thread } : {}),
        ...(options.requestId ? { requestId: options.requestId } : {}),
      };
      const prompt = readTextInput(options, "prompt", "promptFile").trim();
      if (prompt) body.prompt = prompt;
      print(await request(bridge, "POST", "/v1/sessions", body));
      return 0;
    }
    case "send": {
      if (!options.session) throw usageError("send 需要 --session");
      const text = readTextInput(options, "text", "textFile").trim();
      if (!text) throw usageError("send 需要 --text、--text-file 或 --stdin");
      print(await request(bridge, "POST", `/v1/sessions/${encodeURIComponent(options.session)}/messages`, {
        text,
        ...(options.steer ? { mode: "steer" } : {}),
        ...(options.requestId ? { requestId: options.requestId } : {}),
      }));
      return 0;
    }
    case "list": {
      const query = new URLSearchParams();
      if (options.thread.length) query.set("thread", options.thread[0]);
      if (options.status) query.set("status", options.status);
      if (options.limit) query.set("limit", options.limit);
      print(await request(bridge, "GET", `/v1/sessions${query.size ? `?${query}` : ""}`));
      return 0;
    }
    case "show": {
      if (!options.session) throw usageError("show 需要 --session");
      print(await request(bridge, "GET", `/v1/sessions/${encodeURIComponent(options.session)}`));
      return 0;
    }
    case "wait": {
      const query = new URLSearchParams();
      query.set("cursor", String(Number(options.cursor || 0) || 0));
      const timeout = Math.max(0, Math.min(120, Number(options.timeout ?? 55) || 0));
      query.set("timeoutMs", String(Math.round(timeout * 1000)));
      const payload = await request(bridge, "GET", `/v1/events?${query}`);
      if (options.session) payload.events = payload.events.filter(event => event.sessionId === options.session);
      print(payload);
      return 0;
    }
    case "cancel": {
      if (!options.session) throw usageError("cancel 需要 --session");
      print(await request(bridge, "POST", `/v1/sessions/${encodeURIComponent(options.session)}/cancel`, {}));
      return 0;
    }
    case "rename": {
      if (!options.session || !options.title) throw usageError("rename 需要 --session 与 --title");
      print(await request(bridge, "POST", `/v1/sessions/${encodeURIComponent(options.session)}/title`, { title: options.title }));
      return 0;
    }
    case "sa-state": {
      print(await request(bridge, "GET", "/v1/engine/state"));
      return 0;
    }
    case "sa-trigger": {
      const text = readTextInput(options, "text", "textFile").trim();
      if (!text) throw usageError("sa-trigger 需要 --text 或 --text-file");
      print(await request(bridge, "POST", "/v1/engine/triggers", {
        text,
        source: options.source || "feishu",
        thread: options.thread[0] || "vika",
        ...(options.actor ? { actor: options.actor } : {}),
        ...(options.id ? { id: options.id } : {}),
        ...(options.strength ? { strength: options.strength } : {}),
      }));
      return 0;
    }
    case "sa-tickets": {
      const query = new URLSearchParams();
      if (options.state) query.set("state", options.state);
      print(await request(bridge, "GET", `/v1/engine/tickets${query.size ? `?${query}` : ""}`));
      return 0;
    }
    case "sa-ticket": {
      if (!options.id) throw usageError("sa-ticket 需要 --id");
      print(await request(bridge, "GET", `/v1/engine/tickets/${encodeURIComponent(options.id)}`));
      return 0;
    }
    case "sa-wait-ticket": {
      if (!options.id) throw usageError("sa-wait-ticket 需要 --id");
      const timeout = Math.max(1, Math.min(180, Number(options.timeout ?? 90) || 90));
      const interval = Math.max(500, Math.min(5000, Number(options.interval ?? 2000) || 2000));
      const deadline = Date.now() + timeout * 1000;
      let latest;
      for (;;) {
        latest = await request(bridge, "GET", `/v1/engine/tickets/${encodeURIComponent(options.id)}`);
        const ticket = latest.ticket || latest;
        const assignments = Array.isArray(ticket.assignments) ? ticket.assignments : [];
        const reported = assignments.some(item => item && item.report && item.report.state !== "progress");
        if (ticket.state === "ended" || ticket.state === "blocked" || reported) break;
        if (Date.now() > deadline) break;
        await new Promise(resolve => setTimeout(resolve, interval));
      }
      print(latest);
      return 0;
    }
    case "sa-decisions": {
      print(await request(bridge, "GET", "/v1/engine/decisions"));
      return 0;
    }
    case "sa-settings": {
      if (!options.block) { print(await request(bridge, "GET", "/v1/engine/settings")); return 0; }
      const value = readJsonInput(options, "value", "valueFile");
      print(await request(bridge, "PUT", `/v1/engine/settings/${encodeURIComponent(options.block)}`, {
        value,
        ...(options.revision !== undefined ? { revision: Number(options.revision) } : {}),
      }));
      return 0;
    }
    case "sa-mode": {
      const mode = String(options._[1] || "").trim();
      if (mode !== "on" && mode !== "off") throw usageError("sa-mode 需要 on 或 off");
      print(await request(bridge, "POST", "/v1/engine/mode", { enabled: mode === "on" }));
      return 0;
    }
    case "sa-workspaces": {
      print(await request(bridge, "GET", "/v1/engine/workspaces"));
      return 0;
    }
    case "sa-fs": {
      print(await request(bridge, "GET", `/v1/engine/fs?path=${encodeURIComponent(options.path || "")}`));
      return 0;
    }
    case "sa-workspace-add": {
      if (!options.path) throw usageError("sa-workspace-add 需要 --path");
      print(await request(bridge, "POST", "/v1/engine/workspaces", { path: options.path }));
      return 0;
    }
    case "sa-evaluating": {
      print(await request(bridge, "GET", "/v1/engine/evaluating"));
      return 0;
    }
    case "sa-decide": {
      if (!options.id) throw usageError("sa-decide 需要 --id（trigger id）");
      const kind = options.kind || "accept";
      print(await request(bridge, "POST", "/v1/engine/decisions", {
        triggerId: options.id,
        kind,
        ...(options.actor ? { actor: options.actor } : {}),
        ...(options.title ? { title: options.title } : {}),
        ...(options.scope ? { scope: options.scope } : {}),
        ...(options.name ? { name: options.name } : {}),
        ...(options.workspace ? { workspace: options.workspace, workspaceNew: options.workspaceNew === true } : {}),
      }));
      return 0;
    }
    case "sa-threads": {
      print(await request(bridge, "GET", "/v1/engine/threads"));
      return 0;
    }
    case "sa-workers": {
      print(await request(bridge, "GET", "/v1/engine/workers"));
      return 0;
    }
    case "sa-repos": {
      print(await request(bridge, "GET", "/v1/engine/repos"));
      return 0;
    }
    case "sa-repo-add": {
      if (!options.name) throw usageError("sa-repo-add 需要 --name");
      print(await request(bridge, "POST", "/v1/engine/repos", {
        name: options.name,
        ...(options.path ? { path: options.path } : {}),
        ...(options.branch ? { defaultBranch: options.branch } : {}),
      }));
      return 0;
    }
    case "sa-repo-remove": {
      if (!options.name) throw usageError("sa-repo-remove 需要 --name");
      print(await request(bridge, "POST", "/v1/engine/repos/remove", { name: options.name }));
      return 0;
    }
    case "sa-pause": {
      const paused = options.resume ? false : (options.paused ? true : !(await request(bridge, "GET", "/v1/engine/settings")).settings.executor.value.paused);
      print(await request(bridge, "POST", "/v1/engine/pause", { paused }));
      return 0;
    }
    case "sa-report": {
      if (!options.id) throw usageError("sa-report 需要 --id（assignment id）");
      const summary = readTextInput(options, "text", "textFile").trim();
      if (!summary) throw usageError("sa-report 需要 --text 或 --text-file");
      print(await request(bridge, "POST", "/v1/engine/reports", { assignmentId: options.id, summary, state: options.state || "ready" }));
      return 0;
    }
    default:
      throw usageError(`未知命令: ${command}`);
  }
}

main()
  .then(code => {
    if (typeof code === "number" && code !== 0) process.exitCode = code;
  })
  .catch(error => {
    const code = error?.status ? 1 : error?.code === "usage" ? 2 : 1;
    process.stdout.write(`${JSON.stringify({ ok: false, error: { code: error?.code || "client_error", message: error?.message || String(error) } }, null, 2)}\n`);
    process.exitCode = code;
  });
