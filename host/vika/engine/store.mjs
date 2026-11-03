/**
 * vika 原生引擎的持久化存储：单 JSON 状态 + 原子写 + 进程内串行化。
 *
 * 桥接进程是唯一写者；引擎重启时从磁盘恢复。写入采用 temp + rename，
 * 避免半截文件；事件流水另存 events.jsonl，便于面板统计与审计。
 */
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export function initialState() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    settings: {
      policy: { revision: 0, value: { sources: {}, repos: { allow: [], deny: [] }, rules: [] } },
      eval: { revision: 0, value: { mode: "observe", model: "", timeoutSeconds: 120 } },
      executor: { revision: 0, value: { maxWorkers: 3, paused: false, speculative: false } },
      channels: { revision: 0, value: { feishu: true, github: true, bridge: true, subscribe: true } },
      prompts: { revision: 0, value: { workerHeader: "" } },
    },
    repos: [],
    triggers: [],
    threads: {},
    tickets: [],
    assignments: [],
    workers: {},
    decisions: [],
    // 面板“保存历史”：每次设置写入记一条，不保存敏感内容，只留时间/块/revision。
    settingsHistory: [],
  };
}

export class JsonStore {
  constructor(file) {
    this.file = file;
    this.eventsFile = join(dirname(file), "events.jsonl");
    this.state = null;
    this.queue = Promise.resolve();
  }

  async load() {
    try {
      const text = await readFile(this.file, "utf8");
      const parsed = JSON.parse(text);
      const base = initialState();
      const merged = {};
      for (const key of Object.keys(base.settings)) {
        const saved = (parsed.settings || {})[key] || {};
        merged[key] = { ...base.settings[key], ...saved, value: { ...base.settings[key].value, ...(saved.value || {}) } };
      }
      this.state = { ...base, ...parsed, settings: merged };
    } catch {
      this.state = initialState();
    }
    return this.state;
  }

  /** 串行执行一次修改，修改结束后落盘。 */
  mutate(mutator) {
    const run = this.queue.then(async () => {
      const result = await mutator(this.state);
      await this.persist();
      return result;
    });
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  async persist() {
    const dir = dirname(this.file);
    await mkdir(dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.state, null, 1), "utf8");
    await rename(tmp, this.file);
  }

  /** 追加一条审计事件（失败不影响主流程）。 */
  async event(entry) {
    try {
      await mkdir(dirname(this.eventsFile), { recursive: true });
      await writeFile(this.eventsFile, `${JSON.stringify(entry)}\n`, { flag: "a", encoding: "utf8" });
    } catch {
      /* 审计失败不影响业务 */
    }
  }
}
