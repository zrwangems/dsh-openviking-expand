/**
 * 浏览器半侧与宿主通信的薄封装（片段）。
 *
 * 只请求本插件自己的前缀 /openviking-expand/*，不直连 OpenViking。
 *
 * 读哪个 OpenViking 只由 Host 决定：Host 启动时读本机 OV 配置（OPENVIKING_* 环境变量、
 * ~/.openviking/ovcli.conf、ov.conf），浏览器半侧不带任何地址和密钥。这样 Studio
 * localStorage 里遗留的旧连接（例如 127.0.0.1:1933）不会再把侧边栏带到错误地址。
 */
var OVX_PREFIX = '/openviking-expand'

/** GET 一个宿主接口，返回 payload.result；失败抛带 code/status 的 Error。 */
function ovxRequest(path, params) {
  var search = ''
  var merged = {}
  if (params !== undefined && params !== null) {
    for (var key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) merged[key] = params[key]
    }
  }
  var headers = { accept: 'application/json' }
  var parts = []
  for (var name in merged) {
    if (!Object.prototype.hasOwnProperty.call(merged, name)) continue
    var value = merged[name]
    if (value === undefined || value === null || value === '') continue
    parts.push(encodeURIComponent(name) + '=' + encodeURIComponent(String(value)))
  }
  if (parts.length > 0) search = '?' + parts.join('&')
  var init = { headers: headers }
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    init.signal = AbortSignal.timeout(30000)
  }
  return fetch(OVX_PREFIX + path + search, init).then(function (response) {
    return response.text().then(function (text) {
      var payload = null
      if (text !== '') {
        try { payload = JSON.parse(text) } catch (error) { payload = null }
      }
      if (!response.ok || payload === null || payload.ok === false) {
        var error = payload !== null && payload.error !== undefined && payload.error !== null ? payload.error : null
        var failure = new Error(error !== null && error.message ? String(error.message) : ('HTTP ' + response.status))
        failure.code = error !== null && error.code ? String(error.code) : ('http-' + response.status)
        failure.status = response.status
        throw failure
      }
      return payload.result
    })
  })
}

/** 载入一个请求并返回 [state, setState, reload]；state 里带 loading/error/value。 */
function ovxUseAsync(loader, deps) {
  var pair = React.useState({ loading: true, error: null, value: null })
  var state = pair[0]
  var setState = pair[1]
  var seq = React.useRef(0)
  var run = React.useCallback(function () {
    var mine = ++seq.current
    setState(function (previous) { return { loading: true, error: null, value: previous.value } })
    Promise.resolve().then(loader).then(function (value) {
      if (mine === seq.current) setState({ loading: false, error: null, value: value })
    }, function (error) {
      if (mine === seq.current) setState({ loading: false, error: ovxErrorText(error), value: null })
    })
  }, deps || [])
  React.useEffect(function () { run() }, [run])
  return [state, setState, run]
}

/** 保留组件边界名称，连接检查交给各页面的健康状态显示。 */
function OvxConfigGate(props) {
  return props.children
}

function ovxErrorText(error) {
  return String((error && error.message) || error || '未知错误')
}

/** 兼容 ctx.effect 缺失的极端情况：直接执行，返回清理函数。 */
function ovxEffect(ctx, factory, label) {
  if (ctx !== undefined && ctx !== null && typeof ctx.effect === 'function') return ctx.effect(factory, label)
  var cleanup = factory()
  return typeof cleanup === 'function' ? cleanup : function () {}
}

/** 包一层，避免页签组件外的 hooks 混进宿主 fiber。 */
function ovxUseTick(intervalMs) {
  var pair = React.useState(0)
  var tick = pair[1]
  React.useEffect(function () {
    if (!intervalMs) return undefined
    var handle = setInterval(function () { tick(function (value) { return value + 1 }) }, intervalMs)
    return function () { clearInterval(handle) }
  }, [intervalMs])
  return tick
}
