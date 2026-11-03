/**
 * vika 会话注册表：把 Vika 派发的 DSH 会话记在磁盘上，供重启后继续追问。
 *
 * 数据量很小（默认最多 maxSessions 条），用同步 JSON 落盘即可；
 * 写入走“临时文件 + rename”，避免半截文件。浏览器半侧永远读不到这里。
 */
import fs from "node:fs";
import path from "node:path";

export class VikaRegistry {
  /**
   * @param file 账本文件绝对路径。
   * @param options `{ log }`，log 用于告警。
   */
  constructor(file, { log = () => {} } = {}) {
    this.file = file;
    this.log = log;
    /** @type {{version: number, sessions: Record<string, any>}} */
    this.data = { version: 1, sessions: {} };
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.sessions && typeof parsed.sessions === "object") {
        this.data = { version: 1, sessions: parsed.sessions };
      }
    } catch (error) {
      if (error && error.code !== "ENOENT") this.log("warn", `vika registry: 读取失败，按空账本启动: ${String(error)}`);
      this.data = { version: 1, sessions: {} };
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
      fs.renameSync(tmp, this.file);
    } catch (error) {
      this.log("warn", `vika registry: 写入失败: ${String(error)}`);
    }
  }

  /** 全部会话，新的在前。 */
  list() {
    return Object.values(this.data.sessions).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  get(sessionId) {
    return this.data.sessions[sessionId];
  }

  /** 新建或整体替换一条记录。 */
  upsert(session) {
    this.data.sessions[session.sessionId] = session;
    this.save();
    return session;
  }

  /** 局部更新；返回更新后的记录，不存在时 undefined。 */
  update(sessionId, patch) {
    const current = this.data.sessions[sessionId];
    if (!current) return undefined;
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.data.sessions[sessionId] = next;
    this.save();
    return next;
  }

  remove(sessionId) {
    if (!this.data.sessions[sessionId]) return false;
    delete this.data.sessions[sessionId];
    this.save();
    return true;
  }

  /** 按 requestId 找会话，用于 create 幂等。 */
  findByRequestId(requestId) {
    if (!requestId) return undefined;
    return this.list().find(session => Array.isArray(session.requestIds) && session.requestIds.includes(requestId));
  }

  /** 按话题键找会话（一个会话可挂多个话题）。 */
  findByThread(thread) {
    if (!thread) return [];
    return this.list().filter(session => Array.isArray(session.threads) && session.threads.includes(thread));
  }

  /** 记一次 requestId；每个会话最多保留 200 个，避免账本无限增长。 */
  rememberRequest(sessionId, requestId) {
    if (!requestId) return;
    const session = this.data.sessions[sessionId];
    if (!session) return;
    const ids = Array.isArray(session.requestIds) ? session.requestIds : [];
    if (ids.includes(requestId)) return;
    ids.push(requestId);
    if (ids.length > 200) ids.splice(0, ids.length - 200);
    this.update(sessionId, { requestIds: ids });
  }
}
