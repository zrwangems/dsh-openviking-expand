/**
 * Vika 容器一键配置：检测用户自建的 Vika 容器，部署工具/角色/桥配置并重启。
 *
 * 插件不管理 Vika 的安装或镜像，只操作一个已经存在的容器：
 *  - 要求容器的 /workspace 挂载到插件设置里的 vika 工作区；
 *  - 把 vika/tools 部署到容器 /root/.vika/tools；
 *  - 写容器 /root/.dsh-bridge.json；
 *  - 用容器里的 colleague.md + 本插件角色生成 /root/.vika/roles/vika.md；
 *  - 备份并修改 /root/.vika/config.json 的 agents[0].role；
 *  - 调用容器里的 vika restart，并从容器内做一次桥健康检查。
 */
import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);
const CONTAINER_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

function docker(args, { timeout = 120000, input } = {}) {
  if (input === undefined) {
    return execFileAsync("docker", args, { timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
      .then(result => ({ stdout: result.stdout, stderr: result.stderr }))
      .catch(error => {
        const detail = String(error.stderr || error.stdout || "").trim();
        const code = error.code === undefined ? "" : `（${error.code}）`;
        throw new Error(`docker ${args.join(" ")} 失败${code}: ${detail.slice(0, 800) || error.message}`);
      });
  }
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error(`docker ${args.join(" ")} 超时`)) }, timeout);
    child.stdout.on("data", chunk => { stdout += chunk });
    child.stderr.on("data", chunk => { stderr += chunk });
    child.on("error", error => { clearTimeout(timer); reject(error) });
    child.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`docker ${args.join(" ")} 失败（${code}）: ${(stderr || stdout).trim().slice(0, 800)}`));
    });
    child.stdin.end(input);
  });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function normalizePath(value) {
  return path.resolve(value).replaceAll("\\", "/").replace(/\/+$/, "");
}

function samePath(a, b) {
  return normalizePath(a).toLowerCase() === normalizePath(b).toLowerCase();
}

/** 列出本机容器，供插件设置页选择。 */
export async function listVikaContainers() {
  const { stdout } = await docker(["ps", "-a", "--format", "{{.Names}}\t{{.Image}}\t{{.Status}}"]);
  return stdout.split(/\r?\n/).filter(Boolean).map(line => {
    const [name, image, status] = line.split("\t");
    return { name, image, status, running: /^Up\b/i.test(status || "") };
  }).filter(item => /vika/i.test(item.name) || /vika/i.test(item.image));
}

/** 已选容器，或自动选中唯一运行中的 Vika 容器。 */
export async function resolveVikaContainer(container) {
  if (CONTAINER_NAME.test(String(container || ""))) return container;
  const running = (await listVikaContainers()).filter(item => item.running);
  return running.length === 1 ? running[0].name : "";
}

/** 读取容器 /workspace 的宿主挂载源；没有容器/挂载时返回 null。 */
export async function resolveContainerWorkspace(container) {
  if (!CONTAINER_NAME.test(String(container || ""))) return null;
  try {
    const mounts = await containerMounts(container);
    const mount = mounts.find(item => item.destination === "/workspace");
    return mount ? mount.source : null;
  } catch {
    return null;
  }
}

async function containerMounts(container) {
  const { stdout } = await docker(["inspect", "--format", "{{range .Mounts}}{{.Source}}|{{.Destination}}\n{{end}}", container]);
  return stdout.split(/\r?\n/).filter(Boolean).map(line => {
    const index = line.indexOf("|");
    return { source: line.slice(0, index), destination: line.slice(index + 1) };
  });
}

async function readContainerFile(container, file) {
  const { stdout } = await docker(["exec", container, "sh", "-c", `cat ${shellQuote(file)}`]);
  return stdout;
}

async function writeContainerFile(container, file, content) {
  await docker(["exec", "-i", container, "sh", "-c", `cat > ${shellQuote(file)}`], { input: content });
}

/** Docker 偶发失败（引擎忙、管道抖动）时重试几次，保留最后一次真实错误。 */
async function withDockerRetry(action, attempts = 3, delayMs = 800) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await action() } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

/** 把宿主文本文件写进容器：走 docker exec + stdin，比 docker cp 更能容忍引擎抖动。 */
async function copyHostFile(container, hostFile, containerFile) {
  const content = await readFile(hostFile, "utf8");
  await withDockerRetry(() => writeContainerFile(container, containerFile, content));
}

/**
 * 让 /dshin、/dshout、/dshnew 不被 Vika 本地命令解析器截获，而是作为普通消息交给模型。
 *
 * 只能改容器内源码，因此必须能验证补丁真的写进去了：匹配不到（Vika 版本/目录变化）时明确报告，
 * 不能静默跳过却显示配置成功。纯函数单独导出，便于单测；写盘与读回在 allowRouterCommands 里。
 *
 * @param {string} text 原始 commands.mjs 文本。
 * @returns {{text: string, patched: boolean}} patched=false 表示这段源码里没有可插入的锚点。
 */
export function applyRouterCommandAllowlist(text) {
  if (typeof text !== "string" || text === "") return { text, patched: false };
  const guard = 'if (["dshin","dshout","dshnew"].includes(token.toLowerCase())) return null;';
  let next = text.replace(/\n\s*if \(\["dshin"[^\n]*\n/g, "\n");
  if (next.includes(guard)) return { text: next, patched: true };
  const inserted = next.replace(/(\n\s*const \[token = [^\n]*\n)/, `$1  ${guard}\n`);
  if (inserted === next) return { text, patched: false };
  return { text: inserted, patched: true };
}

/** 对容器里的候选命令解析器打补丁并读回校验；返回命中、缺锚点与文件不存在三类文件。 */
async function allowRouterCommands(container) {
  const files = [
    "/root/.vika/current/packages/daemon/src/commands.mjs",
    "/root/.vika/current/node_modules/@vika/daemon/src/commands.mjs",
  ];
  const patched = [];
  const unmatched = [];
  const missing = [];
  for (const file of files) {
    let text;
    try { text = await readContainerFile(container, file); } catch { missing.push(file); continue; }
    const result = applyRouterCommandAllowlist(text);
    if (!result.patched) { unmatched.push(file); continue; }
    if (result.text !== text) {
      const tmp = path.join(pluginTmpDir(), `.vika-command-${process.pid}-${Date.now()}.mjs`);
      await mkdir(path.dirname(tmp), { recursive: true });
      await writeFile(tmp, result.text, "utf8");
      await copyHostFile(container, tmp, file);
      await rm(tmp, { force: true });
      const written = await readContainerFile(container, file).catch(() => "");
      if (!written.includes('if (["dshin","dshout","dshnew"]')) { unmatched.push(file); continue; }
    }
    patched.push(file);
  }
  return { patched, unmatched, missing };
}

/** 撤销 /dshin 放行补丁：只删除插件插入的那一行，其它源码不动。 */
export function removeRouterCommandAllowlist(text) {
  if (typeof text !== "string" || text === "") return { text, removed: false };
  const next = text.replace(/\n[ \t]*if \(\["dshin","dshout","dshnew"\]\.includes\(token\.toLowerCase\(\)\)\) return null;[ \t]*\n/g, "\n");
  return { text: next, removed: next !== text };
}

/** 还原容器里的候选命令解析器；返回实际撤销、缺补丁与文件不存在的三类文件。 */
async function revertRouterCommands(container) {
  const files = [
    "/root/.vika/current/packages/daemon/src/commands.mjs",
    "/root/.vika/current/node_modules/@vika/daemon/src/commands.mjs",
  ];
  const reverted = [];
  const unmatched = [];
  const missing = [];
  for (const file of files) {
    let text;
    try { text = await readContainerFile(container, file); } catch { missing.push(file); continue; }
    const result = removeRouterCommandAllowlist(text);
    if (!result.removed) { unmatched.push(file); continue; }
    const tmp = path.join(pluginTmpDir(), `.vika-command-revert-${process.pid}-${Date.now()}.mjs`);
    await mkdir(path.dirname(tmp), { recursive: true });
    await writeFile(tmp, result.text, "utf8");
    await copyHostFile(container, tmp, file);
    await rm(tmp, { force: true });
    const written = await readContainerFile(container, file).catch(() => "");
    if (written.includes('if (["dshin","dshout","dshnew"]')) { unmatched.push(file); continue; }
    reverted.push(file);
  }
  return { reverted, unmatched, missing };
}

/**
 * 一键配置一个已存在的 Vika 容器。
 *
 * 不写宿主工作区、不创建额外目录：工具和桥配置直接部署进容器
 * （/root/.vika/tools 与 /root/.dsh-bridge.json）。
 *
 * @param options `{container, settings, pluginRoot, log}`；settings 是 normalizeSettings 后的对象。
 */
export async function configureVikaContainer({ container, settings, pluginRoot, log = () => {} }) {
  if (!CONTAINER_NAME.test(String(container || ""))) throw new Error("容器名不合法");
  const vika = settings.vika || {};
  const steps = [];

  const inspect = await docker(["inspect", "--format", "{{.State.Running}}", container]);
  if (String(inspect.stdout).trim() !== "true") throw new Error(`容器 ${container} 没有运行`);

  try {
    await docker(["version", "--format", "{{.Server.Version}}"], { timeout: 15000 });
  } catch (error) {
    throw new Error("Docker 引擎没有响应，请重启 Docker Desktop 后重试：" + (error instanceof Error ? error.message : String(error)));
  }
  const mounts = await containerMounts(container);
  const workspaceMount = mounts.find(item => item.destination === "/workspace");
  if (workspaceMount === undefined) throw new Error(`容器 ${container} 没有 /workspace 挂载；请用 -v <vika目录>:/workspace 启动`);
  const workspace = workspaceMount.source;
  steps.push(`容器运行中，/workspace = ${workspace}`);

  // 工具直接进容器，不碰宿主工作区。
  await withDockerRetry(() => docker(["exec", container, "sh", "-c", "mkdir -p /root/.vika/tools && test -d /root/.vika/tools"]));
  const toolsDir = path.join(pluginRoot, "vika", "tools");
  for (const name of readdirSync(toolsDir)) {
    if (!name.endsWith(".mjs")) continue;
    await copyHostFile(container, path.join(toolsDir, name), `/root/.vika/tools/${name}`);
  }
  steps.push("工具已部署：/root/.vika/tools");

  // 桥 token 在 <workspace>/.vika/state/bridge.token；没有就生成。
  let token = "";
  try { token = (await readFile(path.join(workspace, ".vika", "state", "bridge.token"), "utf8")).trim() } catch { /* 首次 */ }
  if (token === "") token = randomBytes(24).toString("base64url");
  const bridgeUrl = `http://host.docker.internal:${Number(vika.bridgePort) || 3742}`;
  // gh-work 用这些宿主路径把容器里的 /workspace/... 翻译成宿主绝对路径；缺了它们 worker 会拿到容器路径。
  const hostWorkspace = normalizePath(workspace);
  const bridgeConfig = {
    url: bridgeUrl,
    token,
    timeoutMs: 60000,
    hostWorkspace,
    hostReposRoot: `${hostWorkspace}/repos`,
    hostTasksRoot: `${hostWorkspace}/tasks`,
  };
  const bridgeConfigText = JSON.stringify(bridgeConfig, null, 2) + "\n";
  await writeContainerFile(container, "/root/.dsh-bridge.json", bridgeConfigText);
  steps.push("桥配置已写入容器 /root/.dsh-bridge.json");

  const tmpDir = pluginTmpDir();
  await mkdir(tmpDir, { recursive: true });

  // 角色 = 容器里的 colleague.md + 本插件角色段。
  const baseRole = await readContainerFile(container, "/root/.vika/current/packages/daemon/agent/roles/colleague.md").catch(() => "");
  if (baseRole.trim() === "") throw new Error("读不到容器内的 colleague.md；Vika 版本/路径可能不匹配");
  const roleParts = [baseRole.trimEnd()];
  for (const file of ["role-dsh.md", "role-github.md"]) {
    try { roleParts.push((await readFile(path.join(pluginRoot, "vika", file), "utf8")).trim()) } catch { /* 可选 */ }
  }
  const rolePath = "/root/.vika/roles/vika.md";
  let displayName = "Vika";
  try {
    const identity = JSON.parse(await readContainerFile(container, "/root/.vika/config.json"));
    if (typeof identity?.agents?.[0]?.displayName === "string" && identity.agents[0].displayName.trim() !== "") displayName = identity.agents[0].displayName.trim();
  } catch { /* 保留默认 */ }
  const roleText = roleParts.join("\n\n").replaceAll("{{AGENT_NAME}}", displayName) + "\n";
  const roleTmp = path.join(tmpDir, `.vika-role-${process.pid}-${Date.now()}.md`);
  await writeFile(roleTmp, roleText, "utf8");
  await docker(["exec", container, "sh", "-c", "mkdir -p /root/.vika/roles"]);
  await copyHostFile(container, roleTmp, rolePath);
  await rm(roleTmp, { force: true });
  steps.push(`角色已生成：${rolePath}`);

  const allowlist = await allowRouterCommands(container);
  if (allowlist.patched.length > 0) {
    steps.push(`/dshin、/dshout、/dshnew 已放行给 Vika 模型（${allowlist.patched.length} 个命令解析器）`);
  }
  if (allowlist.unmatched.length > 0) {
    log("warn", `vika: 命令解析器补丁未命中，/dshin 可能仍被 Vika 当成本地命令：${allowlist.unmatched.join(", ")}`);
    steps.push(`警告：/dshin 放行补丁未命中，请检查 ${allowlist.unmatched.join(", ")}`);
  }

  const configText = await readContainerFile(container, "/root/.vika/config.json");
  const config = JSON.parse(configText);
  if (!Array.isArray(config.agents) || config.agents.length === 0) throw new Error("容器 config.json 没有 agents");
  const backup = `/root/.vika/config.json.bak.plugin-${Date.now()}`;
  await docker(["exec", container, "sh", "-c", `cp ${shellQuote("/root/.vika/config.json")} ${shellQuote(backup)}`]);
  const next = { ...config, agents: config.agents.map((agent, index) => index === 0 ? { ...agent, role: rolePath } : agent) };
  const configTmp = path.join(tmpDir, `.vika-config-${process.pid}-${Date.now()}.json`);
  await writeFile(configTmp, JSON.stringify(next, null, 2) + "\n", "utf8");
  await copyHostFile(container, configTmp, "/root/.vika/config.json");
  await rm(configTmp, { force: true });
  steps.push(`config.json 已更新（备份 ${backup}）`);

  try {
    await docker(["exec", container, "/root/.vika/bin/vika", "restart"], { timeout: 240000 });
    steps.push("vika restart 完成");
  } catch (error) {
    log("warn", `vika restart 失败，改用 docker restart: ${String(error)}`);
    await docker(["restart", container], { timeout: 240000 });
    steps.push("docker restart 完成");
  }

  await new Promise(resolve => setTimeout(resolve, 2500));
  let health = null;
  try {
    const result = await docker(["exec", container, "node", "/root/.vika/tools/dsh-bridge.mjs", "health"], { timeout: 60000 });
    health = JSON.parse(result.stdout);
    steps.push("容器内桥健康检查通过");
  } catch (error) {
    steps.push("容器内桥健康检查暂未通过（DSH 可能正在重启）");
    log("warn", `容器内桥健康检查失败: ${String(error)}`);
  }

  return { container, workspace, steps, health };
}


/** 插件会写死的 git 全局键；恢复时按安装前备份还原。 */
const GIT_IDENTITY_KEYS = ["user.login", "user.name", "user.email", "credential.helper", "init.defaultBranch"];
const GIT_IDENTITY_BACKUP = "/root/.vika/.plugin-git-identity-backup.json";
const GITHUB_MARKER = "/root/.vika/.plugin-github.json";

/** 用已登录的 gh 账号写 git 全局身份，供 gh-work 自动读取。 */
async function configureGitIdentity(container) {
  const script = "login=$(gh api user --jq .login) && git config --global user.login \"$login\" && git config --global user.name \"$login\" && git config --global user.email \"$login@users.noreply.github.com\" && git config --global credential.helper '!gh auth git-credential' && git config --global init.defaultBranch main";
  await docker(["exec", container, "sh", "-lc", script], { timeout: 60000 });
}

/** 记录插件改动前的 git 全局配置（只记一次，避免被插件写入的值覆盖备份）。 */
async function backupGitIdentity(container) {
  try { await readContainerFile(container, GIT_IDENTITY_BACKUP); return; } catch { /* 首次 */ }
  const values = {};
  for (const key of GIT_IDENTITY_KEYS) {
    try {
      const result = await docker(["exec", container, "git", "config", "--global", "--get", key], { timeout: 30000 });
      values[key] = result.stdout.trim() || null;
    } catch { values[key] = null; }
  }
  await writeContainerFile(container, GIT_IDENTITY_BACKUP, `${JSON.stringify(values, null, 2)}\n`);
}

/** 恢复 git 全局配置：有备份按备份还原，没有备份时只清理明显由插件写入的值。 */
async function restoreGitIdentity(container) {
  let backup = null;
  try { backup = JSON.parse(await readContainerFile(container, GIT_IDENTITY_BACKUP)); } catch { backup = null; }
  if (backup !== null && typeof backup === "object") {
    for (const key of GIT_IDENTITY_KEYS) {
      const value = backup[key];
      const argv = value === null || value === undefined
        ? ["exec", container, "git", "config", "--global", "--unset-all", key]
        : ["exec", container, "git", "config", "--global", key, String(value)];
      await docker(argv).catch(() => {});
    }
    return true;
  }
  const script = [
    'login=$(git config --global --get user.login 2>/dev/null || true)',
    'if [ -n "$login" ]; then git config --global --unset-all user.login 2>/dev/null || true; git config --global --unset-all user.name 2>/dev/null || true; fi',
    'email=$(git config --global --get user.email 2>/dev/null || true)',
    'case "$email" in *"@users.noreply.github.com") git config --global --unset-all user.email 2>/dev/null || true ;; esac',
    'helper=$(git config --global --get credential.helper 2>/dev/null || true)',
    '[ "$helper" = "!gh auth git-credential" ] && git config --global --unset-all credential.helper 2>/dev/null || true',
    'branch=$(git config --global --get init.defaultBranch 2>/dev/null || true)',
    '[ "$branch" = "main" ] && git config --global --unset-all init.defaultBranch 2>/dev/null || true',
    "true",
  ].join("\n");
  await docker(["exec", container, "sh", "-lc", script]).catch(() => {});
  return false;
}

/** 读取 GitHub 插件改动标记；不存在时返回空对象。 */
async function readGithubMarker(container) {
  try { return JSON.parse(await readContainerFile(container, GITHUB_MARKER)); } catch { return {}; }
}

/** 写入 GitHub 插件改动标记。 */
async function writeGithubMarker(container, marker) {
  await writeContainerFile(container, GITHUB_MARKER, `${JSON.stringify(marker, null, 2)}\n`);
}

/** 在 Vika 容器里安装 GitHub CLI 并开始网页登录（设备码）。 */
export async function githubSetup({ container, log = () => {} }) {
  if (!CONTAINER_NAME.test(String(container || ""))) throw new Error("容器名不合法");
  const inspect = await docker(["inspect", "--format", "{{.State.Running}}", container]);
  if (String(inspect.stdout).trim() !== "true") throw new Error(`容器 ${container} 没有运行`);
  const steps = [];

  // 记录插件的改动范围：恢复时只卸载插件装的 gh、只清插件建立的登录态与 git 身份。
  const marker = await readGithubMarker(container);
  const hadGh = await docker(["exec", container, "sh", "-lc", "command -v gh >/dev/null 2>&1"]).then(() => true, () => false);
  let hadAuth = false;
  if (hadGh) {
    try {
      const status = await docker(["exec", container, "sh", "-lc", "gh auth status"], { timeout: 30000 });
      hadAuth = status.stdout.trim() !== "";
    } catch { hadAuth = false; }
  }
  await writeGithubMarker(container, { ...marker, installedGh: marker.installedGh === true || !hadGh, hadAuth });
  await backupGitIdentity(container);

  // /root/.config/gh 可能是指向数据卷 tools/gh/config 的符号链接；先把目标目录建好，否则 gh 无法保存登录态。
  await docker(["exec", container, "sh", "-lc", "mkdir -p /root/.vika/tools/gh/config /root/.config"]);

  const hasGh = hadGh;
  if (!hasGh) {
    const install = [
      "if command -v apt-get >/dev/null 2>&1; then apt-get update -qq && apt-get install -y gh;",
      "elif command -v apk >/dev/null 2>&1; then apk add --no-cache github-cli;",
      "else echo '没有 apt-get/apk，无法自动安装 gh' >&2; exit 2; fi",
    ].join(" ");
    try {
      const result = await docker(["exec", container, "sh", "-lc", install], { timeout: 300000 });
      steps.push("已安装 GitHub CLI");
      if (result.stdout.trim() !== "") steps.push(result.stdout.trim().slice(0, 500));
    } catch (error) {
      throw new Error(`安装 gh 失败：${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    steps.push("GitHub CLI 已存在");
  }

  try {
    const status = await docker(["exec", container, "sh", "-lc", "gh auth status"], { timeout: 30000 });
    if (status.stdout.trim() !== "") {
      try { await configureGitIdentity(container); steps.push("已写入容器 git 全局身份") } catch (error) { steps.push(`git 身份写入失败：${String(error)}`) }
      return { authorized: true, steps, output: status.stdout.trim() };
    }
    return { authorized: true, steps, output: "GitHub CLI 已登录" };
  } catch {
    // 未登录，继续设备码流程。
  }

  // 启动网页登录；设备码会出现在输出里。进程留在后台，用户在浏览器授权后自动完成。
  const child = spawn("docker", ["exec", "-i", container, "sh", "-lc", "gh auth login --hostname github.com --git-protocol https --web"], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  const collect = chunk => { output += chunk.toString() };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.stdin.write("\n");
  const timer = setInterval(() => { try { child.stdin.write("\n") } catch { /* 进程已结束 */ } }, 5000);
  await new Promise(resolve => setTimeout(resolve, 8000));
  clearInterval(timer);
  child.on("close", () => { try { child.stdin.end() } catch { /* 已结束 */ } });
  steps.push("已启动 GitHub 设备码登录；在浏览器打开 https://github.com/login/device 输入下面的代码");
  return { authorized: false, steps, output: output.trim() || "gh auth login 已启动，但没有捕获到输出；请稍后在容器里执行 gh auth status 查看" };
}


/** 查询容器里的 GitHub CLI 登录状态（插件页轮询用）。 */
export async function githubStatus({ container }) {
  if (!CONTAINER_NAME.test(String(container || ""))) throw new Error("容器名不合法");
  const inspect = await docker(["inspect", "--format", "{{.State.Running}}", container]);
  if (String(inspect.stdout).trim() !== "true") throw new Error(`容器 ${container} 没有运行`);
  try {
    const status = await docker(["exec", container, "sh", "-lc", "gh auth status"], { timeout: 30000 });
    return { authorized: true, output: status.stdout.trim() || "GitHub CLI 已登录" };
  } catch (error) {
    return { authorized: false, output: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * 还原 Vika 接线：把「一键配置 Vika」和「安装/登录 GitHub CLI」造成的改动全部清掉。
 *
 * 包含：命令解析器补丁、插件工具/桥配置/角色、config.json 角色、gh 登录态与 git 身份；
 * 插件自己安装的 gh 程序也会卸载。Vika 自己的飞书/OV/模型配置保持不动。
 */
export async function resetVikaContainer({ container, workspace, log = () => {} }) {
  if (!CONTAINER_NAME.test(String(container || ""))) throw new Error("容器名不合法");
  const inspect = await docker(["inspect", "--format", "{{.State.Running}}", container]);
  if (String(inspect.stdout).trim() !== "true") throw new Error(`容器 ${container} 没有运行`);
  const steps = [];

  // 1) 撤销 /dshin、/dshout、/dshnew 的命令解析器补丁。
  const router = await revertRouterCommands(container);
  if (router.reverted.length > 0) steps.push(`命令解析器补丁已撤销（${router.reverted.length} 个文件）`);
  if (router.unmatched.length > 0) {
    log("warn", `vika: 命令解析器里没有找到插件补丁：${router.unmatched.join(", ")}`);
    steps.push(`警告：命令解析器里没有找到插件补丁（${router.unmatched.join(", ")}）`);
  }

  // 2) 撤销 GitHub CLI 安装/登录与 git 身份。
  const github = await readGithubMarker(container);
  await docker(["exec", container, "sh", "-lc", "pkill -f 'gh auth login' >/dev/null 2>&1 || true"]).catch(() => {});
  const gitRestored = await restoreGitIdentity(container);
  steps.push(gitRestored ? "容器 git 全局身份已按安装前备份还原" : "容器 git 全局身份里插件写入的值已清理");
  await docker(["exec", container, "sh", "-lc", [
    "rm -rf /root/.vika/tools/gh",
    "if [ -L /root/.config/gh ]; then rm -f /root/.config/gh; fi",
    "rm -f /root/.vika/.plugin-github.json /root/.vika/.plugin-git-identity-backup.json",
  ].join("; ")]);
  if (github.installedGh === true) {
    try {
      await docker(["exec", container, "sh", "-lc", "if command -v apt-get >/dev/null 2>&1; then apt-get remove -y gh; elif command -v apk >/dev/null 2>&1; then apk del github-cli; fi"], { timeout: 300000 });
      steps.push("插件安装的 GitHub CLI 已卸载");
    } catch (error) {
      log("warn", `vika: 卸载 GitHub CLI 失败: ${String(error)}`);
      steps.push(`GitHub CLI 卸载失败：${String(error)}`);
    }
  } else {
    steps.push("GitHub CLI 登录态与 git 身份已清除（gh 程序保留）");
  }

  // 3) 还原 config.json 角色。
  const backup = `/root/.vika/config.json.bak.reset-${Date.now()}`;
  await docker(["exec", container, "sh", "-c", `cp ${shellQuote("/root/.vika/config.json")} ${shellQuote(backup)}`]);
  const configText = await readContainerFile(container, "/root/.vika/config.json");
  const config = JSON.parse(configText);
  if (Array.isArray(config.agents)) {
    config.agents = config.agents.map(agent => ({ ...agent, role: "colleague" }));
    const tmp = path.join(pluginTmpDir(), `.vika-reset-config-${process.pid}-${Date.now()}.json`);
    await writeFile(tmp, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    await copyHostFile(container, tmp, "/root/.vika/config.json");
    await rm(tmp, { force: true });
  }
  steps.push(`config.json 角色已恢复为内置 colleague（备份 ${backup}）`);

  // 4) 删除插件工具、桥配置、角色文件与插件产生的 config 备份。
  await docker(["exec", container, "sh", "-lc", "rm -f /root/.dsh-bridge.json /root/.vika/roles/vika.md /root/.vika/roles/dsh-worker.md /root/.vika/tools/dsh-bridge.mjs /root/.vika/tools/gh-work.mjs /root/.vika/tools/gh-inbox.mjs; rm -f /root/.vika/config.json.bak.plugin-*; rmdir /root/.vika/tools 2>/dev/null || true"]);
  steps.push("插件注入的工具、桥配置和角色文件已删除");

  try {
    await docker(["exec", container, "/root/.vika/bin/vika", "restart"], { timeout: 240000 });
    steps.push("Vika 已重启");
  } catch (error) {
    log("warn", `vika restart 失败，改用 docker restart: ${String(error)}`);
    await docker(["restart", container], { timeout: 240000 });
    steps.push("docker restart 完成");
  }

  let hostState = "unchanged";
  if (workspace) {
    const state = path.join(workspace, ".vika");
    try {
      await rm(state, { recursive: true, force: true });
      hostState = "removed";
    } catch {
      try {
        await mkdir(state, { recursive: true });
        await writeFile(path.join(state, "RESET_ON_START"), "1\n", "utf8");
        hostState = "pending-restart";
      } catch {
        hostState = "failed";
      }
    }
  }
  return { container, steps, hostState };
}
/** 插件临时文件只放系统临时目录：不写项目目录，也不创建 AgentsDo。 */
function pluginTmpDir() {
  return path.join(os.tmpdir(), "dsh-openviking-expand");
}


/** 读取容器里 Vika 实例的显示名（config.json agents[0].displayName）。 */
export async function vikaDisplayName(container) {
  if (!CONTAINER_NAME.test(String(container || ""))) return "";
  try {
    const text = await readContainerFile(container, "/root/.vika/config.json");
    const config = JSON.parse(text);
    const name = config?.agents?.[0]?.displayName;
    return typeof name === "string" ? name : "";
  } catch {
    return "";
  }
}
