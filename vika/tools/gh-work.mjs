#!/usr/bin/env node
/**
 * gh-work：Vika 容器内的 GitHub 仓库准备与发布工具（身份来自容器里的 gh/git 配置，可用环境变量覆盖）。
 *
 * 设计要点：
 * - 代码由 DSH worker 在宿主上改，本工具只在同一份共享目录（/workspace/repos/...）里做
 *   clone / branch / commit / push / PR / 评论，所以 GitHub 凭据始终只在容器里；
 * - 没有写权限的公开仓自动 fork 到配置的 GitHub 身份名下再从 fork 提 PR；
 * - 拒绝推 main/master、拒绝 force push。
 *
 * 命令：
 *   prepare --repo owner/name --slug s [--fork|--no-fork] [--url <issue/PR URL>]
 *   publish --repo owner/name --slug s --title T --body-file F [--pr] [--issue <N|URL>] [--comment <URL>]
 *   comment --url <issue/PR URL> --body-file F
 *   context --url <issue/PR URL> [--out F]
 *   repo-status --repo owner/name
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const VERSION = "0.2.0";
function loadToolsConfig() {
  const candidates = [process.env.VIKA_TOOLS_CONFIG, "/root/.vika-tools.json", "/root/.dsh-bridge.json"].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (parsed !== null && typeof parsed === "object") return parsed;
    } catch { /* 没配置就继续 */ }
  }
  return {};
}
const TOOLS_CONFIG = loadToolsConfig();
const GITHUB = TOOLS_CONFIG.github !== null && typeof TOOLS_CONFIG.github === "object" ? TOOLS_CONFIG.github : {};
const REPOS_ROOT = process.env.VIKA_REPOS_ROOT || "/workspace/repos";
const TASKS_ROOT = process.env.VIKA_TASKS_ROOT || "/workspace/tasks";
const HOST_REPOS_ROOT = process.env.VIKA_HOST_REPOS_ROOT || TOOLS_CONFIG.hostReposRoot || "/workspace/repos";
const HOST_TASKS_ROOT = process.env.VIKA_HOST_TASKS_ROOT || TOOLS_CONFIG.hostTasksRoot || "/workspace/tasks";
const IDENTITY = {
  login: process.env.VIKA_GH_LOGIN || GITHUB.login || "",
  name: process.env.VIKA_GH_NAME || GITHUB.name || "",
  email: process.env.VIKA_GH_EMAIL || GITHUB.email || "",
};
const BRANCH_PREFIX = process.env.VIKA_GH_BRANCH_PREFIX || GITHUB.branchPrefix || "vika";
function gitConfig(key) {
  try { return execFileSync("git", ["config", "--global", key], { encoding: "utf8" }).trim() } catch { return "" }
}
function resolveIdentity() {
  IDENTITY.login = IDENTITY.login || gitConfig("user.login");
  IDENTITY.name = IDENTITY.name || gitConfig("user.name");
  IDENTITY.email = IDENTITY.email || gitConfig("user.email");
}
function requireIdentity() {
  resolveIdentity();
  if (IDENTITY.login === "" || IDENTITY.name === "" || IDENTITY.email === "") {
    throw new GhError("identity_missing", "GitHub 身份未配置：先在插件设置页点“安装/登录 GitHub CLI”，或设置 VIKA_GH_LOGIN / VIKA_GH_NAME / VIKA_GH_EMAIL");
  }
}
const REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,47}$/;
const PROTECTED = new Set(["main", "master", "develop", "release"]);

const HELP = `gh-work ${VERSION}

用法：
  gh-work prepare --repo <owner/name> --slug <slug> [--fork|--no-fork] [--url <issue/PR URL>]
  gh-work publish --repo <owner/name> --slug <slug> --title <标题> --body-file <文件>
                  [--pr] [--issue <编号或 URL>] [--comment <URL>] [--commit-message <消息>]
  gh-work comment --url <issue/PR URL> --body-file <文件>
  gh-work context --url <issue/PR URL> [--out <文件>]
  gh-work repo-status --repo <owner/name>

约定：
  - 仓库目录：${REPOS_ROOT}/<owner>__<name>/<slug>
  - 宿主路径：${HOST_REPOS_ROOT}/<owner>__<name>/<slug>（传给 dsh-bridge 的 --repo/--slug 会自动推导）
  - 分支：${BRANCH_PREFIX}/<slug>；不推 main/master，不 force push
  - 身份：${IDENTITY.login}`;

class GhError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function parse(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--fork") options.fork = true;
    else if (arg === "--no-fork") options.noFork = true;
    else if (arg === "--pr") options.pr = true;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) throw new GhError("usage", `${arg} 缺参数`);
      options[key] = value;
      index++;
    } else options._.push(arg);
  }
  return options;
}

function run(command, args, { cwd, allowFailure = false, timeout = 180_000, input } = {}) {
  try {
    const stdout = execFileSync(command, args, { cwd, encoding: "utf8", timeout, input, windowsHide: true, maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
    return { ok: true, stdout: stdout ?? "" };
  } catch (error) {
    const result = { ok: false, status: error.status, stdout: String(error.stdout ?? ""), stderr: String(error.stderr ?? error.message) };
    if (!allowFailure) {
      const detail = (result.stderr || result.stdout).trim().split("\n").slice(-6).join("\n");
      throw new GhError(`command_failed`, `${command} ${args.join(" ")} 失败：${detail}`);
    }
    return result;
  }
}

function gh(args, options = {}) {
  const result = run("gh", args, options);
  return result.stdout;
}

function ghJson(args, options = {}) {
  const raw = gh(args, options).trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new GhError("bad_response", `gh 返回了非 JSON 内容: ${raw.slice(0, 200)}`);
  }
}

function assertRepo(repo) {
  if (!REPO_RE.test(String(repo))) throw new GhError("bad_request", `repo 必须是 owner/name: ${repo}`);
  return repo;
}

function assertSlug(slug) {
  if (!SLUG_RE.test(String(slug))) throw new GhError("bad_request", `slug 必须是 1-48 位小写字母数字或 ._-: ${slug}`);
  return slug;
}

function repoInfo(repo) {
  const info = ghJson(["repo", "view", repo, "--json", "nameWithOwner,viewerPermission,defaultBranchRef,isPrivate,parent"], { timeout: 60_000 });
  return {
    repo,
    permission: info.viewerPermission,
    defaultBranch: info.defaultBranchRef?.name || "main",
    isPrivate: Boolean(info.isPrivate),
    parent: info.parent?.nameWithOwner,
  };
}

function forkName(repo) {
  const [, name] = repo.split("/");
  return `${IDENTITY.login}/${name}`;
}

function forkExists(repo) {
  const result = run("gh", ["repo", "view", forkName(repo), "--json", "nameWithOwner"], { allowFailure: true, timeout: 60_000 });
  return result.ok;
}

/** 确认 fork 存在（必要时创建），并返回 fork 全名。 */
function ensureFork(repo) {
  if (forkExists(repo)) return forkName(repo);
  const result = run("gh", ["repo", "fork", repo, "--clone=false"], { allowFailure: true, timeout: 120_000 });
  if (result.ok) return forkName(repo);
  if (/already exists/i.test(result.stderr || result.stdout)) return forkName(repo);
  throw new GhError("fork_failed", `创建 fork 失败：${(result.stderr || result.stdout).trim().slice(0, 400)}`);
}

function repoDir(repo, slug) {
  const [owner, name] = repo.split("/");
  return path.join(REPOS_ROOT, `${owner}__${name}`, slug);
}

function hostDir(repo, slug) {
  const [owner, name] = repo.split("/");
  return toWindowsPath(path.join(HOST_REPOS_ROOT, `${owner}__${name}`, slug));
}

/** Linux 容器里拼 Windows 宿主路径：把分隔符统一成反斜杠。 */
function toWindowsPath(value) {
  return String(value).replace(/\//g, "\\");
}

function configureGit(dir) {
  run("git", ["-C", dir, "config", "user.name", IDENTITY.name], { allowFailure: true });
  run("git", ["-C", dir, "config", "user.email", IDENTITY.email], { allowFailure: true });
  run("git", ["-C", dir, "config", "core.autocrlf", "false"], { allowFailure: true });
  run("git", ["-C", dir, "config", "core.fileMode", "false"], { allowFailure: true });
}

function remotes(dir) {
  const result = run("git", ["-C", dir, "remote"], { allowFailure: true });
  return new Set(result.stdout.split("\n").map(line => line.trim()).filter(Boolean));
}

function currentBranch(dir) {
  return run("git", ["-C", dir, "branch", "--show-current"]).stdout.trim();
}

function prepare(options) {
  const repo = assertRepo(options.repo);
  const slug = assertSlug(options.slug);
  requireIdentity();
  const info = repoInfo(repo);
  const needsFork = options.fork || (info.permission === "READ" && !options.noFork);
  const dir = repoDir(repo, slug);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.mkdirSync(TASKS_ROOT, { recursive: true });
  let cloned = false;
  if (!fs.existsSync(path.join(dir, ".git"))) {
    run("gh", ["repo", "clone", repo, dir, "--", "--no-single-branch"], { timeout: 300_000 });
    cloned = true;
  } else {
    run("git", ["-C", dir, "fetch", "--all", "--prune"], { timeout: 300_000 });
  }
  if (needsFork) {
    const fork = ensureFork(repo);
    if (!remotes(dir).has("fork")) run("git", ["-C", dir, "remote", "add", "fork", `https://github.com/${fork}.git`]);
  }
  configureGit(dir);
  const branch = `${BRANCH_PREFIX}/${slug}`;
  const hasBranch = run("git", ["-C", dir, "rev-parse", "--verify", branch], { allowFailure: true }).ok;
  if (hasBranch) run("git", ["-C", dir, "checkout", branch]);
  else run("git", ["-C", dir, "checkout", "-b", branch, `origin/${info.defaultBranch}`]);
  const context = options.url ? fetchContext(options.url, dir) : undefined;
  let contextPath;
  let hostContextPath;
  if (context) {
    const taskDir = path.join(TASKS_ROOT, slug);
    fs.mkdirSync(taskDir, { recursive: true });
    contextPath = path.join(taskDir, "context.md");
    fs.writeFileSync(contextPath, context.markdown, "utf8");
    hostContextPath = toWindowsPath(path.join(HOST_TASKS_ROOT, slug, "context.md"));
  }
  return {
    repo,
    slug,
    branch,
    base: info.defaultBranch,
    permission: info.permission,
    fork: needsFork ? forkName(repo) : undefined,
    clone: cloned ? "cloned" : "reused",
    dir,
    hostDir: hostDir(repo, slug),
    contextPath,
    hostContextPath,
    title: context?.title,
  };
}

function fetchContext(url) {
  const parsed = parseGitHubUrl(url);
  if (!parsed) throw new GhError("bad_request", `无法识别的 GitHub 链接: ${url}`);
  const { repo, number, kind } = parsed;
  const issue = ghJson(["api", `repos/${repo}/issues/${number}`], { timeout: 60_000 });
  const comments = ghJson(["api", `repos/${repo}/issues/${number}/comments?per_page=20`], { timeout: 60_000 }) || [];
  const lines = [
    `# ${kind === "pull" ? "PR" : "Issue"} ${repo}#${number}：${issue.title}`,
    "",
    `- 状态：${issue.state}`,
    `- 作者：@${issue.user?.login ?? "unknown"}`,
    `- 链接：${issue.html_url}`,
    `- 标签：${(issue.labels || []).map(label => label.name).join(", ") || "无"}`,
    "",
    "## 正文",
    "",
    truncate(issue.body, 20000),
  ];
  if (kind === "pull") {
    const pull = ghJson(["api", `repos/${repo}/pulls/${number}`], { timeout: 60_000 });
    lines.push("", "## PR 信息", "", `- 源分支：${pull?.head?.label ?? "?"}`, `- 目标分支：${pull?.base?.label ?? "?"}`);
  }
  if (comments.length) {
    lines.push("", `## 最近 ${comments.length} 条评论`, "");
    for (const comment of comments.slice(-20)) {
      lines.push(`### @${comment.user?.login ?? "?"}（${comment.created_at}）`, "", truncate(comment.body, 4000), "");
    }
  }
  return { title: issue.title, markdown: `${lines.join("\n").trimEnd()}\n` };
}

function truncate(value, limit) {
  const text = String(value ?? "");
  return text.length <= limit ? text : `${text.slice(0, limit)}

…（已截断，原文 ${text.length} 字符）`;
}

function parseGitHubUrl(url) {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)\/?/.exec(String(url));
  if (!match) return undefined;
  return { repo: `${match[1]}/${match[2]}`, kind: match[3] === "pull" ? "pull" : "issue", number: Number(match[4]) };
}

function publish(options) {
  const repo = assertRepo(options.repo);
  const slug = assertSlug(options.slug);
  const dir = repoDir(repo, slug);
  if (!fs.existsSync(path.join(dir, ".git"))) throw new GhError("not_prepared", `仓库目录还没准备好：${dir}（先跑 prepare）`);
  const branch = currentBranch(dir);
  if (!branch) throw new GhError("no_branch", "仓库处于 detached HEAD，无法发布");
  if (PROTECTED.has(branch)) throw new GhError("protected_branch", `拒绝在受保护分支 ${branch} 上提交`);
  requireIdentity();
  configureGit(dir);
  const status = run("git", ["-C", dir, "status", "--porcelain"]).stdout.trim();
  let committed = false;
  let commit;
  if (status) {
    run("git", ["-C", dir, "add", "-A"]);
    const message = String(options.commitMessage || options.title || `vika: ${slug}`).trim();
    run("git", ["-C", dir, "-c", `user.name=${IDENTITY.name}`, "-c", `user.email=${IDENTITY.email}`, "commit", "-m", message.slice(0, 2000)], { timeout: 120_000 });
    commit = run("git", ["-C", dir, "rev-parse", "--short", "HEAD"]).stdout.trim();
    committed = true;
  }
  const hasFork = remotes(dir).has("fork");
  const pushRemote = hasFork ? "fork" : "origin";
  run("git", ["-C", dir, "push", "-u", pushRemote, `HEAD:refs/heads/${branch}`], { timeout: 300_000 });
  const info = repoInfo(repo);
  const headOwner = hasFork ? IDENTITY.login : repo.split("/")[0];
  const result = {
    repo,
    branch,
    committed,
    commit,
    pushed: true,
    pushRemote,
    head: `${headOwner}:${branch}`,
  };
  if (options.pr) {
    const bodyFile = options.bodyFile;
    if (!bodyFile || !fs.existsSync(bodyFile)) throw new GhError("bad_request", "发布 PR 需要 --body-file 指向一个存在的文件");
    let body = fs.readFileSync(bodyFile, "utf8");
    const issueNumber = issueNumberOf(options.issue);
    if (issueNumber && !/fixes\s+#\d+/i.test(body)) body = `${body.trimEnd()}\n\nFixes #${issueNumber}\n`;
    const tmp = path.join(TASKS_ROOT, slug, "pr-body.md");
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, body, "utf8");
    const prUrl = gh(["pr", "create", "--repo", repo, "--head", `${headOwner}:${branch}`, "--base", info.defaultBranch, "--title", String(options.title || branch), "--body-file", tmp], { timeout: 120_000 }).trim();
    result.prUrl = prUrl;
    result.prBodyFile = tmp;
  }
  if (options.comment) {
    const bodyFile = options.bodyFile;
    if (!bodyFile || !fs.existsSync(bodyFile)) throw new GhError("bad_request", "评论需要 --body-file");
    result.commentUrl = gh(["issue", "comment", options.comment, "--body-file", bodyFile], { timeout: 60_000 }).trim();
  }
  return result;
}

function issueNumberOf(value) {
  if (!value) return undefined;
  const match = /(\d+)\/?$/.exec(String(value));
  return match ? match[1] : undefined;
}

function comment(options) {
  if (!options.url) throw new GhError("usage", "comment 需要 --url");
  if (!options.bodyFile || !fs.existsSync(options.bodyFile)) throw new GhError("bad_request", "comment 需要 --body-file");
  const url = gh(["issue", "comment", options.url, "--body-file", options.bodyFile], { timeout: 60_000 }).trim();
  return { url, commentedAt: options.url };
}

function print(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function main() {
  const options = parse(process.argv.slice(2));
  if (options.help || options._.length === 0) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  const command = options._[0];
  if (command === "prepare") print({ ok: true, ...prepare(options) });
  else if (command === "publish") print({ ok: true, ...publish(options) });
  else if (command === "comment") print({ ok: true, ...comment(options) });
  else if (command === "context") {
    const context = fetchContext(options.url);
    if (options.out) {
      fs.writeFileSync(options.out, context.markdown, "utf8");
      print({ ok: true, title: context.title, out: options.out, chars: context.markdown.length });
    } else print({ ok: true, title: context.title, markdown: context.markdown });
  } else if (command === "repo-status") {
    const info = repoInfo(assertRepo(options.repo));
    print({ ok: true, ...info, fork: forkExists(options.repo) ? forkName(options.repo) : undefined });
  } else throw new GhError("usage", `未知命令: ${command}`);
}

try {
  main();
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: { code: error?.code || "internal", message: error?.message || String(error) } }, null, 2)}\n`);
  process.exitCode = error?.code === "usage" ? 2 : 1;
}
