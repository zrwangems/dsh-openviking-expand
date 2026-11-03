/**
 * vika 面板外壳（片段）：标题栏、搜索、术语帮助、六个页签、路由与注册。
 *
 * 面板注册在 DSH 的 main 槽与 sidebar.panellist；只有原生引擎可用时才注册，
 * 组件关闭时自动消失。
 */

var VK_PANEL_KEY = 'openviking-vika'
var VK_TABS = [
  ['overview', '概览'],
  ['source', '来源'],
  ['trigger', '触发'],
  ['eval', '评估'],
  ['execution', '执行'],
  ['settings', '设置'],
]

function VkPanelIcon(size) {
  return h('span', { 'aria-hidden': 'true', style: { fontSize: '11px', fontWeight: 700, lineHeight: 1 } }, 'v')
}

function VkSearchResults(props) {
  var result = props.result
  var app = props.app
  var close = props.onClose
  var total = result.tickets.length + result.threads.length + result.items.length
  var go = function (route) {
    close()
    app.navigate(route)
  }
  return h('div', { className: 'vk-search-results', role: 'region', 'aria-label': '搜索结果' },
    h('div', { className: 'vk-search-head' },
      h('span', { className: 'vk-hint' }, total === 0 ? '没有找到。可以输入触发文字、工单标题、线程键或 # 编号。' : '找到 ' + result.tickets.length + ' 个工单、' + result.threads.length + ' 个线程、' + result.items.length + ' 条触发'),
      h(VkButton, { variant: 'ghost', size: 'sm', icon: h(VkIcon, { name: 'close', size: 14 }), onClick: close }, '关闭')),
    total === 0 ? null : h('div', { className: 'vk-search-section' },
      result.tickets.map(function (ticket) {
        return h('button', { key: 't-' + ticket.id, type: 'button', className: 'vk-search-item', onClick: function () { go({ page: 'execution', id: ticket.id }) } },
          h('b', null, ticket.title),
          h('small', null, vkStageText(ticket.stage) + ' · ' + ticket.id))
      }),
      result.threads.map(function (thread) {
        return h('button', { key: 'r-' + thread.key, type: 'button', className: 'vk-search-item', onClick: function () { go({ page: 'trigger', id: thread.key }) } },
          h('b', null, thread.title),
          h('small', null, '线程 · ' + thread.sourceLabel + ' · 触发 ' + thread.triggerCount))
      }),
      result.items.map(function (trigger) {
        return h('button', { key: 'i-' + trigger.id, type: 'button', className: 'vk-search-item', onClick: function () { go({ page: 'trigger', id: trigger.thread }) } },
          h('b', null, trigger.preview || '（空消息）'),
          h('small', null, vkSourceText(trigger.source) + ' · ' + (trigger.actor || '未知发送者') + ' · ' + vkWhen(trigger.at)))
      })))
}

function VkGlossary(props) {
  var terms = [
    ['Trigger', '触发', '环境事件：飞书消息、GitHub 评论、手动或 API 调用。'],
    ['Thread', '线程', '同一话题的触发流；决定事件扇出到哪些工单。'],
    ['Ticket', '工单', '被接单的任务，对应一个或多个 worker 派工。'],
    ['Assignment', '派工', '工单的一次执行；当前实现每次派工启动一个 DSH Session。'],
    ['Worker', '执行会话', '真实的 DSH 物理 Session，执行具体任务并把结果写回报告。'],
    ['Router', '路由层', 'Vika 本体：接单、分派、对外回复，不直接执行具体任务。'],
    ['Report', '报告', 'worker 结束时写回工单的摘要。'],
    ['Eval', '评估', '程序层策略过滤后，由 Vika 或 auto 模式做出的接单判断。'],
    ['Policy', '策略', '程序层规则：来源、发送者、仓库白名单、规则命中。'],
  ]
  return h(VkModal, {
    open: props.open === true,
    title: '术语与状态',
    description: '面板用这些词描述一次任务从事件到完成的链路。',
    onClose: props.onClose,
    footer: h(VkButton, { variant: 'primary', onClick: props.onClose }, '关闭'),
  },
    h('table', { className: 'vk-glossary' },
      h('thead', null, h('tr', null, h('th', null, '术语'), h('th', null, '中文'), h('th', null, '含义'))),
      h('tbody', null, terms.map(function (item) {
        return h('tr', { key: item[0] }, h('td', null, item[0]), h('td', null, item[1]), h('td', null, item[2]))
      }))),
    h('ul', { className: 'vk-legend' },
      h('li', null, h(VkDot, { state: 'done' }), h('span', null, '已完成 / 运行中')),
      h('li', null, h(VkDot, { state: 'ongoing' }), h('span', null, '执行中')),
      h('li', null, h(VkDot, { state: 'warning' }), h('span', null, '待处理 / 警告')),
      h('li', null, h(VkDot, { state: 'error' }), h('span', null, '受阻 / 失败')),
      h('li', null, h(VkDot, { state: 'idle' }), h('span', null, '空闲 / 已关闭'))))
}

function VkHeader(props) {
  var app = props.app
  var queryPair = React.useState('')
  var query = queryPair[0]
  var setQuery = queryPair[1]
  var resultPair = React.useState(null)
  var result = resultPair[0]
  var setResult = resultPair[1]
  var glossaryPair = React.useState(false)
  var glossary = glossaryPair[0]
  var setGlossary = glossaryPair[1]
  var submit = function (event) {
    if (event !== undefined && event !== null && typeof event.preventDefault === 'function') event.preventDefault()
    var text = query.trim()
    if (text === '') { setResult(null); return }
    app.request('/search?q=' + encodeURIComponent(text)).then(function (value) { setResult(value) }, function (error) { app.notify(vkErrorText(error)) })
  }
  return h('header', { className: 'vk-head' },
    h('div', { className: 'vk-head-title' }, h('h1', { className: 'vk-title' }, 'vika')),
    h('div', { className: 'vk-toolbar' },
      h('form', {
        className: 'vk-search', role: 'search',
        onSubmit: submit,
        onKeyDown: function (event) { if (event.key === 'Escape') { setQuery(''); setResult(null) } },
      },
        h(VkInput, {
          type: 'search', value: query, placeholder: '搜索工单、线程、触发或链接', icon: h(VkIcon, { name: 'search' }),
          onChange: function (event) { setQuery(event.target.value); if (event.target.value === '') setResult(null) },
        }),
        result !== null ? h(VkSearchResults, { result: result, app: app, onClose: function () { setResult(null) } }) : null),
      h(VkButton, { variant: 'ghost', size: 'sm', icon: h(VkIcon, { name: 'question' }), title: '术语与状态', onClick: function () { setGlossary(true) } }, '术语'),
      h(VkButton, { variant: 'outline', size: 'sm', icon: h(VkIcon, { name: 'refresh' }), onClick: function () { app.refreshCurrent(); app.notify('已刷新') } }, '刷新')),
    h(VkGlossary, { open: glossary, onClose: function () { setGlossary(false) } }))
}

function VkApp(props) {
  var ctx = props.ctx
  var routePair = React.useState({ page: 'overview' })
  var route = routePair[0]
  var setRoute = routePair[1]
  var stackPair = React.useState([])
  var stack = stackPair[0]
  var setStack = stackPair[1]
  var tickPair = React.useState(0)
  var tick = tickPair[0]
  var setTick = tickPair[1]
  var toastPair = React.useState('')
  var toast = toastPair[0]
  var setToast = toastPair[1]
  var timerRef = React.useRef(null)
  var notify = function (text) {
    setToast(String(text || ''))
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(function () { setToast('') }, 4200)
  }
  var navigate = function (next, replace) {
    setRoute(next)
    if (replace !== true) setStack(stack.concat([route]).slice(-20))
    setTick(tick + 1)
    if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo(0, 0)
  }
  var back = function () {
    var previous = stack.length > 0 ? stack[stack.length - 1] : { page: 'overview' }
    setStack(stack.slice(0, -1))
    setRoute(previous)
    setTick(tick + 1)
  }
  var refreshCurrent = function () { setTick(tick + 1) }
  var request = function (path, options) { return vkRequest(path, options) }
  var openSession = function (sessionId) {
    vkOpenSession(ctx, sessionId).then(function () { notify('已打开 Session') }, function (error) { notify(vkErrorText(error)) })
  }
  var retryTicket = function (ticketId) {
    request('/tickets/' + encodeURIComponent(ticketId) + '/retry', { method: 'POST' })
      .then(function () { refreshCurrent(); notify('已重新派工') }, function (error) { notify(vkErrorText(error)) })
  }
  var app = {
    ctx: ctx, route: route, navigate: navigate, back: back, notify: notify,
    request: request, refreshCurrent: refreshCurrent, openSession: openSession, retryTicket: retryTicket,
    refreshTick: tick,
  }
  var page = null
  if (route.page === 'overview') page = h(VkOverviewPage, { app: app })
  else if (route.page === 'source') page = h(VkSourcePage, { app: app })
  else if (route.page === 'trigger') page = route.id !== undefined && route.id !== '' ? h(VkThreadPage, { app: app }) : h(VkTriggerPage, { app: app })
  else if (route.page === 'eval') page = h(VkEvalPage, { app: app })
  else if (route.page === 'execution') page = route.id !== undefined && route.id !== '' ? h(VkTicketPage, { app: app }) : h(VkExecutionPage, { app: app })
  else page = h(VkSettingsPage, { app: app })
  return h('div', { className: 'vk-page' },
    h('div', { className: 'vk-column' },
      h(VkHeader, { app: app }),
      h(VkTabs, {
        label: 'vika 页面', value: route.page, onChange: function (tab) {
          navigate(tab === 'settings' ? { page: 'settings', query: { group: 'source' } } : { page: tab })
        }, items: VK_TABS.map(function (item) { return { value: item[0], label: item[1] } }),
      }),
      h('main', { className: 'vk-main', id: 'vk-page' }, page),
      h(VkToast, { text: toast })))
}

var VK_REGISTERED = false

function vikaApply(ctx) {
  if (typeof window !== 'undefined' && window.__ovxVikaPanelRegistered === true) return
  var disposeStyle = vkInstallStyle()
  if (typeof ctx.effect === 'function') ctx.effect(function () { return disposeStyle }, 'openvikingExpand.vikaStyle()')
  // 引擎可用才注册；vika 组件关闭时 API 404，面板静默消失。
  vkRequest('/state').then(function () {
    if (VK_REGISTERED) return
    if (typeof window !== 'undefined' && window.__ovxVikaPanelRegistered === true) return
    VK_REGISTERED = true
    if (typeof window !== 'undefined') window.__ovxVikaPanelRegistered = true
    ctx.slots.inject('main', function () {
      return ctx.slots.register({ name: 'main', key: VK_PANEL_KEY }, function VkPanel() {
        return h(VkApp, { ctx: ctx })
      })
    })
    ctx.slots.inject('sidebar.panellist', function () {
      return ctx.slots.register({ name: 'sidebar.panellist', id: VK_PANEL_KEY, order: 10, label: function () { return 'vika' } }, VkPanelIcon)
    })
  }, function () {
    /* 原生引擎未启用 */
  })
}
