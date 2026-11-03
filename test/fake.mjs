/**
 * 单测用的假对象：OpenViking 客户端、HTTP 请求与响应。
 * 不模拟真实网络，只保证路由/访问层的输入输出形状可断言。
 */

/** 一个最小可用的 OvClient 替身：files 里的 URI 有内容，stat 决定条目是目录还是文件。 */
export function fakeClient({ files = {}, dirs = [], list = null, health = null } = {}) {
  const dirSet = new Set(dirs);
  return {
    endpoint: "http://ov.test",
    calls: [],
    async ls(uri, options = {}) {
      this.calls.push({ kind: "ls", uri, options });
      if (typeof list === "function") return list(uri, options);
      return { entries: [], hasMore: false };
    },
    async read(uri, options = {}) {
      this.calls.push({ kind: "read", uri, options });
      if (Object.prototype.hasOwnProperty.call(files, uri)) return files[uri];
      const error = new Error(`not found: ${uri}`);
      error.code = "not-found";
      throw error;
    },
    async request(path, params = {}) {
      this.calls.push({ kind: "request", path, params });
      if (path === "/api/v1/fs/stat") {
        const isDir = dirSet.has(params.uri);
        return { uri: params.uri, isDir, size: isDir ? 0 : 42, modTime: "2026-11-02T00:00:00.000Z" };
      }
      throw new Error(`unexpected request: ${path}`);
    },
    async healthResult() {
      return health || { ok: true, status: 200, result: { healthy: true, version: "test" }, error: null };
    },
  };
}

/** 记录 writeHead/end 的最简 ServerResponse 替身。 */
export function fakeRes() {
  return {
    statusCode: 0,
    headers: null,
    body: "",
    ended: false,
    writeHead(code, headers) {
      this.statusCode = code;
      this.headers = headers;
    },
    write(chunk) {
      if (chunk !== undefined) this.body += String(chunk);
    },
    end(chunk) {
      if (chunk !== undefined) this.body += String(chunk);
      this.ended = true;
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

/** 最小请求替身。 */
export function fakeReq(url, method = "GET", headers = {}) {
  return { url, method, headers };
}
