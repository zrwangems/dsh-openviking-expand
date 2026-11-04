/**
 * vika/tools 下的 CLI 基础行为：参数解析、错误码、与桥的 HTTP 往返。
 * 命令与桥端点的完整契约在 test/vika-bridge-contract.test.mjs；这里只测不依赖桥语义的骨架。
 * gh-work 只测不触网的参数与拒绝路径，避免单测依赖 GitHub 凭据。
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const bridgeCli = path.join(root, "vika", "tools", "dsh-bridge.mjs");
const workCli = path.join(root, "vika", "tools", "gh-work.mjs");
const token = "cli-test-token";
const tempRoot = path.join(os.tmpdir(), `vika-tools-${process.pid}`);
let server;
let baseUrl;
let bridgeArgs;
const requests = [];

test.before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      const payload = body ? JSON.parse(body) : undefined;
      requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization, payload });
      const send = (status, value) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(value));
      };
      if (req.headers.authorization !== `Bearer ${token}`) return send(401, { ok: false, error: { code: "unauthorized", message: "bad token" } });
      if (req.url === "/v1/health") return send(200, { ok: true, service: "test" });
      return send(404, { ok: false, error: { code: "not_found", message: "no route" } });
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  bridgeArgs = ["--url", baseUrl, "--token", token];
});

test.after(() => {
  server?.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

async function run(cli, args, options = {}) {
  // 假服务器在本进程里，必须用异步 spawn，否则事件循环被阻塞、请求超时。
  return await new Promise(resolve => {
    const child = spawn(process.execPath, [cli, ...args], {
      env: { ...process.env, ...(options.env ?? {}) },
      cwd: options.cwd ?? root,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => (stdout += chunk));
    child.stderr.on("data", chunk => (stderr += chunk));
    const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
    child.on("close", status => {
      clearTimeout(timer);
      let json;
      try {
        json = stdout ? JSON.parse(stdout) : undefined;
      } catch {
        json = undefined;
      }
      resolve({ status, stdout, stderr, json });
    });
  });
}

test("dsh-bridge：help 与缺 token 的退出码", async () => {
  const help = await run(bridgeCli, []);
  assert.match(help.stdout, /dsh-bridge/);
  assert.equal(help.status, 2);
  const missing = await run(bridgeCli, ["health", "--url", baseUrl], { env: { DSH_BRIDGE_TOKEN: "", DSH_BRIDGE_CONFIG: path.join(tempRoot, "none.json") } });
  assert.equal(missing.status, 2);
  assert.equal(missing.json.error.code, "usage");
});

test("dsh-bridge：health 携带 Bearer token", async () => {
  const result = await run(bridgeCli, ["health", ...bridgeArgs]);
  assert.equal(result.status, 0);
  assert.equal(result.json.ok, true);
  assert.equal(requests.at(-1).authorization, `Bearer ${token}`);
});

test("dsh-bridge：已删除的直连会话命令被当作未知命令", async () => {
  for (const command of ["create", "send", "show", "cancel"]) {
    const result = await run(bridgeCli, [command, "--id", "x", ...bridgeArgs]);
    assert.equal(result.status, 2, `${command} 应退出码 2`);
    assert.equal(result.json.error.code, "usage");
    assert.match(result.json.error.message, /未知命令/);
  }
  const help = await run(bridgeCli, ["--help"]);
  for (const legacy of ["dsh-bridge create", "dsh-bridge send", "sa-pause", "sa-report"]) {
    assert.equal(help.stdout.includes(legacy), false, `帮助里不应再出现 ${legacy}`);
  }
});

test("dsh-bridge：sa-settings 只读，写设置必须明确拒绝", async () => {
  const result = await run(bridgeCli, ["sa-settings", "--block", "executor", "--value", "{\"maxWorkers\":2}", ...bridgeArgs]);
  assert.equal(result.status, 2);
  assert.equal(result.json.error.code, "usage");
  assert.match(result.json.error.message, /只读/);
});

test("gh-work：不触网的拒绝路径", async () => {
  const help = await run(workCli, ["--help"]);
  assert.match(help.stdout, /gh-work/);
  const badRepo = await run(workCli, ["prepare", "--repo", "not-a-repo", "--slug", "x"]);
  assert.equal(badRepo.status, 1);
  assert.equal(badRepo.json.error.code, "bad_request");
  const badSlug = await run(workCli, ["prepare", "--repo", "owner/repo", "--slug", "BAD SLUG"]);
  assert.equal(badSlug.json.error.code, "bad_request");
  const notPrepared = await run(workCli, ["publish", "--repo", "owner/repo", "--slug", "missing", "--title", "t", "--body-file", "x"], {
    env: { VIKA_REPOS_ROOT: path.join(tempRoot, "repos") },
  });
  assert.equal(notPrepared.json.error.code, "not_prepared");
});
