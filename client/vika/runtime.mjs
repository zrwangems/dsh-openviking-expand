/**
 * 把 vendored vika runtime 面板接到 DSH 客户端（片段）。
 *
 * 面板本体是 vendored runtime 的 client bundle（vika/runtime/client.js），
 * 由 scripts/build-client.mjs 提取成 runtimeClientFactory。
 *
 * 注册时机不能只赌一次：DSH 启动、插件升级，或者"页面先加载、之后才在插件页
 * 打开 vika 行"的时候，宿主 /orchestrator/api/state 都会比页面晚就绪。探测失败
 * 就退避重试，直到注册成功；vika 组件关闭时该路由一直不可用，重试没有副作用。
 */

var VK_RUNTIME_API = '/orchestrator/api'
var VK_PANEL_RETRY_MIN_MS = 2000
var VK_PANEL_RETRY_MAX_MS = 30000

function vikaPanelRegistered() {
  return typeof window !== 'undefined' && window.__ovxVikaPanelRegistered === true
}

function vikaRuntimeProbe() {
  return fetch(VK_RUNTIME_API + '/state', {
    headers: { 'x-orchestrator-request': '1', accept: 'application/json' },
  }).then(function (response) {
    return response.ok
  }, function () {
    return false
  })
}

function vikaRuntimeRegister(ctx) {
  if (vikaPanelRegistered()) return true
  var module = runtimeClientFactory(require)
  if (module === null || module === undefined || typeof module.apply !== 'function') {
    console.warn('[openviking-expand] vika 面板客户端无法装载：vendored runtime client 缺失或没有 apply')
    return true
  }
  if (typeof window !== 'undefined') window.__ovxVikaPanelRegistered = true
  try {
    module.apply(ctx)
  } catch (error) {
    if (typeof window !== 'undefined') window.__ovxVikaPanelRegistered = false
    throw error
  }
  return true
}

function vikaRuntimeApply(ctx) {
  var stopped = false
  var timer = null
  var delay = VK_PANEL_RETRY_MIN_MS

  function stop() {
    stopped = true
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function schedule() {
    timer = setTimeout(attempt, delay)
    delay = Math.min(VK_PANEL_RETRY_MAX_MS, Math.round(delay * 1.5))
  }

  function attempt() {
    if (stopped || vikaPanelRegistered()) return
    vikaRuntimeProbe().then(function (ok) {
      if (stopped) return
      if (!ok) {
        schedule()
        return
      }
      if (vikaRuntimeRegister(ctx)) stop()
    })
  }

  attempt()
  // 插件卸载/HMR 后清掉定时器，避免多个探测循环并存。
  if (ctx !== undefined && ctx !== null && typeof ctx.effect === 'function') {
    try {
      ctx.effect(function () { return stop }, 'openvikingExpand.vikaPanel()')
    } catch (error) { /* 清理注册失败不影响面板 */ }
  }
}

var vikaRuntimePart = { apply: vikaRuntimeApply }
