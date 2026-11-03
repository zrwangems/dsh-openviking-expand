/**
 * vika 面板的浏览器数据层（片段）。
 *
 * 只请求宿主同源 /openviking-vika/*；不直连 3742 桥。
 * 面板按页取数，每页自己轮询；错误统一转成可读中文。
 */

var VK_PREFIX = '/openviking-vika'
var VK_POLL_MS = 5000

function vkErrorText(error) {
  return String((error && error.message) || error || '未知错误')
}

function vkRequest(path, options) {
  options = options || {}
  var init = {
    method: options.method || 'GET',
    headers: { accept: 'application/json' },
  }
  if (options.body !== undefined) {
    init.headers['content-type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }
  return fetch(VK_PREFIX + path, init).then(function (response) {
    return response.text().then(function (text) {
      var payload = null
      if (text !== '') {
        try { payload = JSON.parse(text) } catch (error) { payload = null }
      }
      if (!response.ok || payload === null || payload.ok !== true) {
        var detail = payload !== null && payload.error !== undefined && payload.error !== null ? payload.error : null
        var failure = new Error(detail !== null && detail.message ? String(detail.message) : ('HTTP ' + response.status))
        failure.status = response.status
        failure.code = detail !== null && detail.code ? String(detail.code) : ('http-' + response.status)
        throw failure
      }
      return payload.result
    })
  })
}

/** 按页轮询；deps 变化时重新开始。 */
function vkUsePoll(loader, deps, intervalMs) {
  var pair = React.useState({ loading: true, error: null, value: null })
  var state = pair[0]
  var setState = pair[1]
  var seq = React.useRef(0)
  var list = deps || []
  var run = React.useCallback(function () {
    var mine = ++seq.current
    return Promise.resolve().then(loader).then(function (value) {
      if (mine === seq.current) setState({ loading: false, error: null, value: value })
      return value
    }, function (error) {
      if (mine === seq.current) setState({ loading: false, error: vkErrorText(error), value: null })
      return null
    })
  }, list)
  React.useEffect(function () {
    run()
    var timer = setInterval(run, intervalMs || VK_POLL_MS)
    return function () { clearInterval(timer) }
  }, [run, intervalMs])
  return { state: state, run: run }
}

/** 只加载一次（搜索/术语等）。 */
function vkUseAsync(loader, deps) {
  var pair = React.useState({ loading: true, error: null, value: null })
  var state = pair[0]
  var setState = pair[1]
  var seq = React.useRef(0)
  var list = deps || []
  var run = React.useCallback(function () {
    var mine = ++seq.current
    setState(function (previous) { return { loading: true, error: null, value: previous.value } })
    return Promise.resolve().then(loader).then(function (value) {
      if (mine === seq.current) setState({ loading: false, error: null, value: value })
      return value
    }, function (error) {
      if (mine === seq.current) setState({ loading: false, error: vkErrorText(error), value: null })
      return null
    })
  }, list)
  React.useEffect(function () { run() }, [run])
  return { state: state, run: run }
}

/** 打开一个 DSH 会话：先确认会话列表里存在，再切到对应工作区。 */
function vkOpenSession(ctx, sessionId) {
  var sessions = ctx !== undefined && ctx !== null && typeof ctx.get === 'function' ? ctx.get('sessions') : null
  var workspace = ctx !== undefined && ctx !== null && typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : null
  if (sessions === null || sessions === undefined) return Promise.reject(new Error('当前 DSH 没有会话服务'))
  if (workspace === null || workspace === undefined || typeof workspace.openSession !== 'function') {
    return Promise.reject(new Error('当前 DSH 不支持跳转会话'))
  }
  var list = sessions.list !== undefined && sessions.list !== null && typeof sessions.list.getSnapshot === 'function'
    ? sessions.list.getSnapshot()
    : null
  if (list !== null && list.phase !== 'ready' && typeof sessions.refresh === 'function') {
    return Promise.resolve(sessions.refresh()).then(function () { return vkOpenSession(ctx, sessionId) })
  }
  if (list !== null && list.byId !== undefined && list.byId !== null && list.byId[sessionId] === undefined) {
    return Promise.reject(new Error('这个 Session 不在当前会话列表里，可能已被归档或删除'))
  }
  return Promise.resolve(workspace.openSession(sessionId))
}

var VK_REASON_TEXT = {
  explicitRequest: '明确请求',
  notExplicit: '非明确请求',
  sourceIgnore: '来源已关闭',
  sourceManual: '来源手动',
  actorNotAllowed: '发送者不在名单',
  actorAllowed: '发送者在名单',
  repoDenied: '仓库被拒绝',
  repoNotAllowed: '仓库不在白名单',
  ruleIgnore: '命中忽略规则',
  ruleRequireExplicit: '规则要求明确请求',
  ruleCandidate: '命中规则',
  routeFailed: '直通失败',
  evalAuto: '自动接单',
  speculative: '投机执行',
  retried: '重试工单',
  stoppedByPerson: '人工停止',
  stopped: '已停止',
  stale: '超时无心跳',
  subscriptionDirect: '订阅直通',
}

function vkReasonText(reason) {
  var list = Array.isArray(reason) ? reason : reason !== undefined && reason !== null ? [reason] : []
  var texts = []
  for (var index = 0; index < list.length; index += 1) {
    var item = list[index]
    if (item === null || item === undefined) continue
    var code = typeof item === 'string' ? item : item.code
    var text = VK_REASON_TEXT[code] || code || ''
    if (item !== null && typeof item === 'object' && item.name !== undefined && item.name !== '') text = item.name
    if (item !== null && typeof item === 'object' && item.rule !== undefined && item.rule !== '' && text === code) text = String(item.rule)
    if (text !== '' && texts.indexOf(text) < 0) texts.push(text)
  }
  return texts.join('、')
}

var VK_STAGE_TEXT = {
  open: '进行中',
  person: '待处理',
  working: '执行中',
  idle: '等待新触发',
  ended: '已结束',
}

function vkStageText(stage) {
  return VK_STAGE_TEXT[stage] || stage || '未知'
}

function vkStageTone(stage) {
  if (stage === 'person') return 'error'
  if (stage === 'working') return 'ongoing'
  if (stage === 'open') return 'info'
  if (stage === 'ended') return 'done'
  return 'idle'
}

function vkDecisionText(kind) {
  if (kind === 'accept') return '接单'
  if (kind === 'reopen') return '续做'
  if (kind === 'routed') return '直通'
  if (kind === 'stop') return '停止'
  if (kind === 'ignore') return '忽略'
  if (kind === 'unavailable') return '未完成'
  return kind || '未知'
}

function vkSourceText(source) {
  if (source === 'feishu') return '飞书'
  if (source === 'github') return 'GitHub'
  if (source === 'manual') return '手动'
  if (source === 'api') return 'API'
  return source || '未知'
}

function vkFullTime(at) {
  var date = new Date(at)
  if (Number.isNaN(date.getTime())) return String(at || '—')
  var pad = function (value) { return value < 10 ? '0' + value : String(value) }
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function vkWhen(at) {
  var time = Date.parse(at)
  if (!Number.isFinite(time)) return '—'
  var diff = Date.now() - time
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 3600 * 1000) return Math.floor(diff / 60000) + ' 分钟前'
  if (diff < 24 * 3600 * 1000) return Math.floor(diff / 3600000) + ' 小时前'
  if (diff < 7 * 24 * 3600 * 1000) return Math.floor(diff / 86400000) + ' 天前'
  return vkFullTime(at)
}

function vkClip(text, limit) {
  var value = String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim()
  var max = limit || 160
  return value.length > max ? value.slice(0, max) + '…' : value
}

function vkFirstLine(text, limit) {
  var value = String(text === undefined || text === null ? '' : text).replace(/\r\n?/g, '\n')
  var lines = value.split('\n')
  for (var index = 0; index < lines.length; index += 1) {
    var line = lines[index].trim()
    if (line !== '') return vkClip(line, limit || 160)
  }
  return ''
}
