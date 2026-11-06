/**
 * dsh-openviking-expand —— 浏览器半侧。
 * 生成文件，不要手改：源码在 client/ 下，由 node scripts/build-client.mjs 拼装。
 */
window.__ModuleLoader__.load({
  id: 'dsh-openviking-expand',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')
    var h = React.createElement
    // ---- client/style.mjs ----
/**
 * 右侧栏 viking:// 页签与条目视图的样式（片段）。
 *
 * 只用 DSH 的 --dsw-alias-* 主题令牌，跟随宿主亮/暗切换，不引任何外部样式。
 */
var OVX_STYLE_ID = 'dsh-openviking-expand-style'

var OVX_CSS = [
  '.ovx-root{display:flex;flex-direction:column;height:100%;min-height:0;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}',
  '.ovx-head{display:flex;align-items:center;gap:6px;padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-sidebar-fill)}',
  '.ovx-head .ovx-title{flex:1;min-width:0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.ovx-head .ovx-sub{margin-left:6px;font-weight:400;font-size:11px;color:var(--dsw-alias-label-secondary)}',
  '.ovx-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:24px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1;cursor:pointer;white-space:nowrap}',
  '.ovx-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
  '.ovx-btn:disabled{opacity:.45;cursor:default}',
  '.ovx-btn[aria-pressed="true"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
  '.ovx-iconbtn{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
  '.ovx-iconbtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
  '.ovx-iconbtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
  '.ovx-toolbar{display:flex;align-items:center;gap:6px;padding:5px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
  '.ovx-rooturi{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-secondary)}',
  '.ovx-rootbtn{padding:0;border:0;background:transparent;text-align:left;cursor:text;font:inherit;font-family:ui-monospace,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-secondary)}',
  '.ovx-rootbtn:hover{color:var(--dsw-alias-brand-primary)}',
  '.ovx-rootinput{flex:1;min-width:0;height:22px;padding:0 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:ui-monospace,Consolas,monospace;font-size:11px;outline:none}',
  '.ovx-rootinput:focus{border-color:var(--dsw-alias-brand-primary)}',
  '.ovx-tree{flex:1;min-height:0;overflow:auto;padding:4px 0 16px}',
  '.ovx-row{display:flex;align-items:center;gap:4px;height:24px;padding:0 8px 0 4px;cursor:pointer;user-select:none}',
  '.ovx-row:hover{background:var(--dsw-alias-bg-layer-2)}',
  '.ovx-row[data-open="true"]{background:var(--dsw-alias-bg-layer-1)}',
  '.ovx-caret{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;flex:0 0 auto;color:var(--dsw-alias-label-secondary);transition:transform .12s ease}',
  '.ovx-caret[data-open="true"]{transform:rotate(90deg)}',
  '.ovx-caret[data-empty="true"]{visibility:hidden}',
  '.ovx-rowicon{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:0 0 auto;color:var(--dsw-alias-label-secondary)}',
  '.ovx-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.ovx-name.ovx-mono{font-family:ui-monospace,Consolas,monospace;font-size:12px}',
  '.ovx-actions{display:flex;align-items:center;gap:1px;flex:0 0 auto;opacity:0;transition:opacity .1s ease}',
  '.ovx-row:hover .ovx-actions,.ovx-row:focus-within .ovx-actions{opacity:1}',
  '.ovx-act{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:11px}',
  '.ovx-act:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-brand-primary)}',
  '.ovx-act.ovx-at{font-family:ui-monospace,Consolas,monospace;font-weight:600}',
  '.ovx-hint{display:flex;align-items:center;gap:6px;padding:4px 10px 4px 22px;font-size:11px;color:var(--dsw-alias-label-secondary)}',
  '.ovx-state{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px;text-align:center;color:var(--dsw-alias-label-secondary);overflow:auto}',
  '.ovx-state h3{margin:0;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}',
  '.ovx-state p{max-width:520px;margin:0;font-size:12px;line-height:1.6}',
  '.ovx-state code{max-width:520px;padding:3px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-layer-1);font-family:ui-monospace,Consolas,monospace;font-size:11px;word-break:break-all}',
  '.ovx-spinner{width:14px;height:14px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;animation:ovx-spin .8s linear infinite}',
  '@keyframes ovx-spin{to{transform:rotate(360deg)}}',
  '.ovx-body{flex:1;min-height:0;overflow:auto;padding:10px 12px 24px}',
  '.ovx-pills{display:flex;align-items:center;gap:6px;padding:2px 0 10px}',
  '.ovx-pill{border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:11px;line-height:20px;padding:0 10px;cursor:pointer}',
  '.ovx-pill:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
  '.ovx-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:12px 14px;margin-bottom:12px}',
  '.ovx-card-head{display:flex;align-items:baseline;gap:8px;margin-bottom:2px}',
  '.ovx-card-title{font-size:13px;font-weight:700;letter-spacing:.02em}',
  '.ovx-card-desc{font-size:11px;color:var(--dsw-alias-label-secondary)}',
  '.ovx-meta{margin-top:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);padding:8px 10px}',
  '.ovx-meta-row{display:flex;gap:12px;align-items:flex-start;padding:3px 0;font-size:12px}',
  '.ovx-meta-key{flex:0 0 92px;color:var(--dsw-alias-label-secondary)}',
  '.ovx-meta-val{flex:1;min-width:0;word-break:break-word;font-family:ui-monospace,Consolas,monospace;font-size:12px}',
  '.ovx-meta-val.ovx-plain{font-family:inherit}',
  '.ovx-yaml{margin-top:6px;border-top:1px dashed var(--dsw-alias-border-l1);padding-top:6px}',
  '.ovx-yaml>summary{cursor:pointer;font-size:11px;color:var(--dsw-alias-label-secondary);list-style:none}',
  '.ovx-yaml>summary::-webkit-details-marker{display:none}',
  '.ovx-yaml pre{margin:6px 0 0;padding:8px;overflow:auto;border-radius:6px;background:var(--dsw-alias-bg-layer-2);font-family:ui-monospace,Consolas,monospace;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-word}',
  '.ovx-card-body{margin-top:10px;font-size:13px;line-height:1.7;color:var(--dsw-alias-label-primary)}',
  '.ovx-empty{padding:6px 0;font-size:12px;color:var(--dsw-alias-label-secondary)}',
  '.ovx-subitems{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}',
  '.ovx-chip{display:inline-flex;align-items:center;gap:3px;max-width:100%;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:11px;line-height:20px;padding:0 7px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.ovx-chip:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
  '.ovx-pre{margin:0;padding:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);overflow:auto;font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word}',
  '.ovx-md{font-size:13px;line-height:1.7}',
  '.ovx-md h3,.ovx-md h4{margin:14px 0 6px;font-size:13.5px;font-weight:700}',
  '.ovx-md h3:first-child,.ovx-md h4:first-child{margin-top:0}',
  '.ovx-md p{margin:6px 0}',
  '.ovx-md ul,.ovx-md ol{margin:6px 0;padding-left:20px}',
  '.ovx-md li{margin:2px 0}',
  '.ovx-md blockquote{margin:8px 0;padding:4px 10px;border-left:3px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}',
  '.ovx-md code{padding:1px 4px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);font-family:ui-monospace,Consolas,monospace;font-size:12px}',
  '.ovx-md pre{margin:8px 0;padding:10px;overflow:auto;border-radius:8px;background:var(--dsw-alias-bg-layer-2)}',
  '.ovx-md pre code{padding:0;background:transparent}',
  '.ovx-md a{color:var(--dsw-alias-brand-primary);text-decoration:none}',
  '.ovx-md a:hover{text-decoration:underline}',
  '.ovx-md hr{margin:12px 0;border:0;border-top:1px solid var(--dsw-alias-border-l1)}',
  '.ovx-md table{border-collapse:collapse;margin:8px 0;font-size:12px}',
  '.ovx-md th,.ovx-md td{border:1px solid var(--dsw-alias-border-l1);padding:4px 8px;text-align:left}',
  '.ovx-toast{position:sticky;bottom:8px;margin:0 10px 8px;padding:5px 10px;border-radius:6px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);box-shadow:0 2px 10px rgba(0,0,0,.16);font-size:11.5px;color:var(--dsw-alias-label-primary)}',
]

function ovxInstallStyle() {
  if (typeof document === 'undefined') return function () {}
  if (document.getElementById(OVX_STYLE_ID) !== null) return function () {}
  var style = document.createElement('style')
  style.id = OVX_STYLE_ID
  style.textContent = OVX_CSS.join('\n')
  document.head.appendChild(style)
  return function () {
    if (style.parentNode !== null) style.parentNode.removeChild(style)
  }
}

    // ---- client/api.mjs ----
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

    // ---- client/markdown.mjs ----
/**
 * 轻量 Markdown 渲染（片段）。
 *
 * 客户端只能 require('react')，不能引第三方库；这里直接返回 React 元素树，
 * 不用 innerHTML，避免 XSS 与样式失控。只覆盖 OpenViking 摘要/概览实际用到的语法：
 * 标题、表格、列表、代码块、引用、粗体、行内代码、链接、分隔线。
 */

/** 行内语法：**粗体**、`代码`、[文字](链接)。 */
function ovxMdInline(text, keyBase) {
  var nodes = []
  var buffer = ''
  var seq = 0
  var flush = function () {
    if (buffer.length > 0) {
      nodes.push(buffer)
      buffer = ''
    }
  }
  var index = 0
  var source = String(text)
  while (index < source.length) {
    if (source.startsWith('**', index)) {
      var boldEnd = source.indexOf('**', index + 2)
      if (boldEnd > index + 2) {
        flush()
        nodes.push(h('strong', { key: keyBase + '-s' + (seq += 1) }, source.slice(index + 2, boldEnd)))
        index = boldEnd + 2
        continue
      }
      // 孤立的两颗星（翻译/裁剪后残留）直接丢掉，别让它在正文里露出来
      if (boldEnd === index + 2 || (boldEnd === -1 && (index + 2 >= source.length || source[index + 2] === '\n'))) {
        flush()
        index += 2
        continue
      }
    }
    if (source[index] === '`') {
      var codeEnd = source.indexOf('`', index + 1)
      if (codeEnd > index + 1) {
        flush()
        nodes.push(h('code', { key: keyBase + '-c' + (seq += 1) }, source.slice(index + 1, codeEnd)))
        index = codeEnd + 1
        continue
      }
    }
    if (source[index] === '[') {
      var link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(source.slice(index))
      if (link !== null) {
        flush()
        nodes.push(h('a', { key: keyBase + '-a' + (seq += 1), href: link[2], target: '_blank', rel: 'noopener' }, link[1]))
        index += link[0].length
        continue
      }
    }
    buffer += source[index]
    index += 1
  }
  flush()
  return nodes
}

function ovxMdSplitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (cell) { return cell.trim() })
}

function ovxMdIsTableSeparator(line) {
  return /^\s*\|?[\s:-]+\|[\s:|-]*$/.test(line)
}

function ovxMdIsBlockStart(line, next) {
  if (/^(#{1,6})\s+/.test(line)) return true
  if (/^```/.test(line.trim())) return true
  if (/^\s*>/.test(line)) return true
  if (/^\s*[-*+]\s+/.test(line)) return true
  if (/^\s*\d+[.)]\s+/.test(line)) return true
  if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return true
  if (line.indexOf('|') >= 0 && typeof next === 'string' && ovxMdIsTableSeparator(next)) return true
  return false
}

/** 把 Markdown 文本转成 React 元素。 */
function OvxMarkdown(props) {
  var lines = String(props.text === undefined || props.text === null ? '' : props.text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
  var blocks = []
  var key = 0
  var index = 0
  var nextKey = function (prefix) { key += 1; return prefix + key }
  while (index < lines.length) {
    var line = lines[index]
    if (line.trim().length === 0) {
      index += 1
      continue
    }
    // 代码块
    if (/^```/.test(line.trim())) {
      index += 1
      var code = []
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      blocks.push(h('pre', { key: nextKey('pre') }, h('code', null, code.join('\n'))))
      continue
    }
    // 标题
    var heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading !== null) {
      var tag = heading[1].length <= 2 ? 'h3' : 'h4'
      blocks.push(h(tag, { key: nextKey('h') }, ovxMdInline(heading[2], 'h' + key)))
      index += 1
      continue
    }
    // 分隔线
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(h('hr', { key: nextKey('hr') }))
      index += 1
      continue
    }
    // 引用
    if (/^\s*>/.test(line)) {
      var quote = []
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      blocks.push(h('blockquote', { key: nextKey('q') }, ovxMdInline(quote.join('\n'), 'q' + key)))
      continue
    }
    // 表格
    if (line.indexOf('|') >= 0 && index + 1 < lines.length && ovxMdIsTableSeparator(lines[index + 1])) {
      var header = ovxMdSplitRow(line)
      index += 2
      var rows = []
      while (index < lines.length && lines[index].indexOf('|') >= 0 && lines[index].trim().length > 0) {
        rows.push(ovxMdSplitRow(lines[index]))
        index += 1
      }
      blocks.push(h('table', { key: nextKey('t') },
        h('thead', null, h('tr', null, header.map(function (cell, cellIndex) {
          return h('th', { key: cellIndex }, ovxMdInline(cell, 'th' + cellIndex))
        }))),
        h('tbody', null, rows.map(function (row, rowIndex) {
          return h('tr', { key: rowIndex }, row.map(function (cell, cellIndex) {
            return h('td', { key: cellIndex }, ovxMdInline(cell, 'td' + rowIndex + '-' + cellIndex))
          }))
        })),
      ))
      continue
    }
    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      var items = []
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ''))
        index += 1
      }
      blocks.push(h('ul', { key: nextKey('ul') }, items.map(function (item, itemIndex) {
        return h('li', { key: itemIndex }, ovxMdInline(item, 'ul' + itemIndex))
      })))
      continue
    }
    // 有序列表
    if (/^\s*\d+[.)]\s+/.test(line)) {
      var ordered = []
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        ordered.push(lines[index].replace(/^\s*\d+[.)]\s+/, ''))
        index += 1
      }
      blocks.push(h('ol', { key: nextKey('ol') }, ordered.map(function (item, itemIndex) {
        return h('li', { key: itemIndex }, ovxMdInline(item, 'ol' + itemIndex))
      })))
      continue
    }
    // 段落：连续普通行合并
    var paragraph = [line]
    index += 1
    while (index < lines.length && lines[index].trim().length > 0 && !ovxMdIsBlockStart(lines[index], lines[index + 1])) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push(h('p', { key: nextKey('p') }, ovxMdInline(paragraph.join('\n'), 'p' + key)))
  }
  if (blocks.length === 0) return h('div', { className: 'ovx-empty' }, '（空）')
  return h('div', { className: 'ovx-md' }, blocks)
}

    // ---- client/draft.mjs ----
/**
 * 把一条 viking:// 引用插进当前会话的输入草稿（片段）。
 *
 * 与 dsh-better-sidebar 文件树的 @ 按钮同一机制：走宿主的
 * `conversation.input.insertReference`，编辑器里显示紧凑 chip，模型收到完整 ref。
 * 拿不到 chip 通道时退回纯文本追加，绝不抛错打断点击。
 *
 * 注意：viking:// 不是工作区路径，不能用宿主的工作区引用接口（那个会按
 * 工作区根投影路径），所以这里自己拼 chip 与 detect 投影偏移。
 */

function ovxConversationOf(ctx) {
  try {
    if (ctx === undefined || ctx === null || typeof ctx.get !== 'function') return null
    var conversation = ctx.get('conversation')
    if (conversation === undefined || conversation === null || conversation.input === undefined) return null
    return conversation
  } catch (error) {
    return null
  }
}

function ovxSessionScopeOf(ctx, sessionId) {
  try {
    if (ctx === undefined || ctx === null || typeof ctx.get !== 'function') return null
    var sessions = ctx.get('sessions')
    if (sessions === undefined || sessions === null || typeof sessions.scope !== 'function') return null
    if (typeof sessionId !== 'string' || sessionId === '') return null
    return sessions.scope(sessionId) || null
  } catch (error) {
    return null
  }
}

/** 追加文本需要的前导空格：空草稿不加，已有空白不重复。 */
function ovxLeadFor(draft) {
  if (String(draft).trim() === '') return ''
  return /\s$/.test(draft) ? '' : ' '
}

/**
 * 把 clipboard 投影（chip 展开成整段文本）的偏移折成 detect 投影（chip 压成 1 个字符）。
 * 宿主只接受 detect 投影里的 span，不折叠会多算 length-1 个字符而拒绝插入。
 */
function ovxFoldClipboardOffset(draft, occurrences, offset) {
  var target = Math.max(0, Math.min(offset, draft.length))
  var shrink = 0
  for (var index = 0; index < occurrences.length; index += 1) {
    var occurrence = occurrences[index]
    var end = occurrence.offset + occurrence.length
    if (target >= end) {
      shrink += occurrence.length - 1
      continue
    }
    if (target > occurrence.offset) return occurrence.offset - shrink + 1
    break
  }
  return target - shrink
}

/** 追加位置对应的 detect 偏移；命令 chip（/goal）也要折掉。 */
function ovxAppendOffset(snapshot) {
  var draft = snapshot.draft === undefined ? '' : snapshot.draft
  var occurrences = snapshot.occurrences === undefined || snapshot.occurrences === null ? [] : snapshot.occurrences
  var token = ''
  if (snapshot.phase === 'claimed' && snapshot.claim !== undefined && snapshot.claim !== null && draft.startsWith(snapshot.claim.token)) {
    token = snapshot.claim.token
  }
  if (token === '') return ovxFoldClipboardOffset(draft, occurrences, draft.length)
  var rest = draft.slice(token.length)
  var offsetInRest = []
  for (var index = 0; index < occurrences.length; index += 1) {
    var occurrence = occurrences[index]
    if (occurrence.offset < token.length) continue
    offsetInRest.push({ offset: occurrence.offset - token.length, length: occurrence.length })
  }
  return 1 + ovxFoldClipboardOffset(rest, offsetInRest, rest.length)
}

/**
 * 插入一条 viking:// 引用。
 * @returns {boolean} 是否成功（false 表示宿主没有草稿通道或被拒绝，调用方可提示）
 */
function ovxInsertUriReference(ctx, sessionId, uri) {
  var target = String(uri === undefined || uri === null ? '' : uri)
  if (target === '') return false
  var conversation = ovxConversationOf(ctx)
  var actx = ovxSessionScopeOf(ctx, sessionId)
  if (conversation === null || actx === null) return false

  // chip：屏幕上显示紧凑的 URI，模型收到的 ref 也是 URI（由模型自己去读 OpenViking）。
  // 不声明 appearance：这不是工作区文件，点 chip 不应交给宿主文件打开器。
  var reference = {
    source: 'reference',
    ref: target,
    label: target,
    clipboardText: target,
  }
  try {
    var input = conversation.input.for(actx)
    var snapshot = input.state.getSnapshot()
    var draft = snapshot.draft === undefined ? '' : snapshot.draft
    var canChip = typeof input.insertReference === 'function'
      && snapshot.draftRev !== undefined
      && snapshot.phase !== 'adjudicating'
      && snapshot.phase !== 'submitting'
    if (canChip) {
      var at = ovxAppendOffset(snapshot)
      var rev = snapshot.draftRev
      var start = at
      if (ovxLeadFor(draft) !== '') {
        actx.emit('slash/input-insert-text', { text: ' ', span: { draftRev: rev, start: at, end: at } })
        var afterSpace = input.state.getSnapshot()
        if (afterSpace.draftRev === rev) throw new Error('预留分隔空格失败')
        rev = afterSpace.draftRev
        start = at + 1
      }
      var applied = input.insertReference(reference, { draftRev: rev, start: start, end: start })
      if (applied !== false) return true
    }
    if (typeof input.setDraft === 'function') {
      input.setDraft(ovxLeadFor(draft) + target)
      return true
    }
  } catch (error) {
    // 宿主可能已经应用了这次编辑再抛错：看草稿修订号判断，避免重复插入。
    try {
      var input2 = conversation.input.for(actx)
      if (input2.state.getSnapshot().draftRev !== snapshot.draftRev) return true
    } catch (ignored) { /* 探测失败就按失败处理 */ }
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn('[dsh-openviking-expand] 引用插入失败：', error)
    }
  }
  return false
}

/** 目录条目在草稿里带尾斜杠，与宿主的目录 mention 习惯一致。 */
function ovxReferenceTargetOf(entry) {
  var uri = String(entry && entry.uri ? entry.uri : '')
  if (uri === '') return ''
  if (entry.isDir === true && uri.charAt(uri.length - 1) !== '/') return uri + '/'
  return uri
}

    // ---- client/tree.mjs ----
/**
 * 右侧栏「viking://」页签：目录树（片段）。
 *
 * 数据全部来自宿主路由 /openviking-expand/*；本组件不直连 OpenViking。
 * 每行 hover 出两个动作：
 *   @  把该条目的 viking:// URI 作为引用插进当前会话输入框；
 *   ↗  在同一个右侧栏里打开它（文件=正文，目录=L0+L1 组合视图）。
 */

var OVX_BROWSE_TAB = 'openviking:browse'
var OVX_ITEM_TAB = 'openviking:item'
var OVX_ROOT_KEY = 'dsh-openviking-expand:root'

/** 根目录覆盖值：只接受 viking:// 前缀，存 localStorage 以便重挂后还在。 */
function ovxStoredRoot() {
  try {
    if (typeof localStorage === 'undefined') return null
    var value = localStorage.getItem(OVX_ROOT_KEY)
    return typeof value === 'string' && value.indexOf('viking://') === 0 ? value : null
  } catch (error) {
    return null
  }
}

function ovxStoreRoot(value) {
  try {
    if (typeof localStorage === 'undefined') return
    if (value === null) localStorage.removeItem(OVX_ROOT_KEY)
    else localStorage.setItem(OVX_ROOT_KEY, value)
  } catch (error) {
    /* 隐私模式禁用存储时只是不记忆，不影响本次切换 */
  }
}

/* ── 图标 ──────────────────────────────────────────────────────────────── */
function OvxSvg(props) {
  return h('svg', {
    width: props.size || 14,
    height: props.size || 14,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: props.strokeWidth || 1.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  }, props.children)
}

function OvxChevron() {
  return h(OvxSvg, { size: 12 }, h('path', { d: 'M6 3.5 10.5 8 6 12.5' }))
}

function OvxFolderIcon(props) {
  if (props.open === true) {
    return h(OvxSvg, null,
      h('path', { d: 'M1.8 12.6V4.2a1 1 0 0 1 1-1h3.1l1.3 1.5h5a1 1 0 0 1 1 1v.9' }),
      h('path', { d: 'M1.8 12.6l1.7-4.5a1 1 0 0 1 .95-.65h8.9a1 1 0 0 1 .96 1.3l-1.3 3.85a1 1 0 0 1-.95.65H2.8a1 1 0 0 1-1-.65Z' }))
  }
  return h(OvxSvg, null, h('path', { d: 'M1.8 12.4V4.2a1 1 0 0 1 1-1h3.1l1.3 1.5h5a1 1 0 0 1 1 1v6.7a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1Z' }))
}

function OvxFileIcon() {
  return h(OvxSvg, null,
    h('path', { d: 'M4 1.8h5l3 3v9.4H4z' }),
    h('path', { d: 'M9 1.8v3.2h3.2' }))
}

function OvxRefreshIcon() {
  return h(OvxSvg, { size: 13 }, h('path', { d: 'M13.2 8a5.2 5.2 0 1 1-1.6-3.75' }), h('path', { d: 'M13.4 2.2v3.1h-3.1' }))
}

function OvxEyeIcon(props) {
  if (props.off === true) {
    return h(OvxSvg, { size: 13 }, h('path', { d: 'M2 8s2.4-4 6-4 6 4 6 4-2.4 4-6 4S2 8 2 8Z' }), h('path', { d: 'M2.6 2.6l10.8 10.8' }))
  }
  return h(OvxSvg, { size: 13 }, h('path', { d: 'M2 8s2.4-4 6-4 6 4 6 4-2.4 4-6 4S2 8 2 8Z' }), h('circle', { cx: 8, cy: 8, r: 1.7 }))
}

function OvxArrowUpRight() {
  return h(OvxSvg, { size: 13 }, h('path', { d: 'M4.6 11.4 11 5' }), h('path', { d: 'M6.2 4.6H11.4V9.8' }))
}

function OvxRootIcon() {
  return h(OvxSvg, { size: 13 }, h('path', { d: 'M2.4 7.6 8 3l5.6 4.6' }), h('path', { d: 'M4 7v6.2h8V7' }))
}

/* ── 行 ────────────────────────────────────────────────────────────────── */
function OvxRow(props) {
  var entry = props.entry
  var depth = props.depth
  var isDir = entry.isDir === true
  var open = props.open === true
  var indent = 6 + depth * 13
  // 目录要真有 L0/L1 才给「打开」：没有摘要的目录点开只有一句空提示。
  // 文件打开的是正文，与 L0/L1 无关，所以文件一直保留这个入口。
  var canOpen = isDir ? (entry.hasL0 === true || entry.hasL1 === true) : true
  return h('div', {
    className: 'ovx-row',
    'data-open': open ? 'true' : undefined,
    role: 'treeitem',
    'aria-expanded': isDir ? (open ? 'true' : 'false') : undefined,
    title: entry.uri,
    style: { paddingLeft: indent + 'px' },
    onClick: function () { props.onActivate(entry) },
  },
  h('span', { className: 'ovx-caret', 'data-open': open ? 'true' : 'false', 'data-empty': isDir ? 'false' : 'true' }, OvxChevron()),
  h('span', { className: 'ovx-rowicon' }, isDir ? h(OvxFolderIcon, { open: open }) : OvxFileIcon()),
  h('span', { className: 'ovx-name' }, entry.name),
  h('span', { className: 'ovx-actions' },
    h('button', {
      className: 'ovx-act ovx-at',
      type: 'button',
      title: '把 viking:// URI 引用到输入框',
      'aria-label': '引用到输入框',
      onClick: function (event) { event.stopPropagation(); props.onReference(entry) },
    }, '@'),
    isDir ? h('button', {
      className: 'ovx-act',
      type: 'button',
      title: '设为根目录：把这层目录当作树的新根',
      'aria-label': '设为根目录',
      onClick: function (event) { event.stopPropagation(); props.onSetRoot(entry) },
    }, OvxRootIcon()) : null,
    canOpen ? h('button', {
      className: 'ovx-act',
      type: 'button',
      title: isDir ? '打开 L0+L1 组合视图' : '打开文件内容',
      'aria-label': '打开',
      onClick: function (event) { event.stopPropagation(); props.onOpen(entry) },
    }, OvxArrowUpRight()) : null,
  ))
}

function OvxHint(props) {
  return h('div', { className: 'ovx-hint', style: { paddingLeft: (10 + (props.depth || 0) * 13) + 'px' } }, props.children)
}

/* ── 树页签 ────────────────────────────────────────────────────────────── */
function OvxTreeTab(props) {
  var ctx = props.ctx
  var service = props.service
  var sessionId = props.scope !== undefined && props.scope !== null ? props.scope.sessionId : undefined


  var bootstrapPair = ovxUseAsync(function () { return ovxRequest('/bootstrap') }, [])
  var bootstrap = bootstrapPair[0]

  var hiddenPair = React.useState(null)
  var hiddenChoice = hiddenPair[0]
  var setHiddenChoice = hiddenPair[1]

  var nodesPair = React.useState({})
  var nodes = nodesPair[0]
  var setNodes = nodesPair[1]

  var expandedPair = React.useState({})
  var expanded = expandedPair[0]
  var setExpanded = expandedPair[1]

  var toastPair = React.useState(null)
  var toast = toastPair[0]
  var setToast = toastPair[1]

  var inflight = React.useRef({})
  var rootPair = React.useState(function () { return ovxStoredRoot() })
  var rootOverride = rootPair[0]
  var setRootOverride = rootPair[1]
  var editingPair = React.useState(false)
  var editing = editingPair[0]
  var setEditing = editingPair[1]
  var draftPair = React.useState('')
  var draft = draftPair[0]
  var setDraft = draftPair[1]

  var ready = bootstrap.value !== null && bootstrap.value !== undefined
  var configuredRoot = ready && bootstrap.value.root ? bootstrap.value.root : 'viking://'
  var root = rootOverride !== null ? rootOverride : configuredRoot
  var defaultHidden = ready ? bootstrap.value.showHidden === true : false
  var showHidden = hiddenChoice === null ? defaultHidden : hiddenChoice

  var load = React.useCallback(function (uri) {
    if (typeof uri !== 'string' || uri === '') return
    if (inflight.current[uri] === true) return
    inflight.current[uri] = true
    setNodes(function (previous) {
      var next = Object.assign({}, previous)
      var old = previous[uri] !== undefined ? previous[uri] : null
      next[uri] = { loading: true, error: null, entries: old !== null ? old.entries : [], hasMore: false }
      return next
    })
    ovxRequest('/ls', { uri: uri, showHidden: showHidden ? 'true' : undefined }).then(function (result) {
      delete inflight.current[uri]
      setNodes(function (previous) {
        var next = Object.assign({}, previous)
        next[uri] = {
          loading: false,
          error: null,
          entries: result !== null && result !== undefined && Array.isArray(result.entries) ? result.entries : [],
          hasMore: result !== null && result !== undefined && result.hasMore === true,
        }
        return next
      })
    }, function (error) {
      delete inflight.current[uri]
      setNodes(function (previous) {
        var next = Object.assign({}, previous)
        next[uri] = { loading: false, error: ovxErrorText(error), entries: [], hasMore: false }
        return next
      })
    })
  }, [showHidden])

  // 根或隐藏项偏好变化时，清空缓存并重新拉根目录。
  React.useEffect(function () {
    if (!ready) return
    inflight.current = {}
    setExpanded({})
    setNodes({})
    load(root)
  }, [ready, root, showHidden])

  React.useEffect(function () {
    if (toast === null) return undefined
    var handle = setTimeout(function () { setToast(null) }, 2600)
    return function () { clearTimeout(handle) }
  }, [toast])

  var openEntry = function (entry) {
    if (service === null || service === undefined || typeof service.openTab !== 'function') {
      setToast('当前 DSH 没有可用的右侧栏打开接口')
      return
    }
    service.openTab({ type: OVX_ITEM_TAB, path: entry.uri, title: entry.name })
  }

  var referenceEntry = function (entry) {
    var target = ovxReferenceTargetOf(entry)
    var ok = ovxInsertUriReference(ctx, sessionId, target)
    setToast(ok ? ('已插入引用：' + target) : '当前会话没有可用的输入框')
  }

  var activateEntry = function (entry) {
    if (entry.isDir !== true) {
      openEntry(entry)
      return
    }
    var uri = entry.uri
    var willOpen = expanded[uri] !== true
    setExpanded(function (previous) {
      var next = Object.assign({}, previous)
      if (willOpen) next[uri] = true
      else delete next[uri]
      return next
    })
    if (willOpen && nodes[uri] === undefined) load(uri)
  }

  /** 换根：写进 localStorage，卸载重挂后仍然记得；传 null 回到配置里的根。 */
  var applyRoot = function (value) {
    var next = typeof value === 'string' && value.indexOf('viking://') === 0 ? value : null
    ovxStoreRoot(next)
    setRootOverride(next)
    setEditing(false)
    setToast(next === null ? ('已回到配置根：' + configuredRoot) : ('已切到根：' + next))
  }

  var setRootEntry = function (entry) {
    if (entry.isDir !== true) return
    applyRoot(entry.uri)
  }

  var openRootEditor = function () {
    setDraft(root)
    setEditing(true)
  }

  var commitRootEditor = function (value) {
    var text = String(value === undefined || value === null ? '' : value).trim()
    if (text === '') return
    applyRoot(text.charAt(text.length - 1) === '/' && text !== 'viking://' ? text.slice(0, -1) : text)
  }

  var refresh = function () {
    inflight.current = {}
    var openUris = Object.keys(expanded)
    setNodes({})
    load(root)
    openUris.forEach(function (uri) { load(uri) })
  }

  // 递归渲染：目录展开才渲染子层，未加载的目录显示占位。
  var renderNode = function (entry, depth, output) {
    var isDir = entry.isDir === true
    var open = expanded[entry.uri] === true
    output.push(h(OvxRow, {
      key: entry.uri,
      entry: entry,
      depth: depth,
      open: open,
      onActivate: activateEntry,
      onReference: referenceEntry,
      onOpen: openEntry,
      onSetRoot: setRootEntry,
    }))
    if (!isDir || !open) return output
    var node = nodes[entry.uri]
    if (node === undefined) {
      output.push(h(OvxHint, { key: entry.uri + ':idle', depth: depth + 1 }, '…'))
      return output
    }
    if (node.error !== null) {
      output.push(h(OvxHint, { key: entry.uri + ':error', depth: depth + 1 }, '读取失败：' + node.error))
      return output
    }
    if (node.entries.length === 0) {
      output.push(h(OvxHint, { key: entry.uri + ':empty', depth: depth + 1 }, node.loading ? '加载中…' : '空目录'))
      return output
    }
    node.entries.forEach(function (child) { renderNode(child, depth + 1, output) })
    if (node.hasMore === true) {
      output.push(h(OvxHint, { key: entry.uri + ':more', depth: depth + 1 }, '条目过多，只显示前一批（可在配置里调大 nodeLimit）'))
    }
    return output
  }

  var rows = []
  var rootNode = nodes[root]
  if (bootstrap.loading && !ready) {
    rows.push(h('div', { key: 'boot', className: 'ovx-hint' }, h('span', { className: 'ovx-spinner' }), ' 读取 OpenViking 配置…'))
  } else if (!ready) {
    rows.push(h('div', { key: 'boot-error', className: 'ovx-state' },
      h('h3', null, '无法读取插件配置'),
      h('p', null, 'DSH 没有响应 /openviking-expand/bootstrap。刷新页面或重启 DSH 后重试。'),
      h('button', { className: 'ovx-btn', type: 'button', onClick: bootstrapPair[2] }, '重试')))
  } else if (rootNode === undefined) {
    rows.push(h('div', { key: 'root-loading', className: 'ovx-hint' }, h('span', { className: 'ovx-spinner' }), ' 读取 viking:// …'))
  } else if (rootNode.error !== null) {
    rows.push(h('div', { key: 'root-error', className: 'ovx-state' },
      h('h3', null, '无法读取 viking://'),
      h('p', null, rootNode.error),
      h('code', null, 'endpoint: ' + (bootstrap.value.endpoint || '')),
      h('button', { className: 'ovx-btn', type: 'button', onClick: refresh }, '重试')))
  } else if (rootNode.entries.length === 0) {
    rows.push(h('div', { key: 'root-empty', className: 'ovx-empty', style: { padding: '10px 12px' } }, 'viking:// 下没有可显示的条目'))
  } else {
    rootNode.entries.forEach(function (entry) { renderNode(entry, 0, rows) })
  }

  // 工具栏：根目录可改（手动输入或点某行的「设为根」），改完写 localStorage。
  var rootBar = editing
    ? h('div', { className: 'ovx-toolbar' },
      h('input', {
        className: 'ovx-rootinput',
        type: 'text',
        value: draft,
        autoFocus: true,
        spellCheck: false,
        placeholder: 'viking://resources/…',
        onChange: function (event) { setDraft(event.target.value) },
        onKeyDown: function (event) {
          if (event.key === 'Enter') commitRootEditor(event.target.value === undefined ? draft : event.target.value)
          if (event.key === 'Escape') setEditing(false)
        },
      }),
      h('button', { className: 'ovx-btn', type: 'button', onClick: function () { commitRootEditor(draft) } }, '确定'),
      h('button', { className: 'ovx-btn', type: 'button', onClick: function () { setEditing(false) } }, '取消'))
    : h('div', { className: 'ovx-toolbar' },
      h('button', {
        className: 'ovx-rooturi ovx-rootbtn',
        type: 'button',
        title: '点击修改根目录',
        onClick: openRootEditor,
      }, root),
      rootOverride !== null
        ? h('button', {
          className: 'ovx-iconbtn',
          type: 'button',
          title: '回到配置里的根：' + configuredRoot,
          'aria-label': '重置根目录',
          onClick: function () { applyRoot(null) },
        }, OvxRootIcon())
        : null)

  return h('div', { className: 'ovx-root' },
    h('div', { className: 'ovx-head' },
      h('span', { className: 'ovx-title' }, 'OpenViking'),
      h('button', {
        className: 'ovx-iconbtn',
        type: 'button',
        title: showHidden ? '隐藏 .abstract.md / .overview.md' : '显示隐藏项（L0/L1 生成文件）',
        'aria-label': '显示隐藏项',
        'aria-pressed': showHidden ? 'true' : 'false',
        onClick: function () { setHiddenChoice(!showHidden) },
      }, h(OvxEyeIcon, { off: !showHidden })),
      h('button', {
        className: 'ovx-iconbtn',
        type: 'button',
        title: '刷新',
        'aria-label': '刷新',
        onClick: refresh,
      }, OvxRefreshIcon())),
    rootBar,
    h('div', { className: 'ovx-tree', role: 'tree' }, rows),
    toast !== null ? h('div', { className: 'ovx-toast' }, toast) : null)
}

    // ---- client/item.mjs ----
/**
 * 右侧栏条目视图（片段）：
 *  - 目录 → L0 摘要 + L1 概览的组合视图（版式对齐 Studio 的 L0/L1 页）；
 *  - 文件 → 正文（.md 可切预览/源码）、超大文件给前若干行、二进制只报元信息。
 */

function OvxMetaRows(props) {
  var meta = props.meta
  if (meta === null || meta === undefined) return null
  var rows = []
  if (typeof meta.directory === 'string' && meta.directory !== '') {
    rows.push(h('div', { className: 'ovx-meta-row', key: 'dir' },
      h('span', { className: 'ovx-meta-key' }, '所属目录'),
      h('span', { className: 'ovx-meta-val' }, meta.directory)))
  }
  if (typeof meta.component === 'string' && meta.component !== '') {
    var generator = meta.component + (typeof meta.trigger === 'string' && meta.trigger !== '' ? ' · ' + meta.trigger : '')
    rows.push(h('div', { className: 'ovx-meta-row', key: 'gen' },
      h('span', { className: 'ovx-meta-key' }, '生成组件'),
      h('span', { className: 'ovx-meta-val' }, generator)))
  }
  if (meta.freshness !== null && meta.freshness !== undefined) {
    var fresh = meta.freshness
    var parts = []
    if (fresh.sampledEntries !== null) parts.push('已采样 ' + fresh.sampledEntries + ' / ' + (fresh.totalEntries === null ? '?' : fresh.totalEntries))
    if (fresh.unsampledEntries !== null) parts.push(fresh.unsampledEntries + ' 条未采样')
    if (fresh.pendingChildChanges !== null) parts.push('待处理变更 ' + fresh.pendingChildChanges)
    if (parts.length > 0) {
      rows.push(h('div', { className: 'ovx-meta-row', key: 'fresh' },
        h('span', { className: 'ovx-meta-key' }, '新鲜度'),
        h('span', { className: 'ovx-meta-val ovx-plain' }, parts.join(' · '))))
    }
  }
  if (rows.length === 0) return null
  return h('div', { className: 'ovx-meta' }, rows)
}

function OvxLayerCard(props) {
  var layer = props.layer
  var hasMeta = layer.meta !== null && layer.meta !== undefined
  var hasYaml = typeof layer.frontMatter === 'string' && layer.frontMatter !== ''
  return h('section', { className: 'ovx-card', ref: props.innerRef, id: props.anchorId },
    h('div', { className: 'ovx-card-head' },
      h('span', { className: 'ovx-card-title' }, props.title),
      h('span', { className: 'ovx-card-desc' }, props.desc)),
    hasMeta ? h(OvxMetaRows, { meta: layer.meta }) : null,
    layer.body !== '' ? h('div', { className: 'ovx-card-body' }, h(OvxMarkdown, { text: layer.body }))
      : h('div', { className: 'ovx-empty' }, '该层没有正文内容'),
    hasYaml ? h('details', { className: 'ovx-yaml' },
      h('summary', null, 'YAML 元数据'),
      h('pre', null, layer.frontMatter.trim())) : null,
  )
}

function OvxDirView(props) {
  var item = props.item
  var l0Ref = React.useRef(null)
  var l1Ref = React.useRef(null)
  var scrollTo = function (ref) {
    if (ref.current !== null && typeof ref.current.scrollIntoView === 'function') {
      ref.current.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  }
  var hasL0 = item.l0 !== null && item.l0 !== undefined
  var hasL1 = item.l1 !== null && item.l1 !== undefined
  var children = Array.isArray(item.children) ? item.children : []
  return h(React.Fragment, null,
    hasL0 || hasL1
      ? h('div', { className: 'ovx-pills' },
        hasL0 ? h('button', { className: 'ovx-pill', type: 'button', key: 'l0', onClick: function () { scrollTo(l0Ref) } }, 'L0 摘要') : null,
        hasL1 ? h('button', { className: 'ovx-pill', type: 'button', key: 'l1', onClick: function () { scrollTo(l1Ref) } }, 'L1 概览') : null)
      : null,
    hasL0 ? h(OvxLayerCard, { key: 'card-l0', innerRef: l0Ref, title: 'L0 摘要', desc: '简短的语义摘要', layer: item.l0 }) : null,
    hasL1 ? h(OvxLayerCard, { key: 'card-l1', innerRef: l1Ref, title: 'L1 概览', desc: '目录内容概览', layer: item.l1 }) : null,
    !hasL0 && !hasL1
      ? h('div', { className: 'ovx-empty' }, '这个目录还没有生成 L0/L1（目录下没有 .abstract.md / .overview.md）。')
      : null,
    children.length > 0
      ? h('div', { className: 'ovx-card' },
        h('div', { className: 'ovx-card-head' },
          h('span', { className: 'ovx-card-title' }, '子项'),
          h('span', { className: 'ovx-card-desc' }, children.length + (item.childrenHasMore === true ? '+' : '') + ' 项')),
        h('div', { className: 'ovx-subitems' }, children.map(function (child) {
          return h('button', {
            key: child.uri,
            className: 'ovx-chip',
            type: 'button',
            title: child.uri,
            onClick: function () {
              if (props.onOpenEntry !== undefined) props.onOpenEntry(child)
            },
          }, child.name)
        })))
      : null,
  )
}

function OvxFileView(props) {
  var item = props.item
  var isMarkdown = /\.(md|markdown)$/i.test(String(item.name || ''))
  var sourcePair = React.useState(false)
  var source = sourcePair[0]
  var setSource = sourcePair[1]

  if (item.contentKind === 'binary') {
    return h('div', { className: 'ovx-empty' }, '这是二进制文件（' + OvxFormatSize(item.size) + '），右侧栏只显示文本内容。')
  }
  if (item.contentKind === 'too-large') {
    return h(React.Fragment, null,
      h('div', { className: 'ovx-empty' }, '文件较大（' + OvxFormatSize(item.size) + '），下面只显示前 ' + (item.previewLines || 200) + ' 行。'),
      h('pre', { className: 'ovx-pre' }, item.preview || ''))
  }
  var text = item.content === undefined || item.content === null ? '' : item.content
  if (!isMarkdown) return h('pre', { className: 'ovx-pre' }, text)
  return h(React.Fragment, null,
    h('div', { className: 'ovx-pills' },
      h('button', { className: 'ovx-pill', type: 'button', onClick: function () { setSource(false) } }, '预览'),
      h('button', { className: 'ovx-pill', type: 'button', onClick: function () { setSource(true) } }, '源码')),
    source ? h('pre', { className: 'ovx-pre' }, text) : h(OvxMarkdown, { text: text }))
}

function OvxFormatSize(size) {
  var bytes = Number(size)
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function OvxItemTab(props) {
  var ctx = props.ctx
  var service = props.service
  var uri = props.tab !== undefined && props.tab !== null && typeof props.tab.path === 'string' ? props.tab.path : ''
  var pair = ovxUseAsync(function () { return ovxRequest('/item', { uri: uri }) }, [uri])
  var state = pair[0]
  var reload = pair[2]
  var item = state.value

  var openChild = function (child) {
    if (service === null || service === undefined || typeof service.openTab !== 'function') return
    service.openTab({ type: OVX_ITEM_TAB, path: child.uri, title: child.name })
  }

  // 原生右侧栏的页签标题来自注册时的描述符，打开时给的 title 不一定生效；
  // 数据到手后用 updateTab 把页签名改成真实条目名（老版本没有该方法就跳过）。
  var loadedTitle = item !== null && item !== undefined && typeof item.name === 'string' && item.name !== '' ? item.name : null
  React.useEffect(function () {
    if (loadedTitle === null) return
    if (service === null || service === undefined || typeof service.updateTab !== 'function') return
    if (props.tab === undefined || props.tab === null || typeof props.tab.id !== 'string') return
    var sessionId = props.scope !== undefined && props.scope !== null ? props.scope.sessionId : undefined
    try {
      service.updateTab(props.tab.id, { title: loadedTitle }, sessionId)
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('[dsh-openviking-expand] 更新页签标题失败：', error)
      }
    }
  }, [loadedTitle])

  var title = loadedTitle !== null
    ? loadedTitle
    : (uri !== '' ? uri.slice(uri.lastIndexOf('/') + 1) : 'OpenViking')

  var body = null
  if (state.loading && item === null) {
    body = h('div', { className: 'ovx-state' }, h('span', { className: 'ovx-spinner' }), h('p', null, '正在读取…'))
  } else if (state.error !== null) {
    body = h('div', { className: 'ovx-state' },
      h('h3', null, '读取失败'),
      h('p', null, state.error),
      h('code', null, uri),
      h('button', { className: 'ovx-btn', type: 'button', onClick: reload }, '重试'))
  } else if (item === null || item === undefined) {
    body = h('div', { className: 'ovx-state' }, h('p', null, '没有可显示的内容'))
  } else if (item.kind === 'dir') {
    body = h('div', { className: 'ovx-body' }, h(OvxDirView, { item: item, onOpenEntry: openChild }))
  } else {
    body = h('div', { className: 'ovx-body' }, h(OvxFileView, { item: item }))
  }

  return h('div', { className: 'ovx-root' },
    h('div', { className: 'ovx-head' },
      h('span', { className: 'ovx-title', title: uri !== '' ? uri : title }, title),
      h('button', {
        className: 'ovx-iconbtn',
        type: 'button',
        title: '刷新',
        'aria-label': '刷新',
        onClick: reload,
      }, OvxRefreshIcon())),
    h('div', { className: 'ovx-toolbar' },
      h('span', { className: 'ovx-rooturi', title: uri }, uri),
      h('button', {
        className: 'ovx-btn',
        type: 'button',
        title: '把这个 URI 引用到输入框',
        onClick: function () {
          var ok = ovxInsertUriReference(ctx, props.scope !== undefined && props.scope !== null ? props.scope.sessionId : undefined, uri)
          if (!ok && typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn('[dsh-openviking-expand] 当前会话没有可用的输入框')
          }
        },
      }, '@ 引用')),
    body)
}

    // ---- client/console.mjs ----
/**
 * 组件 console 的浏览器半侧（片段，由 scripts/build-client.mjs 拼装）。
 *
 * 在 DSH 左侧栏注册 OpenViking 入口，并在中间列嵌入服务端 Studio：
 *  - 宿主事实来自一条同源 fenced 路由 /openviking-expand/console；
 *  - iframe 由同源 /studio/* 代理提供，因此能读到 Studio 文档、注入宿主主题；
 *  - 代理不携带 OpenViking API key。
 *
 * 片段不写 import/export：它与其它片段共享同一个工厂作用域，React 由信封注入。
 */

    const LOCALE_NS = "openvikingConsole";
    const CONSOLE_ROUTE = "/openviking-expand/console";
    // The sidebar entry id addresses the matching `main` panel key.
    const PANEL_ID = "openviking-console";
    const ROUTE_TIMEOUT_MS = 6000;

    const ZH = {
      panelName: "OpenViking 控制台",
      title: "OpenViking 控制台",
      refresh: "刷新",
      openInBrowser: "在浏览器中打开",
      loading: "正在加载 OpenViking 控制台…",
      unreachableTitle: "无法连接 OpenViking 服务",
      unreachableHint: "请确认 OpenViking 服务已启动，并检查插件配置的 endpoint。",
      missingTitle: "此服务未提供 Web 控制台",
      missingHint: "当前 OpenViking 服务没有内置 Studio（或 /studio 不可访问）。请升级服务，或用 consoleUrl 指向可访问的控制台地址。",
      errorTitle: "无法读取控制台配置",
      errorHint: "DSH 的 OpenViking 插件路由没有响应。请刷新页面或重启 DSH 后重试。",
      retry: "重试",
    };

    const EN = {
      panelName: "OpenViking Console",
      title: "OpenViking Console",
      refresh: "Refresh",
      openInBrowser: "Open in browser",
      loading: "Loading the OpenViking console…",
      unreachableTitle: "Cannot reach the OpenViking service",
      unreachableHint: "Make sure the OpenViking server is running and the plugin's endpoint is correct.",
      missingTitle: "This server has no Web console",
      missingHint: "The OpenViking server does not ship the Studio (or /studio is unreachable). Upgrade it, or point consoleUrl at a reachable console.",
      errorTitle: "Cannot read the console settings",
      errorHint: "The DSH route did not answer. Refresh the page or restart DSH and try again.",
      retry: "Retry",
    };

    let translate = key => key;

    // ── Host theme ─────────────────────────────────────────────────────────
    // The plugin proxies the Studio through the DSH origin, so the iframe is
    // same-origin and this code can set the Studio's CSS variables directly.
    // A `color-scheme` style on the iframe also flips the Studio's own
    // `prefers-color-scheme` for components that read it.
    const DSH_TOKENS = [
      "--dsw-alias-bg-base",
      "--dsw-alias-bg-layer-1",
      "--dsw-alias-bg-layer-2",
      "--dsw-alias-bg-overlay",
      "--dsw-alias-border-l1",
      "--dsw-alias-border-l2",
      "--dsw-alias-brand-primary",
      "--dsw-alias-label-primary",
      "--dsw-alias-label-secondary",
      "--dsw-alias-state-error-primary",
      "--dsw-alias-state-success-primary",
      "--dsw-alias-state-warn-primary",
      "--dsw-alias-state-idle-primary",
      "--dsw-specific-sidebar-fill",
    ];

    let themeState = { scheme: "light", tokens: {}, revision: 0 };
    const themeListeners = new Set();

    function subscribeTheme(listener) {
      themeListeners.add(listener);
      return () => themeListeners.delete(listener);
    }

    function setThemeState(snapshot) {
      // The revision increments on every theme/change, even when the light/dark
      // scheme is unchanged, so a same-mode palette switch still reaches the
      // Studio's CSS variables.
      themeState = {
        scheme: snapshot?.active?.colorScheme === "dark" ? "dark" : "light",
        tokens: snapshot?.active?.tokens || {},
        revision: themeState.revision + 1,
      };
      for (const listener of themeListeners) listener();
    }

    function useThemeState() {
      return React.useSyncExternalStore(subscribeTheme, () => themeState);
    }

    function readDshTokens(scope) {
      if (typeof document === "undefined") return {};
      // Custom properties inherit downward. A skin or theme layer may define
      // them on a wrapper below <html>, so resolve from the plugin's own page
      // (inside the themed tree) first, then fall back to body and the root.
      const elements = [scope, document.body, document.documentElement].filter(Boolean);
      const tokens = {};
      for (const element of elements) {
        const style = getComputedStyle(element);
        for (const name of DSH_TOKENS) {
          if (tokens[name]) continue;
          const value = style.getPropertyValue(name).trim();
          if (value) tokens[name] = value;
        }
      }
      // A theme layer whose tokens this document cannot resolve still exists in
      // the theme snapshot; accept the spellings a snapshot may use for each
      // alias (full `--dsw-alias-*`, bare alias, or no leading `--`).
      const snapshotTokens = themeState.tokens || {};
      const candidates = name => [
        name,
        name.replace(/^--/, ""),
        name.replace(/^--dsw-alias-/, ""),
        name.replace(/^--dsw-specific-/, ""),
      ];
      for (const name of DSH_TOKENS) {
        if (tokens[name]) continue;
        for (const key of candidates(name)) {
          const value = snapshotTokens[key];
          if (typeof value === "string" && value.trim()) {
            tokens[name] = value.trim();
            break;
          }
        }
      }
      return tokens;
    }

    /** Map the host palette onto the Studio's shadcn-style variables. */
    function buildThemeOverrides(tokens) {
      const base = tokens["--dsw-alias-bg-base"];
      if (!base) return {};
      const layer1 = tokens["--dsw-alias-bg-layer-1"] || base;
      const layer2 = tokens["--dsw-alias-bg-layer-2"] || layer1;
      const overlay = tokens["--dsw-alias-bg-overlay"] || layer1;
      const border1 = tokens["--dsw-alias-border-l1"] || layer2;
      const border2 = tokens["--dsw-alias-border-l2"] || border1;
      const label1 = tokens["--dsw-alias-label-primary"] || base;
      const label2 = tokens["--dsw-alias-label-secondary"] || label1;
      const brand = tokens["--dsw-alias-brand-primary"] || label1;
      const error = tokens["--dsw-alias-state-error-primary"] || label1;
      const success = tokens["--dsw-alias-state-success-primary"] || brand;
      const warning = tokens["--dsw-alias-state-warn-primary"] || brand;
      const sidebar = tokens["--dsw-specific-sidebar-fill"] || layer1;
      const mix = (color, percent, other) =>
        `color-mix(in oklab, ${color} ${percent}%, ${other})`;
      return {
        "--background": base,
        "--foreground": label1,
        "--card": layer1,
        "--card-foreground": label1,
        "--popover": overlay,
        "--popover-foreground": label1,
        "--primary": brand,
        "--primary-foreground": base,
        "--secondary": layer2,
        "--secondary-foreground": label1,
        "--muted": layer2,
        "--muted-foreground": label2,
        "--accent": mix(brand, 10, base),
        "--accent-foreground": brand,
        "--destructive": error,
        "--border": border1,
        "--input": border2,
        "--ring": brand,
        "--sidebar": sidebar,
        "--sidebar-foreground": label1,
        "--sidebar-primary": brand,
        "--sidebar-primary-foreground": base,
        "--sidebar-accent": mix(brand, 14, base),
        "--sidebar-accent-foreground": brand,
        "--sidebar-border": border1,
        "--sidebar-ring": brand,
        "--chart-1": mix(brand, 55, base),
        "--chart-2": mix(brand, 70, base),
        "--chart-3": brand,
        "--chart-4": mix(brand, 72, label1),
        "--chart-5": mix(brand, 52, label1),
        "--home-token-input": brand,
        "--home-token-output": mix(brand, 60, success),
        "--home-token-embedding": mix(brand, 55, label2),
        "--heatmap-empty": layer2,
        "--heatmap-level-1": mix(brand, 25, base),
        "--heatmap-level-2": mix(brand, 45, base),
        "--heatmap-level-3": mix(brand, 65, base),
        "--heatmap-level-4": brand,
        "--success": success,
        "--success-foreground": base,
        "--warning": warning,
        "--warning-foreground": base,
        "--info": brand,
        "--info-foreground": base,
      };
    }

    /** Apply the host palette to the proxied Studio document. */
    function applyFrameTheme(iframe, theme) {
      if (!iframe) return false;
      let doc;
      try {
        doc = iframe.contentDocument;
      } catch {
        return false;
      }
      if (!doc) return false;
      const root = doc.documentElement;
      if (!root) return false;
      const tokens = readDshTokens(iframe.parentElement);
      if (!tokens["--dsw-alias-bg-base"]) return false;
      if (typeof console !== "undefined") {
        console.debug("[openviking] console theme", {
          sameOrigin: Boolean(doc),
          tokenCount: Object.keys(tokens).length,
          base: tokens["--dsw-alias-bg-base"],
          scheme: theme.scheme,
        });
      }
      root.classList.toggle("dark", theme.scheme === "dark");
      root.style.colorScheme = theme.scheme;
      for (const [name, value] of Object.entries(buildThemeOverrides(tokens))) {
        root.style.setProperty(name, value);
      }
      root.dataset.dshTheme = theme.scheme;
      return true;
    }

    // ── Sidebar icon ───────────────────────────────────────────────────────
    // The sidebar owns the row and its button; a panel-list entry contributes
    // the icon (owner props: size, active) and the localized label metadata.
    function PanelIcon(props) {
      const size = typeof props?.size === "number" ? props.size : 18;
      const active = Boolean(props?.active);
      return h(
        "svg",
        {
          viewBox: "0 0 24 24",
          width: size,
          height: size,
          fill: "currentColor",
          "aria-hidden": "true",
          style: {
            display: "block",
            color: active ? "var(--dsw-alias-brand-primary)" : "var(--dsw-alias-label-secondary)",
          },
        },
        h("path", { transform: "scale(.24)", d: "M20.5 84H31L70 16.45H67ZM37 84 76 16.45V84Z" }),
      );
    }

    // ── Center-column console page ─────────────────────────────────────────
    function ConsolePage() {
      if (!OVX_CONFIGURED) {
        return h("div", { style: { padding: "32px", maxWidth: "640px" } },
          h("div", { style: { fontSize: "16px", fontWeight: 600, marginBottom: "8px" } }, "OpenViking 尚未配置"),
          h("div", { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary, #888)", lineHeight: "22px" } },
            "请先到插件页配置 OpenViking 连接：左侧「插件」→「OpenViking 扩展」→「OpenViking 连接」，填写服务类型、地址和 API 密钥后保存。保存成功后控制台与侧边栏会自动启用。"));
      }
      const [state, setState] = React.useState({
        phase: "loading",
        info: null,
        error: null,
        frameLoaded: false,
      });
      const [nonce, setNonce] = React.useState(0);
      const theme = useThemeState();

      React.useEffect(() => {
        let active = true;
        setState(prev => ({ ...prev, phase: "loading", error: null, frameLoaded: false }));
        (async () => {
          try {
            const response = await fetch(new URL(CONSOLE_ROUTE, document.baseURI), {
              headers: { accept: "application/json" },
              cache: "no-store",
              signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS),
            });
            const body = await response.json().catch(() => null);
            if (!active) return;
            if (!response.ok || !body || body.ok !== true) {
              throw new Error(body?.error?.message || `HTTP ${response.status}`);
            }
            setState({ phase: "loaded", info: body, error: null, frameLoaded: false });
          } catch (error) {
            if (!active) return;
            setState(prev => ({ ...prev, phase: "error", error: messageOf(error) }));
          }
        })();
        return () => {
          active = false;
        };
      }, [nonce]);

      const refresh = () => setNonce(value => value + 1);
      const info = state.info;
      const view = state.phase === "error" ? "error" : state.phase === "loading" ? "loading" : viewOf(info);
      const browserUrl = info?.browserUrl;

      return h(
        "div",
        { className: "ov-console-page", style: { colorScheme: theme.scheme } },
        h(Styles),
        h("div", { className: "ov-console-body" }, renderBody(state, view, refresh, nonce, theme, t)),
        // The console fills the pane; these two controls float over it instead
        // of occupying a separate toolbar.
        h(
          "div",
          { className: "ov-console-float", role: "toolbar", "aria-label": t("title") },
          h(
            "button",
            {
              type: "button",
              className: "ov-console-iconbtn",
              title: t("refresh"),
              "aria-label": t("refresh"),
              onClick: refresh,
            },
            RefreshIcon(),
          ),
          h(
            "button",
            {
              type: "button",
              className: "ov-console-iconbtn",
              title: t("openInBrowser"),
              "aria-label": t("openInBrowser"),
              onClick: () => openInBrowser(browserUrl),
              disabled: !browserUrl,
            },
            ExternalIcon(),
          ),
        ),
      );
    }

    function renderBody(state, view, refresh, nonce, theme, t) {
      const info = state.info;
      if (view === "loading") return h(Loading, { label: t("loading") });
      if (view === "ready") {
        return h(ConsoleFrame, {
          src: studioFrameUrl(),
          title: t("title"),
          label: t("loading"),
          reloadKey: nonce,
          theme,
        });
      }
      const spec = STATE_SPECS[view] || STATE_SPECS.error;
      const url = info?.browserUrl;
      const actions = [
        spec.retry
          ? h("button", { key: "retry", type: "button", className: "ov-console-button", onClick: refresh }, t("retry"))
          : null,
        url
          ? h("button", {
            key: "browser",
            type: "button",
            className: "ov-console-button ov-console-button--primary",
            onClick: () => openInBrowser(url),
          }, t("openInBrowser"))
          : null,
      ].filter(Boolean);
      return h(
        "div",
        { className: "ov-console-state" },
        h("div", { className: "ov-console-state__icon", "aria-hidden": "true" }, AlertIcon()),
        h("h2", null, t(spec.title)),
        h("p", null, t(spec.hint)),
        url ? h("code", null, url) : null,
        actions.length ? h("div", { className: "ov-console-state__actions" }, actions) : null,
      );
    }

    function studioFrameUrl() {
      try {
        return new URL("/studio/home", window.location.origin).href;
      } catch {
        return "/studio/home";
      }
    }

    const STATE_SPECS = {
      error: { title: "errorTitle", hint: "errorHint", retry: true },
      unreachable: { title: "unreachableTitle", hint: "unreachableHint", retry: true },
      missing: { title: "missingTitle", hint: "missingHint", retry: true },
    };

    function viewOf(info) {
      if (!info) return "error";
      const studio = info.studio || {};
      const health = info.health || {};
      if (studio.available) return "ready";
      if (health.reachable) return "missing";
      return "unreachable";
    }

    function Loading({ label }) {
      return h(
        "div",
        { className: "ov-console-loading" },
        h("span", { className: "ov-console-spinner", "aria-hidden": "true" }),
        h("span", null, label),
      );
    }

    // The loading veil belongs to the frame, not to the page: a fresh reload
    // remounts this component, which resets the veil without touching the
    // page's own state or the React-managed DOM by hand.
    function ConsoleFrame({ src, title, label, reloadKey, theme }) {
      const [loaded, setLoaded] = React.useState(false);
      const iframeRef = React.useRef(null);
      const observerRef = React.useRef(null);
      const observedRef = React.useRef(null);
      const schemeRef = React.useRef(theme.scheme);
      schemeRef.current = theme.scheme;

      const applyTheme = React.useCallback(() => {
        applyFrameTheme(iframeRef.current, { scheme: schemeRef.current });
      }, []);

      const ensureObserver = React.useCallback(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;
        let root;
        try {
          root = iframe.contentDocument?.documentElement;
        } catch {
          return;
        }
        // The initial about:blank document is replaced by the proxied Studio;
        // only observe the document that is actually loaded.
        if (!root || observedRef.current === root) return;
        observerRef.current?.disconnect();
        observerRef.current = new MutationObserver(() => {
          const doc = iframeRef.current?.contentDocument;
          if (!doc) return;
          const wantDark = schemeRef.current === "dark";
          if (doc.documentElement.classList.contains("dark") !== wantDark) {
            applyTheme();
          }
        });
        observerRef.current.observe(root, { attributes: true, attributeFilter: ["class"] });
        observedRef.current = root;
      }, [applyTheme]);

      React.useEffect(() => {
        applyTheme();
      }, [applyTheme, theme.scheme, theme.revision]);

      React.useEffect(() => {
        ensureObserver();
        return () => {
          observerRef.current?.disconnect();
          observerRef.current = null;
          observedRef.current = null;
        };
      }, [ensureObserver, src, reloadKey]);

      return h(
        React.Fragment,
        null,
        h("iframe", {
          key: `${src}#${reloadKey}`,
          ref: iframeRef,
          className: "ov-console-frame",
          src,
          title,
          allow: "clipboard-write",
          referrerPolicy: "same-origin",
          // The embedded Studio's `prefers-color-scheme` follows this element's
          // computed color scheme, so its own "system" parts track DSH.
          style: { colorScheme: theme.scheme },
          onLoad: () => {
            setLoaded(true);
            applyTheme();
            ensureObserver();
          },
        }),
        loaded ? null : h(Loading, { label }),
      );
    }

    function openInBrowser(url) {
      if (!url) return;
      window.open(url, "_blank", "noopener,noreferrer");
    }

    function messageOf(error) {
      return error instanceof Error ? error.message : String(error);
    }

    // ── Artwork ────────────────────────────────────────────────────────────
    function RefreshIcon() {
      return h(
        "svg",
        {
          viewBox: "0 0 24 24",
          width: 16,
          height: 16,
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.8,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true",
        },
        h("path", { d: "M20 12a8 8 0 1 1-2.34-5.66" }),
        h("path", { d: "M20 4v5h-5" }),
      );
    }

    function ExternalIcon() {
      return h(
        "svg",
        {
          viewBox: "0 0 24 24",
          width: 16,
          height: 16,
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.8,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true",
        },
        h("path", { d: "M14 4h6v6M20 4l-9 9" }),
        h("path", { d: "M18 13v6H5V6h6" }),
      );
    }

    function AlertIcon() {
      return h(
        "svg",
        {
          viewBox: "0 0 24 24",
          width: 30,
          height: 30,
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.6,
          strokeLinecap: "round",
          "aria-hidden": "true",
        },
        h("circle", { cx: 12, cy: 12, r: 9 }),
        h("path", { d: "M12 7.5v5.5M12 16.5v.01" }),
      );
    }

    // ── Styles ─────────────────────────────────────────────────────────────
    function Styles() {
      return h("style", null, CSS);
    }

    const CSS = `
.ov-console-page {
  position: relative;
  display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
}
.ov-console-float {
  position: absolute; right: 14px; bottom: 14px; z-index: 2;
  display: flex; align-items: center; gap: 2px; padding: 3px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px;
  background: var(--dsw-alias-bg-overlay);
  box-shadow: 0 2px 12px rgba(0, 0, 0, .18);
}
.ov-console-float .ov-console-iconbtn { width: 26px; height: 26px; border-radius: 999px; }
.ov-console-float .ov-console-iconbtn:disabled { opacity: .4; cursor: default; }
.ov-console-float .ov-console-iconbtn:disabled:hover { background: transparent; color: var(--dsw-alias-label-secondary); }
.ov-console-iconbtn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.ov-console-iconbtn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.ov-console-iconbtn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.ov-console-body { position: relative; flex: 1; min-height: 0; background: var(--dsw-alias-bg-base); }
.ov-console-frame { display: block; width: 100%; height: 100%; border: 0; background: var(--dsw-alias-bg-base); }
.ov-console-loading {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 10px;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary); font-size: 13px;
}
.ov-console-spinner {
  width: 18px; height: 18px; border: 2px solid var(--dsw-alias-border-l2);
  border-top-color: var(--dsw-alias-brand-primary); border-radius: 50%;
  animation: ov-console-spin .8s linear infinite;
}
@keyframes ov-console-spin { to { transform: rotate(360deg); } }
.ov-console-state {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 10px; padding: 32px; overflow: auto; text-align: center;
  color: var(--dsw-alias-label-secondary);
}
.ov-console-state__icon { display: flex; color: var(--dsw-alias-label-secondary); opacity: .8; }
.ov-console-state h2 { margin: 0; color: var(--dsw-alias-label-primary); font-size: 15px; font-weight: 600; }
.ov-console-state p { max-width: 560px; margin: 0; font-size: 13px; line-height: 1.6; }
.ov-console-state code {
  max-width: 560px; padding: 6px 10px; overflow-wrap: anywhere;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px;
}
.ov-console-state__actions { display: flex; gap: 8px; margin-top: 6px; }
.ov-console-button {
  height: 30px; padding: 0 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px;
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  font-family: inherit; font-size: 12px; cursor: pointer;
}
.ov-console-button:hover { background: var(--dsw-alias-bg-layer-2); }
.ov-console-button--primary { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
@media (max-width: 720px) {
  .ov-console-float { right: 8px; bottom: 8px; }
}
`;

    // ── Locale and slots ───────────────────────────────────────────────────
    function consoleApply(ctx) {
      ctx.effect(() => {
        const disposeZh = ctx.locale.register(LOCALE_NS, "zh", ZH);
        const disposeEn = ctx.locale.register(LOCALE_NS, "en", EN);
        translate = ctx.locale.bind(LOCALE_NS);
        return () => {
          translate = key => key;
          if (typeof disposeZh === "function") disposeZh();
          if (typeof disposeEn === "function") disposeEn();
        };
      }, "openvikingConsole.locale()");

      // Seed from the live snapshot, then follow every theme switch (including
      // the OS scheme flipping while DSH's preference is `system`, and a
      // same-mode palette switch that only changes token values).
      setThemeState(ctx.theme.getTheme());
      ctx.effect(() => {
        const dispose = ctx.on("theme/change", snapshot => setThemeState(snapshot));
        return () => {
          if (typeof dispose === "function") dispose();
        };
      }, "openvikingConsole.theme()");

      // The console UI and this companion bundle load and unload together, so
      // no availability probe is needed here: DSH owns the bundle lifecycle.
      // The sidebar entry id is the key the owner dispatches into `main`.
      ctx.slots.inject("main", () => ctx.slots.register({
        name: "main",
        key: PANEL_ID,
        locale: LOCALE_NS,
      }, function ConsoleGate() { return h(OvxConfigGate, null, h(ConsolePage)) }));

      ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
        name: "sidebar.panellist",
        id: PANEL_ID,
        order: 30,
        label: () => t("panelName"),
        locale: LOCALE_NS,
      }, PanelIcon));
    }

    function t(key) {
      return translate(key);
    }

    // 由入口片段（client/entry.mjs）统一导出，见 consolePart.apply。
    const consolePart = {
      inject: ["slots", "locale", "theme"],
      apply: consoleApply,
    };

    // ---- client/connect.mjs ----
/**
 * OpenViking 连接设置（片段）：单页表单，写在插件页的配置插槽里。
 *
 * 服务类型只有两种：开源服务（地址可填，默认 127.0.0.1:1933）与火山托管（地址固定）。
 * 密钥输入框一律「留空使用已保存凭据」；保存时由宿主合并已有值。
 * 设置持久化在宿主 ~/.dsh/openviking-expand.json，重装插件不会丢。
 */

var OVX_VOLC_SERVER = 'https://api.vikingdb.cn-beijing.volces.com/openviking'
var OVX_DEFAULT_OPEN_SERVER = 'http://127.0.0.1:1933'

var OVX_CONNECT = {
  card: { border: '1px solid var(--dsw-alias-border-l1, #444)', borderRadius: '12px', padding: '18px 20px', width: '100%', maxWidth: 'none', boxSizing: 'border-box' },
  h1: { margin: '0 0 6px', fontSize: '16px', fontWeight: 600 },
  sub: { margin: '0 0 16px', color: 'var(--dsw-alias-label-secondary, #888)', fontSize: '12px' },
  label: { margin: '14px 0 6px', fontSize: '13px', fontWeight: 500 },
  hint: { color: 'var(--dsw-alias-label-tertiary, #999)', fontSize: '12px', marginTop: '4px' },
  input: {
    width: '100%', boxSizing: 'border-box', height: '36px', borderRadius: '8px', padding: '0 10px',
    border: '1px solid var(--dsw-alias-border-l2, #555)', background: 'transparent', color: 'inherit', fontSize: '13px',
  },
  choiceRow: { display: 'flex', gap: '12px' },
  choice: function (active) {
    return {
      flex: 1, cursor: 'pointer', borderRadius: '10px', padding: '11px 14px', fontSize: '14px',
      border: active ? '1.5px solid var(--dsw-alias-brand-primary, #4c8dff)' : '1px solid var(--dsw-alias-border-l2, #555)',
      background: active ? 'var(--dsw-alias-bg-layer-2, transparent)' : 'transparent',
    }
  },
  actions: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginTop: '22px' },
  btnPrimary: {
    height: '36px', padding: '0 18px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap', flex: '0 0 auto',
    border: '1px solid var(--dsw-alias-brand-primary, #4c8dff)', background: 'var(--dsw-alias-brand-primary, #4c8dff)', color: '#fff',
  },
  error: { color: 'var(--dsw-alias-state-error-primary, #f66)', fontSize: '12px' },
  ok: { color: 'var(--dsw-alias-state-success-primary, #3c3)', fontSize: '12px' },
}

function ovxConnectRequest(path, options) {
  options = options || {}
  return fetch(path, {
    method: options.method || 'GET',
    headers: {
      accept: 'application/json',
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  }).then(async function (response) {
    var payload = await response.json().catch(function () { return {} })
    if (!response.ok || payload.ok !== true) {
      throw new Error(payload && payload.error && payload.error.message ? payload.error.message : 'HTTP ' + response.status)
    }
    return payload.result !== undefined ? payload.result : payload
  })
}

function OvxConnectWizard() {
  var statePair = React.useState({
    serviceType: 'open',
    server: OVX_DEFAULT_OPEN_SERVER,
    language: 'zh',
    account: 'default',
    user: 'default',
    apiKey: '',
    adminKey: '',
    advanced: false,
  })
  var state = statePair[0]
  var setState = statePair[1]
  var savedPair = React.useState({ hasApiKey: false, hasAdminKey: false, loaded: false })
  var saved = savedPair[0]
  var setSaved = savedPair[1]
  var statusPair = React.useState({ busy: false, error: '', ok: '' })
  var status = statusPair[0]
  var setStatus = statusPair[1]

  function patch(next) { setState(Object.assign({}, state, next)) }

  React.useEffect(function () {
    ovxConnectRequest('/openviking-expand/settings').then(function (result) {
      setSaved({ hasApiKey: Boolean(result.hasApiKey), hasAdminKey: Boolean(result.hasAdminKey), loaded: true })
      patch({
        serviceType: result.serviceType === 'volc' ? 'volc' : 'open',
        server: result.server || OVX_DEFAULT_OPEN_SERVER,
        language: result.language === 'en' ? 'en' : 'zh',
        account: result.account || 'default',
        user: result.user || 'default',
      })
    }).catch(function () {
      setSaved({ hasApiKey: false, hasAdminKey: false, loaded: true })
    })
  }, [])

  var server = state.serviceType === 'volc' ? OVX_VOLC_SERVER : state.server.trim()
  var serverValid = state.serviceType === 'volc' || /^https?:\/\/[^\s]+$/i.test(server)

  async function save() {
    if (!serverValid) return
    setStatus({ busy: true, error: '', ok: '' })
    try {
      await ovxConnectRequest('/openviking-expand/verify', {
        method: 'POST',
        body: {
          server: server,
          serviceType: state.serviceType,
          apiKey: state.apiKey,
          adminKey: state.adminKey,
          account: state.account,
          user: state.user,
        },
      })
      var result = await ovxConnectRequest('/openviking-expand/settings', {
        method: 'POST',
        body: {
          serviceType: state.serviceType,
          server: server,
          language: state.language,
          account: state.account,
          user: state.user,
          apiKey: state.apiKey,
          adminKey: state.adminKey,
        },
      })
      setSaved({ hasApiKey: result.settings.hasApiKey, hasAdminKey: result.settings.hasAdminKey, loaded: true })
      patch({ apiKey: '', adminKey: '' })
      // 控制台（Studio）用同一条连接：把生效的连接写给浏览器。
      if (typeof ovxSeedStudioConnection === 'function') ovxSeedStudioConnection(result.settings.server, result.apiKey, result.adminKey)
      setStatus({ busy: false, error: '', ok: '设置已保存' + (state.apiKey === '' && saved.hasApiKey ? '（密钥沿用已保存值）' : '') })
      try { window.dispatchEvent(new Event('ovx-config-saved')) } catch (error) { /* 忽略 */ }
      // 控制台/侧边栏可能在另一个面板里常驻；保存后整页刷新一次，确保立即生效。
      setTimeout(function () { try { window.location.reload() } catch (error) { /* 忽略 */ } }, 500)
    } catch (error) {
      setStatus({ busy: false, error: String(error && error.message ? error.message : error), ok: '' })
    }
  }

  return h('div', { style: { padding: '16px', overflowY: 'auto' } },
    h('div', { style: OVX_CONNECT.card },
      h('div', { style: OVX_CONNECT.h1 }, 'OpenViking 连接'),
      h('div', { style: OVX_CONNECT.sub }, '选择服务类型并填写连接信息；密钥留空表示沿用已保存的凭据。'),
      h('div', { style: OVX_CONNECT.label }, '服务类型'),
      h('div', { style: OVX_CONNECT.choiceRow },
        h('div', { style: OVX_CONNECT.choice(state.serviceType === 'open'), onClick: function () { patch({ serviceType: 'open' }) } }, '开源服务'),
        h('div', { style: OVX_CONNECT.choice(state.serviceType === 'volc'), onClick: function () { patch({ serviceType: 'volc' }) } }, '火山托管')),
      state.serviceType === 'open'
        ? h('div', null,
            h('div', { style: OVX_CONNECT.label }, '服务地址'),
            h('input', {
              style: OVX_CONNECT.input, value: state.server,
              onChange: function (event) { patch({ server: event.target.value }) },
              placeholder: OVX_DEFAULT_OPEN_SERVER,
            }))
        : h('div', null,
            h('div', { style: OVX_CONNECT.label }, '服务地址'),
            h('div', { style: Object.assign({}, OVX_CONNECT.input, { lineHeight: '36px', color: 'var(--dsw-alias-label-secondary, #888)' }) }, OVX_VOLC_SERVER)),
      h('div', { style: OVX_CONNECT.label }, '语言'),
      h('div', { style: OVX_CONNECT.choiceRow },
        h('div', { style: OVX_CONNECT.choice(state.language === 'zh'), onClick: function () { patch({ language: 'zh' }) } }, '中文'),
        h('div', { style: OVX_CONNECT.choice(state.language === 'en'), onClick: function () { patch({ language: 'en' }) } }, 'English')),
      h('div', { style: OVX_CONNECT.label }, '用户 API 密钥'),
      h('input', {
        style: OVX_CONNECT.input, value: state.apiKey, type: 'password',
        onChange: function (event) { patch({ apiKey: event.target.value }) },
        placeholder: saved.hasApiKey ? '已保存，留空使用已保存凭据' : '填写用户 API 密钥',
      }),
      h('div', { style: OVX_CONNECT.hint }, saved.hasApiKey ? '已保存过用户密钥；留空即继续使用。' : (state.serviceType === 'volc' ? '火山托管需要填写用户 API 密钥。' : '开源开发模式可留空。')),
      state.serviceType === 'volc' ? null : h('div', null,
        h('div', { style: OVX_CONNECT.label }, 'Root 或管理员 API 密钥'),
        h('input', {
          style: OVX_CONNECT.input, value: state.adminKey, type: 'password',
          onChange: function (event) { patch({ adminKey: event.target.value }) },
          placeholder: saved.hasAdminKey ? '已保存，留空使用已保存凭据' : '可选，留空表示不使用',
        }),
        h('div', { style: { ...OVX_CONNECT.label, cursor: 'pointer' }, onClick: function () { patch({ advanced: !state.advanced }) } },
          (state.advanced ? '⌄ ' : '› ') + '高级连接配置（选填）'),
        state.advanced ? h('div', null,
          h('div', { style: OVX_CONNECT.label }, '账号'),
          h('input', { style: OVX_CONNECT.input, value: state.account, onChange: function (event) { patch({ account: event.target.value }) } }),
          h('div', { style: OVX_CONNECT.label }, '用户'),
          h('input', { style: OVX_CONNECT.input, value: state.user, onChange: function (event) { patch({ user: event.target.value }) } })
        ) : null),
      h('div', { style: OVX_CONNECT.actions },
        h('button', {
          style: Object.assign({}, OVX_CONNECT.btnPrimary, status.busy ? { opacity: 0.6, cursor: 'wait' } : {}),
          disabled: status.busy || !serverValid,
          onClick: save,
        }, status.busy ? '保存中…' : '保存'),
        status.ok !== '' ? h('span', { style: OVX_CONNECT.ok }, status.ok) : null,
        status.error !== '' ? h('span', { style: OVX_CONNECT.error }, status.error) : null)))
}

function OvxConnectIcon() {
  return h('span', { 'aria-hidden': 'true', style: { fontSize: '11px', fontWeight: 700 } }, 'W')
}

function ovxApplyConnect(ctx) {
  // 配置放在插件页里（DSH 的 plugins.bundle.config / plugins.row.config 插槽），不单独开侧边栏栏目。
  try {
    window.__ovxConnectDiag = { applied: true, registered: [] }
  } catch (error) { /* 忽略 */ }
  function register(slot, key) {
    try {
      ctx.slots.inject(slot, function () {
        var handle = ctx.slots.register({ name: slot, key: key }, OvxConnectWizard)
        try { window.__ovxConnectDiag.registered.push(slot + ':' + key) } catch (error) { /* 忽略 */ }
        return handle
      })
      try { window.__ovxConnectDiag.registered.push('inject:' + slot + ':' + key) } catch (error) { /* 忽略 */ }
    } catch (error) {
      try { window.__ovxConnectDiag.error = String(error) } catch { /* 忽略 */ }
    }
  }
  register('plugins.bundle.config', 'dsh-openviking-expand')
  register('plugins.row.config', 'dsh-openviking-expand#openviking-expand-console')
  register('plugins.row.config', 'dsh-openviking-expand#openviking-expand-sidebar')
}

var connectPart = { inject: ['slots'], apply: ovxApplyConnect }

    // ---- client/entry.mjs ----
/**
 * 浏览器半侧入口（片段）：把两个组件挂到 DSH 客户端。
 *
 *  consolePart —— 左侧栏 OpenViking 控制台入口 + 中间列 Studio（原 console 组件）；
 *  sidebar     —— 右侧栏 viking:// 页签（注册进 dsh-better-sidebar 的扩展点）。
 *
 * 右侧栏是软依赖：没装 dsh-better-sidebar 时只跳过页签，控制台照常工作。
 */

var OVX_CONFIGURED = false
var OVX_LOCALE_NS = 'openvikingSidebar'
var ovxSidebarService = null
var ovxTranslate = function (key) { return key }

var OVX_ZH = {
  browseTitle: 'OpenViking',
  browseDescription: 'viking:// 目录树：条目可 @ 引用到输入框，或在右侧栏打开（目录看 L0+L1）',
  itemTitle: 'OpenViking 条目',
  itemDescription: 'viking:// 的一个文件或目录：目录显示 L0 摘要 + L1 概览组合',
}

var OVX_EN = {
  browseTitle: 'OpenViking',
  browseDescription: 'viking:// tree: reference entries into the composer with @, or open them here (a folder shows L0+L1)',
  itemTitle: 'OpenViking Item',
  itemDescription: 'One viking:// file or folder: a folder renders its L0 abstract plus L1 overview',
}

function OvxMarkIcon(size) {
  return h('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    'aria-hidden': 'true',
    focusable: 'false',
  }, h('path', {
    transform: 'scale(.24)',
    d: 'M20.5 84H31L70 16.45H67ZM37 84 76 16.45V84Z',
    fill: 'currentColor',
  }))
}

function ovxLabel(key) {
  var text = ovxTranslate(key)
  return typeof text === 'string' && text !== '' ? text : key
}

/**
 * 清掉旧版本替用户写进 Studio 的那条假连接（id `dsh-console`）。
 *
 * 现在插件不再写入任何连接设置：连接由用户在 Studio 里自己加，侧边栏跟着它走。
 * 这一步只删除我们自己造的那条，别的连接一条都不动。
 */
function ovxSeedStudioConnection(endpoint, apiKey, adminKey) {
  // Studio 嵌在同源 /studio 代理下，会把当前 origin（DSH 地址）误当成 OV 服务；
  // 另外 OV 默认 auth_mode=api_key，Studio 连接必须带 Key，否则「连接尚未验证成功」。
  // 打开控制台前写入宿主配置的 endpoint + 宿主解析出的 API Key。
  try {
    if (typeof localStorage === 'undefined' || typeof location === 'undefined') return
    var keyText = typeof apiKey === 'string' ? apiKey : ''
    var adminText = typeof adminKey === 'string' ? adminKey : ''
    var key = 'ov_console_connection_profiles'
    var parsed = null
    try {
      var raw = localStorage.getItem(key)
      if (raw !== null && raw !== '') parsed = JSON.parse(raw)
    } catch (error) { /* 旧数据解析失败就当作空 */ }
    var profiles = parsed !== null && parsed !== undefined && Array.isArray(parsed.profiles) ? parsed.profiles : []
    var activeId = parsed !== null && parsed !== undefined && typeof parsed.activeId === 'string' ? parsed.activeId : ''
    var origin = location.origin
    var target = typeof endpoint === 'string' && endpoint !== '' ? endpoint.replace(/\/+$/, '') : 'http://127.0.0.1:1933'
    var active = null
    for (var index = 0; index < profiles.length; index += 1) {
      if (profiles[index] !== null && profiles[index] !== undefined && profiles[index].id === activeId) { active = profiles[index]; break }
    }
    if (active === null) active = profiles[0] !== undefined ? profiles[0] : null
    var current = active !== null && active !== undefined && active.connection !== undefined && typeof active.connection.baseUrl === 'string'
      ? active.connection.baseUrl.replace(/\/+$/, '')
      : ''
    var currentKey = active !== null && active !== undefined && active.connection !== undefined && typeof active.connection.apiKey === 'string'
      ? active.connection.apiKey
      : ''
    var currentService = active !== null && active !== undefined && active.connection !== undefined && typeof active.connection.serviceSelection === 'string'
      ? active.connection.serviceSelection
      : ''
    var currentAdmin = active !== null && active !== undefined && active.connection !== undefined && typeof active.connection.adminApiKey === 'string'
      ? active.connection.adminApiKey
      : ''
    var needsKey = keyText !== '' && currentKey === ''
    var needsAdmin = adminText !== '' && currentAdmin === ''
    var valid = current !== '' && current !== origin && /^https?:\/\//i.test(current) && !needsKey && !needsAdmin && currentService !== ''
    if (valid) return
    var profile = {
      id: 'dsh-console', name: 'Default',
      connection: {
        serviceSelection: 'opensource',
        baseUrl: target, apiKey: keyText, adminApiKey: adminText,
        accountId: 'default', userId: 'default',
      },
    }
    var others = []
    for (var i = 0; i < profiles.length; i += 1) {
      var item = profiles[i]
      if (item === null || item === undefined || item.id === 'dsh-console') continue
      var base = item.connection !== undefined && typeof item.connection.baseUrl === 'string' ? item.connection.baseUrl.replace(/\/+$/, '') : ''
      if (base === origin) continue
      if (keyText !== '' && base === target) continue
      others.push(item)
    }
    localStorage.setItem(key, JSON.stringify({ profiles: [profile].concat(others), activeId: 'dsh-console' }))
  } catch (error) {
    /* 本地存储不可用时不影响控制台 */
  }
}

/** 注册右侧栏的两个页签；没有 betterSidebar 服务时安静跳过。 */
function ovxApplySidebar(ctx) {
  ovxEffect(ctx, function () { return ovxInstallStyle() }, 'openvikingExpand.style()')

  if (ctx !== undefined && ctx !== null && ctx.locale !== undefined && ctx.locale !== null
    && typeof ctx.locale.register === 'function' && typeof ctx.locale.bind === 'function') {
    ovxEffect(ctx, function () {
      var zh = ctx.locale.register(OVX_LOCALE_NS, 'zh', OVX_ZH)
      var en = ctx.locale.register(OVX_LOCALE_NS, 'en', OVX_EN)
      ovxTranslate = ctx.locale.bind(OVX_LOCALE_NS)
      return function () {
        ovxTranslate = function (key) { return key }
        if (typeof zh === 'function') zh()
        if (typeof en === 'function') en()
      }
    }, 'openvikingExpand.sidebarLocale()')
  }

  var register = function (scope) {
    var service = scope !== undefined && scope !== null && scope.betterSidebar !== undefined
      ? scope.betterSidebar
      : (scope !== undefined && scope !== null && typeof scope.get === 'function' ? scope.get('betterSidebar') : undefined)
    if (service === undefined || service === null || typeof service.registerTab !== 'function') return
    ovxSidebarService = service
    ovxEffect(scope, function () {
      var disposers = []
      disposers.push(service.registerTab({
        id: OVX_BROWSE_TAB,
        title: function () { return ovxLabel('browseTitle') },
        description: function () { return ovxLabel('browseDescription') },
        icon: function (size) { return OvxMarkIcon(size) },
        order: 45,
        single: true,
        component: function OvxBrowseHost(props) {
          return h(OvxConfigGate, null, h(OvxTreeTab, { ctx: props.ctx, scope: props.scope, tab: props.tab, visible: props.visible, service: ovxSidebarService }))
        },
      }))
      disposers.push(service.registerTab({
        id: OVX_ITEM_TAB,
        title: function () { return ovxLabel('itemTitle') },
        description: function () { return ovxLabel('itemDescription') },
        icon: function (size) { return OvxMarkIcon(size) },
        order: 46,
        // 只在 + 菜单里隐藏：它由目录树的 ↗ 打开，但仍是合法页签类型。
        hidden: true,
        dedupeKey: function (tab) { return tab !== undefined && tab !== null ? tab.path : undefined },
        component: function OvxItemHost(props) {
          return h(OvxConfigGate, null, h(OvxItemTab, { ctx: props.ctx, scope: props.scope, tab: props.tab, visible: props.visible, service: ovxSidebarService }))
        },
      }))
      return function () {
        for (var index = 0; index < disposers.length; index += 1) {
          if (typeof disposers[index] === 'function') disposers[index]()
        }
      }
    }, 'openvikingExpand.sidebarTabs()')
  }

  if (typeof ctx.inject === 'function') ctx.inject(['betterSidebar'], register)
  else if (ctx.betterSidebar !== undefined) register(ctx)
}

function ovxApply(ctx) {
  // 插件页里的 OpenViking 连接配置（bundle/row config 插槽），与组件开关无关。
  connectPart.apply(ctx)
  // 壳层只装配：哪些界面组件启用由宿主 bootstrap 决定；同时读插件设置判断是否已配置。
  Promise.all([ovxRequest('/bootstrap', null), ovxRequest('/settings', null)]).then(function (results) {
    var payload = results[0]
    var settings = results[1] || {}
    OVX_CONFIGURED = settings.configured === true
    var components = payload !== null && payload !== undefined && payload.components !== undefined && payload.components !== null
      ? payload.components
      : {}
    // 已配置才写 Studio 连接种子；未配置时控制台/侧边栏显示去插件页配置的提示。
    if (OVX_CONFIGURED) {
      ovxSeedStudioConnection(
        payload !== null && payload !== undefined ? payload.endpoint : undefined,
        payload !== null && payload !== undefined ? payload.apiKey : undefined,
        payload !== null && payload !== undefined ? payload.adminKey : undefined,
      )
    }
    if (components.console !== false) consolePart.apply(ctx)
    if (components.sidebar !== false) ovxApplySidebar(ctx)
  }, function () {
    /* 宿主没有启用任何界面组件 */
  })
}

var ovxPlugin = {
  inject: ['slots', 'locale', 'theme', 'sessions'],
  apply: ovxApply,
}
    exports.inject = ovxPlugin.inject
    exports.apply = ovxPlugin.apply
    return module.exports
  },
})
