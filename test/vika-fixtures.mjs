/**
 * vika 组件单测用的假 DSH 上下文：只模拟组件真正用到的服务，
 * 让测试断言“组件对 DSH 做了什么”，而不是复刻 DSH 的行为。
 */
export function fakeCtx() {
  const listeners = new Map();
  const agents = new Map();
  const calls = [];
  const emit = (name, ...args) => {
    for (const fn of listeners.get(name) ?? []) fn(...args);
  };
  const ctx = {
    calls,
    agents: {
      get: id => agents.get(id),
      set: (id, agent) => agents.set(id, agent),
      delete: id => agents.delete(id),
    },
    workspaceRegistry: {
      create: async (cwd, title) => {
        calls.push({ op: "workspace.create", cwd, title });
        return { id: `ws-${calls.length}`, path: cwd, title };
      },
    },
    sessionController: {
      create: async request => {
        calls.push({ op: "session.create", request });
        return { sessionId: request.sessionId, agentPreset: request.agentPreset };
      },
      prompt: async (request, signal) => {
        calls.push({ op: "session.prompt", request, aborted: signal?.aborted === true });
        return { accepted: true };
      },
      cancel: async request => {
        calls.push({ op: "session.cancel", request });
        return { cancelled: true };
      },
      rename: async request => {
        calls.push({ op: "session.rename", request });
        return { title: request.title };
      },
    },
    logger: { info() {}, warn() {}, error() {} },
    on(name, listener) {
      const list = listeners.get(name) ?? [];
      list.push(listener);
      listeners.set(name, list);
      return () => {
        listeners.set(name, (listeners.get(name) ?? []).filter(item => item !== listener));
      };
    },
    emit,
  };
  return ctx;
}

/** 造一条 assistant/message 事件，供事件采集测试使用。 */
export function assistantEvent(text, sessionId = "ignored") {
  return {
    id: sessionId,
    type: "assistant/message",
    seq: 1,
    data: { message: { role: "assistant", content: [{ type: "text", text }] } },
  };
}
