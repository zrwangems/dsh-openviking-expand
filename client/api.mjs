/**
 * 浏览器半侧与宿主通信的薄封装（片段）。
 *
 * 只请求本插件自己的前缀 /openviking-expand/*，不直连 OpenViking。
 * 读哪个 OpenViking：跟着控制台（嵌入的 Studio）里当前选中的那条连接走 ——
 * Studio 把连接存在同源的 localStorage 里，这里读出来带进请求：
 *   ?server=<baseUrl>      目标服务
 *   x-ov-key / x-ov-account / x-ov-user   该连接自己的凭据
 * Host 侧再按这条连接去请求 OpenViking；插件自己不保存任何连接设置。
 */
var OVX_PREFIX = '/openviking-expand'

/** Studio 保存连接的 localStorage 键（web-studio 的 connection profiles）。 */
var OVX_CONNECTION_STORAGE_KEY = 'ov_console_connection_profiles'

/** 读出 Studio 当前选中的连接；没有就返回 null（Host 会退回配置的 endpoint）。 */
function ovxConsoleConnection() {
  try {
    if (typeof localStorage === 'undefined') return null
    var raw = localStorage.getItem(OVX_CONNECTION_STORAGE_KEY)
    if (raw === null || raw === '') return null
    var parsed = JSON.parse(raw)
    var profiles = parsed !== null && Array.isArray(parsed.profiles) ? parsed.profiles : []
    if (profiles.length === 0) return null
    var active = null
    for (var index = 0; index < profiles.length; index += 1) {
      if (profiles[index] !== null && profiles[index].id === parsed.activeId) {
        active = profiles[index]
        break
      }
    }
    if (active === null) active = profiles[0]
    var connection = active !== null && active.connection !== undefined ? active.connection : null
    if (connection === null || typeof connection.baseUrl !== 'string' || connection.baseUrl === '') return null
    return {
      baseUrl: connection.baseUrl,
      apiKey: typeof connection.apiKey === 'string' ? connection.apiKey : '',
      accountId: typeof connection.accountId === 'string' ? connection.accountId : '',
      userId: typeof connection.userId === 'string' ? connection.userId : '',
    }
  } catch (error) {
    return null
  }
}

/** GET 一个宿主接口，返回 payload.result；失败抛带 code/status 的 Error。 */
function ovxRequest(path, params) {
  var search = ''
  var merged = {}
  if (params !== undefined && params !== null) {
    for (var key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) merged[key] = params[key]
    }
  }
  var connection = ovxConsoleConnection()
  var headers = { accept: 'application/json' }
  if (connection !== null) {
    merged.server = connection.baseUrl
    if (connection.apiKey !== '') headers['x-ov-key'] = connection.apiKey
    if (connection.accountId !== '') headers['x-ov-account'] = connection.accountId
    if (connection.userId !== '') headers['x-ov-user'] = connection.userId
  }
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

/** 未保存插件设置时挡住控制台/侧边栏内容；保存后自动放行（2 秒轮询）。 */
function OvxConfigGate(props) {
  var pair = ovxUseAsync(function () { return ovxRequest('/settings', null) }, [])
  var state = pair[0]
  var run = pair[2]
  var configured = state.value !== null && state.value !== undefined && state.value.configured === true
  React.useEffect(function () {
    var onSaved = function () { run() }
    try { window.addEventListener('ovx-config-saved', onSaved) } catch (error) { /* SSR 或测试环境 */ }
    var handle = configured ? null : setInterval(run, 2000)
    return function () {
      try { window.removeEventListener('ovx-config-saved', onSaved) } catch (error) { /* 忽略 */ }
      if (handle !== null) clearInterval(handle)
    }
  }, [configured, run])
  if (configured) return props.children
  return h('div', { style: { padding: '24px' } },
    h('div', { style: { fontSize: '15px', fontWeight: 600, marginBottom: '8px' } }, 'OpenViking 尚未配置'),
    h('div', { style: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary, #888)', lineHeight: '22px' } },
      '请先到插件页配置 OpenViking 连接：左侧「插件」→「OpenViking 扩展」→「OpenViking 连接」，填写服务类型、地址和 API 密钥后保存。保存后会自动启用。'))
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
