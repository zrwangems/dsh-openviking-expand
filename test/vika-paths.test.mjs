/**
 * 容器挂载源的路径翻译：
 * Docker Desktop（WSL2 后端）把宿主 bind 源报告成 /run/desktop/mnt/host/<盘符>/...，
 * 插件必须翻译回 Windows 路径，否则会按容器路径创建 C:\run\desktop\... 假工作区。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { toHostPath } from "../host/vika/container.mjs";

test("toHostPath：Docker Desktop VM 路径翻译成 Windows 盘符路径", () => {
  assert.equal(toHostPath("/run/desktop/mnt/host/d/AgentRelated/vika", "win32"), "D:\\AgentRelated\\vika");
  assert.equal(toHostPath("/mnt/host/c/Users/x/vika", "win32"), "C:\\Users\\x\\vika");
  assert.equal(toHostPath("/host_mnt/e/work/", "win32"), "E:\\work");
});

test("toHostPath：已经是宿主路径、命名卷路径或非 Windows 平台时保持原样", () => {
  assert.equal(toHostPath("D:\\AgentRelated\\vika", "win32"), "D:\\AgentRelated\\vika");
  assert.equal(toHostPath("\\\\server\\share\\vika", "win32"), "\\\\server\\share\\vika");
  assert.equal(
    toHostPath("/var/lib/docker/volumes/vika-state/_data", "win32"),
    "/var/lib/docker/volumes/vika-state/_data",
  );
  assert.equal(toHostPath("/run/desktop/mnt/host/d/AgentRelated/vika", "linux"), "/run/desktop/mnt/host/d/AgentRelated/vika");
  assert.equal(toHostPath("", "win32"), "");
});
