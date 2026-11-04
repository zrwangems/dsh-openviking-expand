#!/usr/bin/env node
/**
 * gh-inbox：Vika 的 GitHub 通知入口（使用容器里 gh 已登录的账号；身份可在插件设置页配置）。
 *
 * 只读为主：默认列出未读通知；加 --mark-read 才把已处理的 thread 标为已读。
 * 输出紧凑 JSON，方便模型直接判断哪条需要派给 DSH。
 *
 * 用法：
 *   gh-inbox [--limit 30] [--repo owner/name] [--mark-read]
 */
const VERSION = "0.2.8";
const HELP = `gh-inbox ${VERSION}

用法：
  gh-inbox [--limit 30] [--repo owner/name] [--mark-read]

说明：
  - 读取 gh 当前登录账号的未读通知；
  - --mark-read 会把输出的这些 thread 标为已读（先派发完再标）；
  - 输出 {"ok":true,"notifications":[{id,repo,type,number,title,reason,url,updatedAt}]}`;

import { execFileSync } from "node:child_process";

const INTERESTING = new Set(["mention", "assign", "review_requested", "team_mention", "comment"]);

function parse(argv) {
  const options = { limit: 30, markRead: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--mark-read") options.markRead = true;
    else if (arg === "--limit") options.limit = Math.max(1, Math.min(50, Number(argv[++index]) || 30));
    else if (arg === "--repo") options.repo = argv[++index];
    else throw new Error(`未知参数: ${arg}`);
  }
  return options;
}

function gh(args, allowFailure = false) {
  try {
    return execFileSync("gh", args, { encoding: "utf8", timeout: 90_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    if (allowFailure) return "";
    const detail = String(error.stderr ?? error.message).trim().split("\n").slice(-4).join("\n");
    throw new Error(`gh ${args.join(" ")} 失败：${detail}`);
  }
}

/** 从通知的 subject.url / latest_comment_url 里推出 issue/PR 链接与编号。 */
function describe(notification) {
  const repo = notification.repository?.full_name ?? "";
  const subject = notification.subject ?? {};
  const url = subject.url ? String(subject.url).replace("api.github.com/repos", "github.com") : "";
  const latest = notification.subject?.latest_comment_url
    ? String(notification.subject.latest_comment_url).replace("api.github.com/repos", "github.com")
    : "";
  const match = /\/(issues|pulls)\/(\d+)$/.exec(url);
  return {
    id: notification.id,
    repo,
    type: subject.type ?? "",
    number: match ? Number(match[2]) : undefined,
    title: subject.title ?? "",
    reason: notification.reason ?? "",
    url: match ? `https://github.com/${repo}/${match[1] === "pulls" ? "pull" : "issues"}/${match[2]}` : url,
    latestCommentUrl: latest,
    updatedAt: notification.updated_at,
    unread: notification.unread !== false,
  };
}

function main() {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  const raw = gh(["api", `notifications?all=false&per_page=${options.limit}`]);
  const notifications = JSON.parse(raw || "[]")
    .filter(notification => notification.subject?.type === "Issue" || notification.subject?.type === "PullRequest")
    .map(describe)
    .filter(item => !options.repo || item.repo.toLowerCase() === String(options.repo).toLowerCase());
  const marked = [];
  if (options.markRead) {
    for (const item of notifications) {
      try {
        gh(["api", "-X", "PATCH", `notifications/threads/${item.id}`], true);
        marked.push(item.id);
      } catch {}
    }
  }
  process.stdout.write(`${JSON.stringify({ ok: true, count: notifications.length, interesting: notifications.filter(item => INTERESTING.has(item.reason)).length, notifications, markedRead: marked }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: { message: error?.message || String(error) } }, null, 2)}\n`);
  process.exitCode = 1;
}
