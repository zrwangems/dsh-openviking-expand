/**
 * vika 面板页面（片段）。
 *
 * 六个页签：概览 / 来源 / 触发 / 评估 / 执行 / 设置。
 * 信息层级和视觉结构对齐 vika 面板；数据来自 /openviking-vika/*。
 */

/* ── 通用小组件 ─────────────────────────────────────────────────────── */

function VkDisclosure(props) {
  var pair = React.useState(props.open === true)
  var open = pair[0]
  var setOpen = pair[1]
  return h('div', { className: 'vk-disclosure' },
    h('button', {
      type: 'button',
      className: 'vk-row vk-link',
      style: { width: '100%', border: 0, background: 'none', textAlign: 'left', color: 'inherit', font: 'inherit' },
      'aria-expanded': open,
      onClick: function () { setOpen(!open) },
    },
      h('span', { className: 'vk-row-main' },
        h('span', { className: 'vk-row-title' },
          props.icon !== undefined ? h('span', { className: 'vk-section-icon' }, props.icon) : null,
          props.title,
          props.count !== undefined ? h('span', { className: 'vk-count' }, String(props.count)) : null),
        props.summary !== undefined ? h('span', { className: 'vk-row-meta' }, props.summary) : null)),
    open ? h('div', { className: 'vk-details' }, props.children) : null)
}

function VkStageMark(props) {
  var stage = props.stage
  var tone = vkStageTone(stage)
  return h('span', { className: 'vk-stage', 'data-state': tone === 'done' || tone === 'info' ? undefined : tone },
    h(VkDot, { state: tone, label: vkStageText(stage) }),
    h('span', null, vkStageText(stage)))
}

function VkTicketLine(props) {
  var ticket = props.ticket
  var app = props.app
  var stage = ticket.stage
  var tone = vkStageTone(stage)
  var report = ticket.report
  var showReport = report !== null && report !== undefined && report.summary && (stage === 'person' || stage === 'ended')
  return h('li', {
    className: 'vk-row vk-ticket',
    'data-state': stage === 'person' ? 'error' : undefined,
  },
    h('div', { className: 'vk-ticket-stage' },
      h('span', { className: 'vk-stage', 'data-state': tone === 'done' || tone === 'info' ? undefined : tone },
        h(VkDot, { state: tone, label: vkStageText(stage) }),
        h('span', null, vkStageText(stage)))),
    h('div', { className: 'vk-ticket-body' },
      h('div', { className: 'vk-row-title' },
        h('button', {
          type: 'button',
          className: 'vk-open',
          style: { position: 'static' },
          onClick: function () { app.navigate({ page: 'execution', id: ticket.id }) },
        }, ticket.title),
        ticket.speculative === true ? h(VkTag, { tone: 'neutral' }, '投机') : null),
      h('div', { className: 'vk-row-meta vk-ticket-meta' },
        ticket.source !== '' ? h('span', null, vkSourceText(ticket.source)) : null,
        ticket.actor !== '' ? h('span', null, ticket.actor) : null,
        ticket.repo !== '' ? h('span', { className: 'vk-ellipsis' }, ticket.repo) : null,
        h(VkWhen, { at: ticket.updatedAt })),
      showReport ? h('div', { className: 'vk-ticket-note vk-clamp' }, vkClip(report.summary, 180)) : null,
      h('div', { className: 'vk-ticket-actions' },
        h(VkButton, {
          variant: 'outline', size: 'sm',
          onClick: function () { app.navigate({ page: 'execution', id: ticket.id }) },
        }, '查看工单'),
        props.question === true && ticket.actions.retry === true
          ? h(VkButton, {
            variant: 'outline', size: 'sm',
            onClick: function () { app.retryTicket(ticket.id) },
          }, '重试')
          : null,
        ticket.sessionId !== '' && ticket.sessionId !== undefined
          ? h(VkButton, {
            variant: 'ghost', size: 'sm', icon: h(VkIcon, { name: 'session', size: 14 }),
            onClick: function () { app.openSession(ticket.sessionId) },
          }, '打开 Session')
          : null)))
}

function VkDecisionLine(props) {
  var decision = props.decision
  var app = props.app
  var kind = decision.kind
  var tone = kind === 'ignore' ? 'neutral' : kind === 'stop' ? 'warning' : 'info'
  var go = function () {
    if (decision.ticketId !== '' && decision.ticketId !== undefined) app.navigate({ page: 'execution', id: decision.ticketId })
    else if (decision.thread !== '') app.navigate({ page: 'trigger', id: decision.thread })
  }
  return h('li', { className: 'vk-row vk-link' },
    h('div', { className: 'vk-row-main' },
      h('div', { className: 'vk-row-title' },
        h(VkTag, { tone: tone }, vkDecisionText(kind)),
        decision.preview !== '' ? h('button', { type: 'button', className: 'vk-open', style: { position: 'static' }, onClick: go }, decision.preview) : h('span', null, vkDecisionText(kind))),
      h('div', { className: 'vk-row-meta' },
        decision.source !== '' ? h('span', null, decision.sourceLabel || vkSourceText(decision.source)) : null,
        decision.actor !== '' ? h('span', null, decision.actor) : null,
        h(VkWhen, { at: decision.at }),
        decision.reason.length > 0 ? h('span', null, vkReasonText(decision.reason)) : null)))
}

function VkTriggerItem(props) {
  var trigger = props.trigger
  var app = props.app
  var busyPair = React.useState(false)
  var busy = busyPair[0]
  var setBusy = busyPair[1]
  var reason = vkReasonText(trigger.reason)
  var tags = []
  if (trigger.state === 'evaluating') tags.push(h(VkTag, { key: 'e', tone: 'info' }, '评估中'))
  else if (trigger.state === 'routed') tags.push(h(VkTag, { key: 'r', tone: 'info' }, '直通'))
  else if (trigger.state === 'accepted') tags.push(h(VkTag, { key: 'a', tone: 'success' }, '已接单'))
  else if (trigger.filtered === true) tags.push(h(VkTag, { key: 'f', tone: 'neutral' }, '已过滤' + (reason !== '' ? '：' + reason : '')))
  else if (trigger.state === 'ignored') tags.push(h(VkTag, { key: 'i', tone: 'neutral' }, '已忽略' + (reason !== '' ? '：' + reason : '')))
  var requeue = (trigger.state === 'ignored' || trigger.filtered === true) && (trigger.ticketId === '' || trigger.ticketId === undefined)
  return h('li', { className: 'vk-event' },
    h('div', { className: 'vk-event-foot' },
      h('span', { className: 'vk-event-actor' }, trigger.actor !== '' ? trigger.actor : vkSourceText(trigger.source)),
      h('span', null, trigger.sourceLabel || vkSourceText(trigger.source)),
      h('span', null, trigger.repo !== '' ? trigger.repo : ''),
      h(VkWhen, { at: trigger.at })),
    h('p', { className: 'vk-event-text' }, trigger.preview || '（空消息）'),
    h('div', { className: 'vk-event-foot' },
      tags,
      trigger.strength === 'explicit' ? h(VkTag, { tone: 'outline' }, '明确') : null,
      trigger.ticketId !== '' && trigger.ticketId !== undefined
        ? h(VkButton, {
          variant: 'ghost', size: 'sm',
          onClick: function () { app.navigate({ page: 'execution', id: trigger.ticketId }) },
        }, '查看工单')
        : null,
      requeue
        ? h(VkButton, {
          variant: 'outline', size: 'sm', busy: busy,
          onClick: function () {
            setBusy(true)
            app.request('/triggers/' + encodeURIComponent(trigger.id) + '/requeue', { method: 'POST' })
              .then(function () { setBusy(false); app.refreshCurrent() }, function (error) { setBusy(false); app.notify(vkErrorText(error)) })
          },
        }, '重新评估')
        : null))
}

function VkThreadLine(props) {
  var thread = props.thread
  var app = props.app
  return h('li', { className: 'vk-row vk-link' },
    h('div', { className: 'vk-row-main' },
      h('div', { className: 'vk-row-title' },
        h('button', {
          type: 'button', className: 'vk-open', style: { position: 'static' },
          onClick: function () { app.navigate({ page: 'trigger', id: thread.key }) },
        }, thread.title),
        thread.subscribed === true ? h(VkTag, { tone: 'info' }, '已订阅') : null,
        thread.evaluating === true ? h(VkTag, { tone: 'warning' }, '评估中') : null),
      h('div', { className: 'vk-row-meta' },
        h('span', null, thread.sourceLabel || vkSourceText(thread.source)),
        h('span', null, '触发 ' + thread.triggerCount),
        h('span', null, '工单 ' + thread.ticketCount),
        h('span', null, 'worker ' + thread.workerCount),
        h(VkWhen, { at: thread.latestAt }))))
}

function VkRepoForm(props) {
  var app = props.app
  var formPair = React.useState({ name: '', path: '', defaultBranch: 'main' })
  var form = formPair[0]
  var setForm = formPair[1]
  var busyPair = React.useState(false)
  var busy = busyPair[0]
  var setBusy = busyPair[1]
  var edit = function (patch) { setForm({ ...form, ...patch }) }
  var submit = function () {
    if (form.name.trim() === '') { app.notify('请填写仓库名'); return }
    setBusy(true)
    app.request('/repos', { method: 'POST', body: { name: form.name, path: form.path, defaultBranch: form.defaultBranch } })
      .then(function () { setBusy(false); setForm({ name: '', path: '', defaultBranch: 'main' }); props.onDone() }, function (error) { setBusy(false); app.notify(vkErrorText(error)) })
  }
  return h('div', { className: 'vk-form', style: { gap: '8px' } },
    h('input', { className: 'vk-input-field', placeholder: '仓库名（owner/repo 或本地名）', value: form.name, onChange: function (event) { edit({ name: event.target.value }) } }),
    h('input', { className: 'vk-input-field', placeholder: '本地路径（可留空）', value: form.path, onChange: function (event) { edit({ path: event.target.value }) } }),
    h('div', { className: 'vk-actions' }, h(VkButton, { variant: 'primary', size: 'sm', busy: busy, onClick: submit }, '添加仓库')))
}

/* ── 概览 ───────────────────────────────────────────────────────────── */

function VkProblemLine(props) {
  var problem = props.problem
  var app = props.app
  var action = null
  if (problem.kind === 'paused') {
    action = h(VkConfirmButton, {
      label: '恢复处理', variant: 'outline', icon: 'play',
      title: '恢复处理', message: '恢复后继续评估、派工和发送回复。',
      onConfirm: function () { return app.request('/pause', { method: 'POST', body: { paused: false } }).then(function () { app.refreshCurrent() }) },
    })
  } else if (problem.ticketId !== undefined && problem.ticketId !== '') {
    action = h(VkButton, {
      variant: 'outline', size: 'sm',
      onClick: function () { app.navigate({ page: 'execution', id: problem.ticketId }) },
    }, '查看工单')
  }
  return h('li', { className: 'vk-row vk-link' },
    h('div', { className: 'vk-row-main' },
      h('div', { className: 'vk-row-title' },
        h(VkIcon, { name: 'alert', size: 14 }),
        h('span', null, problem.title)),
      problem.detail !== undefined ? h('p', { className: 'vk-error vk-clamp' }, problem.detail) : null,
      action !== null ? h('div', { className: 'vk-row-buttons' }, action) : null))
}

function VkOverviewPage(props) {
  var app = props.app
  var poll = vkUsePoll(function () { return app.request('/overview') }, [app.refreshTick], 5000)
  var data = poll.state.value
  if (data === null) return h(VkLoadState, { loading: poll.state.loading, error: poll.state.error })
  var stat = function (label, value, route) {
    var body = route !== undefined
      ? h('button', { type: 'button', className: 'vk-link-text vk-stat-value', onClick: function () { app.navigate(route) } }, value)
      : h('span', { className: 'vk-stat-value' }, value)
    return h('span', { className: 'vk-stat', key: label }, h('span', { className: 'vk-stat-label' }, label), body)
  }
  return h('div', { className: 'vk-main' },
    h(VkSection, { title: '待处理工单', count: data.person.length },
      data.person.length === 0
        ? h(VkHint, null, '没有待处理的工单。')
        : h('ul', { className: 'vk-list vk-cards' }, data.person.map(function (ticket) {
          return h(VkTicketLine, { key: ticket.id, ticket: ticket, app: app, question: true })
        }))),
    data.problems.length > 0
      ? h(VkSection, { title: '系统问题', count: data.problems.length },
        h('ul', { className: 'vk-list vk-cards' }, data.problems.map(function (problem, index) {
          return h(VkProblemLine, { key: index, problem: problem, app: app })
        })))
      : null,
    h(VkSection, {
      title: '过去 24 小时',
      action: h(VkButton, { variant: 'ghost', size: 'sm', onClick: function () { app.navigate({ page: 'trigger', query: { filter: 'recent' } }) } }, '详情 ›'),
    },
      h('div', { className: 'vk-stats' },
        stat('到达', data.flow.received),
        stat('被过滤', data.flow.filtered, data.flow.filtered > 0 ? { page: 'source' } : undefined),
        stat('已评估', data.flow.judged),
        stat('接单或续做', data.flow.accepted, { page: 'eval', query: { window: '24h' } }),
        data.flow.dropped > 0 ? stat('放弃发送', data.flow.dropped, { page: 'source' }) : null)),
    h(VkSection, {
      title: '执行器',
      action: h(VkButton, { variant: 'ghost', size: 'sm', onClick: function () { app.navigate({ page: 'execution' }) } }, '详情 ›'),
    },
      h('div', { className: 'vk-stats' },
        stat('执行中', data.executor.running + ' / ' + data.executor.maxWorkers),
        stat('排队', data.executor.queued),
        stat('等待新触发', data.executor.idle),
        stat('投机执行', data.executor.speculative === true ? '开' : '关'))))
}

/* ── 来源 ───────────────────────────────────────────────────────────── */

function VkSourceRow(props) {
  var source = props.source
  var app = props.app
  var openPair = React.useState(false)
  var open = openPair[0]
  var setOpen = openPair[1]
  var dot = source.state === 'off' ? 'warning' : source.state === 'running' ? 'done' : 'idle'
  var label = source.state === 'off' ? '已关闭' : source.state === 'running' ? '运行中' : '暂无事件'
  return h('li', { className: 'vk-row' },
    h(VkDot, { state: dot, label: label }),
    h('div', { className: 'vk-row-main' },
      h('div', { className: 'vk-row-title' },
        h('span', { className: 'vk-row-name' }, source.title),
        h('span', { className: 'vk-status-text', 'data-state': dot === 'warning' ? 'warning' : undefined }, label)),
      h('div', { className: 'vk-row-meta' },
        h(VkLabelValue, { label: '24 小时到达', value: source.stats.received }),
        source.stats.filtered > 0 ? h(VkLabelValue, { label: '被过滤', value: source.stats.filtered }) : null,
        source.stats.lastAt !== '' ? h(VkLabelValue, { label: '最近', value: vkWhen(source.stats.lastAt) }) : null),
      h(VkHint, null, source.note),
      source.filtered.length > 0
        ? h(VkDisclosure, {
          icon: h(VkIcon, { name: 'filter', size: 14 }),
          title: '24 小时内最近被过滤的触发',
          count: source.filtered.length,
          open: open,
          onToggle: function () { setOpen(!open) },
        },
          h('ul', { className: 'vk-list' }, source.filtered.map(function (trigger) {
            return h('li', { key: trigger.id, className: 'vk-row' },
              h(VkDot, { state: 'idle' }),
              h('div', { className: 'vk-row-main' },
                h('div', { className: 'vk-row-title' }, (trigger.actor || source.title) + '：' + (trigger.preview || '（空消息）')),
                h('div', { className: 'vk-row-meta' },
                  h(VkTag, { tone: 'neutral' }, vkReasonText(trigger.reason) || '已过滤'),
                  h(VkWhen, { at: trigger.at }),
                  h(VkButton, {
                    variant: 'ghost', size: 'sm',
                    onClick: function () { app.navigate({ page: 'trigger', id: trigger.thread }) },
                  }, '查看线程'))))
          })))
        : null))
}

function VkSourcePage(props) {
  var app = props.app
  var poll = vkUsePoll(function () { return app.request('/sources') }, [app.refreshTick], 5000)
  var data = poll.state.value
  if (data === null) return h(VkLoadState, { loading: poll.state.loading, error: poll.state.error })
  var repos = data.repos || []
  return h('div', { className: 'vk-form' },
    h(VkStatusHead, {
      hint: '每个渠道是否在运行、过去 24 小时到达和被过滤的触发，以及被过滤的原因。飞书/GitHub 的凭据由 Vika 容器管理，这里不保存。',
      action: h(VkButton, {
        variant: 'ghost', size: 'sm', icon: h(VkIcon, { name: 'settings' }),
        onClick: function () { app.navigate({ page: 'settings', query: { group: 'source' } }) },
      }, '设置'),
    }),
    h('ul', { className: 'vk-list' }, data.sources.map(function (source) {
      return h(VkSourceRow, { key: source.id, source: source, app: app })
    })),
    h(VkSection, { title: 'Vika 管理的仓库', count: repos.length },
      repos.length === 0
        ? h(VkHint, null, '还没有仓库。Vika 是 router，可以在这里登记需要管理的仓库。')
        : h('ul', { className: 'vk-list' }, repos.map(function (repo) {
          return h('li', { key: repo.name, className: 'vk-row' },
            h('div', { className: 'vk-row-main' },
              h('div', { className: 'vk-row-title' }, repo.name + '（' + repo.defaultBranch + '）'),
              h('div', { className: 'vk-row-meta' }, repo.path !== '' ? h('span', { className: 'vk-mono' }, repo.path) : null)),
            h(VkButton, {
              variant: 'ghost', size: 'sm', icon: h(VkIcon, { name: 'trash', size: 14 }),
              onClick: function () {
                app.request('/repos/remove', { method: 'POST', body: { name: repo.name } })
                  .then(function () { app.refreshCurrent() }, function (error) { app.notify(vkErrorText(error)) })
              },
            }, '移除'))
        }))),
    h(VkSection, { title: '登记仓库' }, h(VkRepoForm, { app: app, onDone: function () { app.refreshCurrent() } })))
}

/* ── 触发 / 线程 ────────────────────────────────────────────────────── */

var VK_THREAD_FILTERS = [
  ['subscribed', '已被订阅'],
  ['evaluating', '评估中'],
  ['recent', '24 小时内有新触发'],
  ['all', '全部线程'],
]

function VkTriggerPage(props) {
  var app = props.app
  var filter = app.route.query && app.route.query.filter ? app.route.query.filter : 'subscribed'
  var poll = vkUsePoll(function () { return app.request('/threads?filter=' + encodeURIComponent(filter)) }, [filter, app.refreshTick], 5000)
  var data = poll.state.value
  return h('div', { className: 'vk-form' },
    h(VkStatusHead, {
      hint: '触发按线程归组；线程决定它们扇出给哪些工单、由哪次评估处理。',
      action: h(VkButton, {
        variant: 'ghost', size: 'sm', icon: h(VkIcon, { name: 'settings' }),
        onClick: function () { app.navigate({ page: 'settings', query: { group: 'source' } }) },
      }, '设置'),
    }),
    h('div', { className: 'vk-filters' }, VK_THREAD_FILTERS.map(function (item) {
      return h(VkPill, {
        key: item[0], active: filter === item[0],
        onClick: function () { app.navigate({ page: 'trigger', query: item[0] === 'subscribed' ? {} : { filter: item[0] } }, true) },
      }, item[1])
    })),
    data === null
      ? h(VkLoadState, { loading: poll.state.loading, error: poll.state.error })
      : data.items.length === 0
        ? h(VkHint, null, '没有符合条件的线程。')
        : h('ul', { className: 'vk-list' }, data.items.map(function (thread) {
          return h(VkThreadLine, { key: thread.key, thread: thread, app: app })
        })))
}

function VkThreadPage(props) {
  var app = props.app
  var key = app.route.id
  var poll = vkUsePoll(function () { return app.request('/threads/' + encodeURIComponent(key)) }, [key, app.refreshTick], 5000)
  var data = poll.state.value
  if (data === null) {
    return h('div', { className: 'vk-form' },
      h(VkPageHead, { title: '线程', backLabel: '触发', onBack: function () { app.navigate({ page: 'trigger' }) } }),
      h(VkLoadState, { loading: poll.state.loading, error: poll.state.error }))
  }
  return h('div', { className: 'vk-form' },
    h(VkPageHead, { title: data.title, backLabel: '触发', onBack: function () { app.navigate({ page: 'trigger' }) } }),
    h('div', { className: 'vk-row-meta vk-status-line' },
      h('span', null, data.sourceLabel || vkSourceText(data.source)),
      h(VkLabelValue, { label: '最近', value: vkWhen(data.latestAt) }),
      h(VkLabelValue, { label: '创建', value: vkWhen(data.createdAt) })),
    data.evaluatingInfo !== null && data.evaluatingInfo !== undefined
      ? h('p', { className: 'vk-banner' }, '评估进行中：' + data.evaluatingInfo.count + ' 条触发，' + (data.evaluatingInfo.strength === 'explicit' ? '明确' : '推断') + '，' + vkWhen(data.evaluatingInfo.deadline) + ' 到期。')
      : null,
    data.tickets.length > 0
      ? h(VkSection, { title: '订阅此线程的工单', count: data.tickets.length },
        h('ul', { className: 'vk-list' }, data.tickets.map(function (ticket) {
          return h(VkTicketLine, { key: ticket.id, ticket: ticket, app: app })
        })))
      : null,
    data.decisions.length > 0
      ? h(VkDisclosure, {
        icon: h(VkIcon, { name: 'decision', size: 14 }),
        title: '这个线程的决定',
        count: data.decisions.length,
      }, h('ul', { className: 'vk-list' }, data.decisions.map(function (decision) {
        return h(VkDecisionLine, { key: decision.id, decision: decision, app: app })
      })))
      : null,
    h(VkSection, { title: '触发时间线', count: '最新在前' },
      data.triggers.length === 0
        ? h(VkHint, null, '没有保留的触发。')
        : h('ol', { className: 'vk-timeline' }, data.triggers.map(function (trigger) {
          return h(VkTriggerItem, { key: trigger.id, trigger: trigger, app: app })
        }))),
    data.subscribed === true
      ? h('div', { className: 'vk-danger-zone' },
        h('span', { className: 'vk-hint' }, '取消订阅后，这个线程的新触发不再直通给已订阅的 worker；worker 本身不会结束。'),
        h(VkConfirmButton, {
          label: '取消订阅', variant: 'outline',
          title: '取消订阅', message: '取消后，这个线程的新触发不再直通给工单，直到下一次接单或关联。',
          onConfirm: function () {
            return app.request('/threads/' + encodeURIComponent(key) + '/unsubscribe', { method: 'POST' })
              .then(function () { app.refreshCurrent() })
          },
        }))
      : null)
}

/* ── 评估 ───────────────────────────────────────────────────────────── */

var VK_DECISION_FILTERS = [
  ['work', '接单与续做'],
  ['stop', '停止'],
  ['ignore', '忽略'],
  ['unavailable', '未完成'],
  ['all', '全部'],
]

function VkEvalPage(props) {
  var app = props.app
  var filter = app.route.query && app.route.query.filter ? app.route.query.filter : 'work'
  var window = app.route.query && app.route.query.window ? app.route.query.window : ''
  var poll = vkUsePoll(function () {
    return app.request('/decisions?filter=' + encodeURIComponent(filter) + (window !== '' ? '&window=' + encodeURIComponent(window) : ''))
  }, [filter, window, app.refreshTick], 5000)
  var overview = vkUsePoll(function () { return app.request('/overview') }, [app.refreshTick], 5000)
  var data = poll.state.value
  var paused = overview.state.value !== null && overview.state.value !== undefined && overview.state.value.executor.paused === true
  var show = function (key, last24h) {
    var query = {}
    if (key !== 'work') query.filter = key
    if (last24h) query.window = '24h'
    app.navigate({ page: 'eval', query: query }, true)
  }
  return h('div', { className: 'vk-form' },
    h(VkStatusHead, {
      hint: '评估按策略对触发做出的决定，每条写明理由。',
      action: h(VkButton, {
        variant: 'ghost', size: 'sm', icon: h(VkIcon, { name: 'settings' }),
        onClick: function () { app.navigate({ page: 'settings', query: { group: 'eval' } }) },
      }, '设置'),
    }),
    paused ? h('p', { className: 'vk-banner' }, '处理已暂停：新的触发会被记录，但不会被评估。') : null,
    h('div', { className: 'vk-filters' },
      VK_DECISION_FILTERS.map(function (item) {
        return h(VkPill, { key: item[0], active: filter === item[0], onClick: function () { show(item[0], window === '24h') } }, item[1])
      }),
      window === '24h'
        ? h('span', { className: 'vk-filter-gap' })
        : null,
      window === '24h' ? h(VkPill, { active: true, onClick: function () { show(filter, false) } }, '仅过去 24 小时到达的触发 ✕') : null),
    data === null
      ? h(VkLoadState, { loading: poll.state.loading, error: poll.state.error })
      : data.items.length === 0
        ? h(VkHint, null, '暂无。')
        : h('ul', { className: 'vk-list' }, data.items.map(function (decision) {
          return h(VkDecisionLine, { key: decision.id, decision: decision, app: app })
        })))
}

/* ── 执行 / 工单 ────────────────────────────────────────────────────── */

var VK_TICKET_FILTERS = [
  ['open', '进行中'],
  ['person', '待处理'],
  ['working', '执行中'],
  ['idle', '等待新触发'],
  ['ended', '已结束'],
]

function VkExecutionPage(props) {
  var app = props.app
  var filter = app.route.query && app.route.query.filter ? app.route.query.filter : 'open'
  var tickets = vkUsePoll(function () { return app.request('/tickets?filter=' + encodeURIComponent(filter)) }, [filter, app.refreshTick], 5000)
  var overview = vkUsePoll(function () { return app.request('/overview') }, [app.refreshTick], 5000)
  var data = tickets.state.value
  var summary = overview.state.value
  var paused = summary !== null && summary !== undefined && summary.executor.paused === true
  return h('div', { className: 'vk-form' },
    h(VkStatusHead, {
      hint: '执行器的状态，以及按在等谁分组的工单。',
      action: h(VkButton, {
        variant: 'ghost', size: 'sm', icon: h(VkIcon, { name: 'settings' }),
        onClick: function () { app.navigate({ page: 'settings', query: { group: 'execution' } }) },
      }, '设置'),
    }),
    h('div', { className: 'vk-row-meta vk-status-line' },
      h('span', { className: 'vk-status-text', 'data-state': paused ? 'warning' : undefined }, paused ? '处理已暂停' : '执行器运行中'),
      summary !== null && summary !== undefined
        ? h('span', null, h(VkLabelValue, { label: '执行中', value: summary.executor.running + ' / ' + summary.executor.maxWorkers }),
          h(VkLabelValue, { label: '排队', value: summary.executor.queued }))
        : null,
      h(VkConfirmButton, {
        label: paused ? '恢复处理' : '暂停处理',
        variant: 'outline',
        icon: paused ? 'play' : 'pause',
        title: paused ? '恢复处理' : '暂停处理',
        message: paused ? '恢复后继续评估、派工和发送回复。' : '暂停后，来源继续记录触发，但不开始新的评估、不派工，直到恢复。',
        onConfirm: function () {
          return app.request('/pause', { method: 'POST', body: { paused: !paused } })
            .then(function () { app.refreshCurrent() })
        },
      })),
    h('div', { className: 'vk-filters' }, VK_TICKET_FILTERS.map(function (item) {
      return h(VkPill, {
        key: item[0], active: filter === item[0],
        onClick: function () { app.navigate({ page: 'execution', query: item[0] === 'open' ? {} : { filter: item[0] } }, true) },
      }, item[1])
    })),
    filter === 'idle' ? h(VkHint, null, '执行器结束了当前回合、没有提出问题；这些工单订阅的线程收到新触发时继续。') : null,
    data === null
      ? h(VkLoadState, { loading: tickets.state.loading, error: tickets.state.error })
      : data.items.length === 0
        ? h(VkHint, null, '暂无。')
        : h('ul', { className: 'vk-list' }, data.items.map(function (ticket) {
          return h(VkTicketLine, { key: ticket.id, ticket: ticket, app: app, question: filter === 'person' })
        })))
}

function VkTicketPage(props) {
  var app = props.app
  var id = app.route.id
  var poll = vkUsePoll(function () { return app.request('/tickets/' + encodeURIComponent(id)) }, [id, app.refreshTick], 5000)
  var data = poll.state.value
  if (data === null) {
    return h('div', { className: 'vk-form' },
      h(VkPageHead, { title: '工单', backLabel: '执行', onBack: function () { app.navigate({ page: 'execution' }) } }),
      h(VkLoadState, { loading: poll.state.loading, error: poll.state.error }))
  }
  var retry = function () {
    app.request('/tickets/' + encodeURIComponent(id) + '/retry', { method: 'POST' })
      .then(function () { app.refreshCurrent() }, function (error) { app.notify(vkErrorText(error)) })
  }
  var stop = function () {
    app.request('/tickets/' + encodeURIComponent(id) + '/stop', { method: 'POST' })
      .then(function () { app.refreshCurrent() }, function (error) { app.notify(vkErrorText(error)) })
  }
  var report = data.report
  return h('div', { className: 'vk-form' },
    h(VkPageHead, {
      title: data.title,
      backLabel: '执行', onBack: function () { app.navigate({ page: 'execution' }) },
    },
      data.actions.retry === true
        ? h(VkButton, { variant: 'outline', size: 'sm', icon: h(VkIcon, { name: 'refresh', size: 14 }), onClick: retry }, '重试')
        : null,
      data.sessionId !== '' && data.sessionId !== undefined
        ? h(VkButton, {
          variant: 'outline', size: 'sm', icon: h(VkIcon, { name: 'session', size: 14 }),
          onClick: function () { app.openSession(data.sessionId) },
        }, '打开 Session')
        : null),
    h('div', { className: 'vk-row-meta vk-status-line' },
      h(VkStageMark, { stage: data.stage }),
      data.speculative === true ? h(VkTag, { tone: 'neutral' }, '投机') : null,
      h(VkLabelValue, { label: '来源', value: (data.sourceLabel || vkSourceText(data.source)) + (data.actor !== '' ? ' · ' + data.actor : '') }),
      h(VkLabelValue, { label: '更新', value: vkWhen(data.updatedAt) })),
    report !== null && report !== undefined && report.summary
      ? h('div', { className: 'vk-banner' + (data.stage === 'person' ? ' vk-danger' : '') },
        h('span', { className: 'vk-banner-label' }, data.stage === 'person' ? '受阻：' : '报告：'),
        h(VkMarkdown, { text: report.summary }))
      : null,
    h(VkSection, { title: '来源与决定' },
      h(VkKeyValues, {
        rows: [
          ['工单 id', h('span', { className: 'vk-mono' }, data.id)],
          ['仓库', data.repo !== '' ? data.repo : '—'],
          ['线程', data.thread],
          ['触发', data.trigger !== null ? h('button', {
            type: 'button', className: 'vk-link-text vk-clamp',
            onClick: function () { app.navigate({ page: 'trigger', id: data.trigger.thread }) },
          }, data.trigger.preview || '（空消息）') : '—'],
          ['决定', data.decision !== null ? vkDecisionText(data.decision.kind) + (data.decision.reason.length > 0 ? ' · ' + vkReasonText(data.decision.reason) : '') : '—'],
          ['Session', data.sessionId !== '' && data.sessionId !== undefined ? h('span', { className: 'vk-mono' }, data.sessionId) : '—'],
        ],
      })),
    data.threads.length > 0
      ? h(VkSection, { title: '订阅的线程', count: data.threads.length },
        h('ul', { className: 'vk-list' }, data.threads.map(function (thread) {
          return h(VkThreadLine, { key: thread.key, thread: thread, app: app })
        })))
      : null,
    h(VkSection, { title: '派工记录', count: data.assignments.length },
      data.assignments.length === 0
        ? h(VkHint, null, '还没有派工。')
        : h('ul', { className: 'vk-list' }, data.assignments.map(function (item, index) {
          return h('li', { key: item.id, className: 'vk-row' },
            h(VkDot, { state: item.state === 'running' ? 'ongoing' : item.state === 'ended' ? 'done' : 'idle', label: item.state }),
            h('div', { className: 'vk-row-main' },
              h('div', { className: 'vk-row-title' }, '第 ' + (data.assignments.length - index) + ' 次派工 · ' + item.state),
              h('div', { className: 'vk-row-meta' },
                h('span', null, vkWhen(item.createdAt) + ' → ' + (item.endedAt !== null ? vkWhen(item.endedAt) : '现在')),
                item.sessionId !== '' ? h('span', { className: 'vk-mono' }, item.sessionId) : null,
                item.report !== null && item.report !== undefined
                  ? h('span', null, (item.report.state || '') + (item.report.summary ? ' · ' + vkClip(item.report.summary, 80) : ''))
                  : null),
              item.sessionId !== ''
                ? h('div', { className: 'vk-row-buttons' },
                  h(VkButton, {
                    variant: 'ghost', size: 'sm', icon: h(VkIcon, { name: 'session', size: 14 }),
                    onClick: function () { app.openSession(item.sessionId) },
                  }, '打开 Session'))
                : null))
        }))),
    data.actions.stop === true
      ? h('div', { className: 'vk-danger-zone' },
        h('span', { className: 'vk-hint' }, '停止后当前派工结束，Session 和工作目录保留；之后线程里的消息不再恢复它，要继续需要重新接单。'),
        h(VkConfirmButton, {
          label: '停止工单', variant: 'outline',
          title: '停止工单',
          message: '停止“' + data.title + '”？当前派工结束，Session 和执行目录保留；停止后线程里的消息不再恢复它。',
          onConfirm: stop,
        }))
      : null)
}

/* ── 设置 ───────────────────────────────────────────────────────────── */

var VK_SETTINGS_GROUPS = [
  ['source', '来源'],
  ['eval', '评估'],
  ['execution', '执行'],
  ['prompts', '提示词'],
  ['deployment', '部署'],
]

function VkSaveBar(props) {
  return h('div', { className: 'vk-savebar' },
    props.error !== '' && props.error !== undefined ? h(VkError, null, props.error) : h(VkHint, null, props.hint || ''),
    h(VkButton, { variant: 'ghost', onClick: props.onDiscard, disabled: props.busy === true }, '放弃'),
    h(VkButton, { variant: 'primary', busy: props.busy === true, onClick: props.onSave }, '保存'))
}

function VkHistory(props) {
  var history = props.history || []
  if (history.length === 0) return h(VkHint, null, '还没有记录的保存历史。')
  return h('ul', { className: 'vk-history' }, history.map(function (item, index) {
    return h('li', { key: index }, '第 ' + item.revision + ' 次保存 · ' + item.block + ' · ' + vkWhen(item.at))
  }))
}

function VkChannelSettings(props) {
  var app = props.app
  var data = props.data
  var channels = data.blocks.channels
  var busyPair = React.useState(false)
  var busy = busyPair[0]
  var setBusy = busyPair[1]
  var save = function (patch) {
    setBusy(true)
    app.request('/settings/channels', { method: 'PUT', body: { value: patch, revision: channels.revision } })
      .then(function () { setBusy(false); app.refreshCurrent() }, function (error) { setBusy(false); app.notify(vkErrorText(error)) })
  }
  var value = channels.value
  var toggle = function (key) { save({ [key]: value[key] !== false }) }
  var row = function (key, label, hint) {
    return h('div', { className: 'vk-switch-row' },
      h('span', null, label, hint !== undefined ? h('small', { className: 'vk-hint', style: { marginLeft: '8px' } }, hint) : null),
      h(VkSwitch, { checked: value[key] !== false, label: label, onChange: function () { toggle(key) } }))
  }
  return h('div', { className: 'vk-form' },
    h('div', { className: 'vk-block' },
      h('h2', { className: 'vk-block-title' }, '渠道'),
      row('feishu', '飞书', '由 Vika 容器消费'),
      row('github', 'GitHub', '由 Vika 容器消费'),
      row('bridge', '本地桥', 'Vika 通过它驱动引擎'),
      row('subscribe', '订阅直通', '同一线程的后续事件直接投递给 worker'),
      h(VkHint, null, '飞书/GitHub 的 App 凭据、机器人检查和接收范围在 Vika 侧配置；这里只控制引擎是否接受该来源的 trigger。')),
    h('div', { className: 'vk-block' },
      h('h2', { className: 'vk-block-title' }, '设置历史'),
      h(VkHistory, { history: data.history })),
    busy ? h(VkHint, null, '正在保存…') : null)
}

function VkRuleEditor(props) {
  var rules = props.rules
  var onChange = props.onChange
  var update = function (index, patch) {
    onChange(rules.map(function (rule, position) { return position === index ? { ...rule, ...patch } : rule }))
  }
  var add = function () {
    onChange(rules.concat({ id: 'rule-' + Date.now().toString(36), name: '', enabled: true, when: {}, action: 'require-explicit' }))
  }
  return h('div', { className: 'vk-form' },
    h(VkSection, { title: '程序层规则', count: rules.length, action: h(VkButton, { variant: 'ghost', size: 'sm', icon: h(VkIcon, { name: 'plus', size: 14 }), onClick: add }, '添加规则') },
      h(VkHint, null, '规则在事件进入时做确定性过滤：命中 ignore 直接忽略，require-explicit 只接受明确请求，candidate 进入评估。'),
      rules.length === 0
        ? h(VkHint, null, '暂无规则，不会主动接单。')
        : h('ul', { className: 'vk-rule-list' }, rules.map(function (rule, index) {
          var when = rule.when || {}
          return h('li', { key: rule.id || index, className: 'vk-rule' },
            h('div', { className: 'vk-rule-main' },
              h('div', { className: 'vk-rule-title' }, rule.name || '新规则'),
              h('div', { className: 'vk-rule-meta' }, '来源 ' + (when.source || '全部') + ' · 动作 ' + (rule.action || 'require-explicit')),
              h('div', { className: 'vk-rule-body' },
                h('input', { className: 'vk-input-field', placeholder: '规则名称', value: rule.name || '', onChange: function (event) { update(index, { name: event.target.value }) } }),
                h('select', {
                  className: 'vk-select', value: when.source || '', onChange: function (event) {
                    var next = { ...when }
                    if (event.target.value === '') delete next.source
                    else next.source = event.target.value
                    update(index, { when: next })
                  },
                },
                  h('option', { value: '' }, '全部来源'),
                  h('option', { value: 'feishu' }, '飞书'),
                  h('option', { value: 'github' }, 'GitHub'),
                  h('option', { value: 'manual' }, '手动'),
                  h('option', { value: 'api' }, 'API')),
                h('input', { className: 'vk-input-field', placeholder: '仓库（可选，owner/repo）', value: when.repo || '', onChange: function (event) { var next = { ...when }; if (event.target.value === '') delete next.repo; else next.repo = event.target.value; update(index, { when: next }) } }),
                h('input', { className: 'vk-input-field', placeholder: '发送者（可选）', value: when.actor || '', onChange: function (event) { var next = { ...when }; if (event.target.value === '') delete next.actor; else next.actor = event.target.value; update(index, { when: next }) } }),
                h('select', { className: 'vk-select', value: rule.action || 'require-explicit', onChange: function (event) { update(index, { action: event.target.value }) } },
                  h('option', { value: 'candidate' }, '进入评估（candidate）'),
                  h('option', { value: 'require-explicit' }, '只接受明确请求（require-explicit）'),
                  h('option', { value: 'ignore' }, '忽略（ignore）')),
                h('div', { className: 'vk-actions' },
                  h(VkButton, {
                    variant: 'ghost', size: 'sm', icon: h(VkIcon, { name: 'trash', size: 14 }),
                    onClick: function () { onChange(rules.filter(function (_, position) { return position !== index })) },
                  }, '删除')))),
            h(VkSwitch, { checked: rule.enabled !== false, label: '启用规则', onChange: function () { update(index, { enabled: rule.enabled === false }) } }))
        }))))
}

function VkEvalSettings(props) {
  var app = props.app
  var data = props.data
  var evalBlock = data.blocks.eval
  var policyBlock = data.blocks.policy
  var modePair = React.useState(evalBlock.value.mode || 'observe')
  var mode = modePair[0]
  var setMode = modePair[1]
  var rulesPair = React.useState(Array.isArray(policyBlock.value.rules) ? policyBlock.value.rules : [])
  var rules = rulesPair[0]
  var setRules = rulesPair[1]
  var advancedPair = React.useState(JSON.stringify({ sources: policyBlock.value.sources || {}, repos: policyBlock.value.repos || {} }, null, 2))
  var advanced = advancedPair[0]
  var setAdvanced = advancedPair[1]
  var busyPair = React.useState(false)
  var busy = busyPair[0]
  var setBusy = busyPair[1]
  var errorPair = React.useState('')
  var error = errorPair[0]
  var setError = errorPair[1]
  var save = function () {
    var parsed = null
    try { parsed = JSON.parse(advanced) } catch (failure) { setError('高级策略不是合法 JSON：' + vkErrorText(failure)); return }
    setBusy(true)
    setError('')
    var policyValue = { rules: rules, sources: parsed.sources || {}, repos: parsed.repos || {} }
    Promise.resolve()
      .then(function () { return app.request('/settings/eval', { method: 'PUT', body: { value: { mode: mode }, revision: evalBlock.revision } }) })
      .then(function () { return app.request('/settings/policy', { method: 'PUT', body: { value: policyValue, revision: policyBlock.revision } }) })
      .then(function () { setBusy(false); app.refreshCurrent() }, function (failure) { setBusy(false); setError(vkErrorText(failure)) })
  }
  return h('div', { className: 'vk-form' },
    h('div', { className: 'vk-block' },
      h('h2', { className: 'vk-block-title' }, '评估设置'),
      h('div', { className: 'vk-field' },
        h('span', null, '接单模式'),
        h(VkSegmented, {
          label: '接单模式', value: mode, onChange: setMode,
          items: [{ value: 'observe', label: '仅观察' }, { value: 'auto', label: '自动接单' }],
        }),
        h(VkHint, null, mode === 'auto' ? '显式请求直接接单；其他事件仍等 Vika Router 判断。' : '所有事件先进入待评估，由 Vika Router 决定接单或忽略。'))),
    VkRuleEditor({ rules: rules, onChange: setRules }),
    h('div', { className: 'vk-block' },
      h('h2', { className: 'vk-block-title' }, '高级策略（JSON）'),
      h('textarea', {
        className: 'vk-textarea', value: advanced, spellCheck: false,
        onChange: function (event) { setAdvanced(event.target.value) },
        style: { minHeight: '180px', fontFamily: 'var(--ds-font-family-code, Menlo, monospace)', fontSize: '12px' },
      }),
      h(VkHint, null, 'sources：每个来源的模式与允许发送者；repos：allow/deny 仓库白名单。')),
    h(VkSaveBar, { busy: busy, error: error, hint: '评估模式与规则会生成新的设置版本。', onDiscard: function () { app.refreshCurrent() }, onSave: save }))
}

function VkExecutionSettings(props) {
  var app = props.app
  var data = props.data
  var block = data.blocks.executor
  var maxPair = React.useState(String(block.value.maxWorkers || 3))
  var maxWorkers = maxPair[0]
  var setMaxWorkers = maxPair[1]
  var speculativePair = React.useState(block.value.speculative === true)
  var speculative = speculativePair[0]
  var setSpeculative = speculativePair[1]
  var pausedPair = React.useState(block.value.paused === true)
  var paused = pausedPair[0]
  var setPaused = pausedPair[1]
  var busyPair = React.useState(false)
  var busy = busyPair[0]
  var setBusy = busyPair[1]
  var errorPair = React.useState('')
  var error = errorPair[0]
  var setError = errorPair[1]
  var save = function () {
    setBusy(true)
    setError('')
    app.request('/settings/executor', {
      method: 'PUT',
      body: { value: { maxWorkers: Number(maxWorkers), speculative: speculative, paused: paused }, revision: block.revision },
    }).then(function () { setBusy(false); app.refreshCurrent() }, function (failure) { setBusy(false); setError(vkErrorText(failure)) })
  }
  return h('div', { className: 'vk-form' },
    h('div', { className: 'vk-block' },
      h('h2', { className: 'vk-block-title' }, '执行器'),
      h('div', { className: 'vk-field' },
        h('span', null, '并行 worker 数'),
        h('input', { className: 'vk-input-field', type: 'number', min: 1, max: 10, value: maxWorkers, onChange: function (event) { setMaxWorkers(event.target.value) } }),
        h(VkHint, null, '超过并发上限的工单排队等待。')),
      h('div', { className: 'vk-switch-row' }, h('span', null, '投机执行'), h(VkSwitch, { checked: speculative, label: '投机执行', onChange: function () { setSpeculative(!speculative) } })),
      h('div', { className: 'vk-switch-row' }, h('span', null, '暂停处理'), h(VkSwitch, { checked: paused, label: '暂停处理', onChange: function () { setPaused(!paused) } })),
      h(VkHint, null, 'worker 模型继承 DSH 当前默认值；每个 worker 都是真实 DSH Session。')),
    h(VkSaveBar, { busy: busy, error: error, hint: '保存后立即生效。', onDiscard: function () { app.refreshCurrent() }, onSave: save }))
}

function VkPromptSettings(props) {
  var app = props.app
  var data = props.data
  var block = data.blocks.prompts
  var textPair = React.useState(block.value.workerHeader || '')
  var text = textPair[0]
  var setText = textPair[1]
  var busyPair = React.useState(false)
  var busy = busyPair[0]
  var setBusy = busyPair[1]
  var errorPair = React.useState('')
  var error = errorPair[0]
  var setError = errorPair[1]
  var save = function () {
    setBusy(true)
    setError('')
    app.request('/settings/prompts', { method: 'PUT', body: { value: { workerHeader: text }, revision: block.revision } })
      .then(function () { setBusy(false); app.refreshCurrent() }, function (failure) { setBusy(false); setError(vkErrorText(failure)) })
  }
  return h('div', { className: 'vk-form' },
    h('div', { className: 'vk-block' },
      h('h2', { className: 'vk-block-title' }, 'worker 提示词'),
      h('textarea', {
        className: 'vk-textarea', value: text, spellCheck: false,
        onChange: function (event) { setText(event.target.value) },
        style: { minHeight: '200px', fontFamily: 'var(--ds-font-family-code, Menlo, monospace)', fontSize: '12px' },
      }),
      h(VkHint, null, '留空使用内置的 worker 头；只影响新建 worker。')),
    h(VkSaveBar, { busy: busy, error: error, hint: '保存后用于新建 worker。', onDiscard: function () { app.refreshCurrent() }, onSave: save }))
}

function VkDeploymentSettings(props) {
  var app = props.app
  var data = props.data
  var deployment = data.deployment || {}
  return h('div', { className: 'vk-form' },
    h('div', { className: 'vk-block' },
      h('h2', { className: 'vk-block-title' }, '部署信息'),
      h(VkKeyValues, {
        rows: [
          ['状态目录', h('span', { className: 'vk-mono' }, deployment.stateDir || '—')],
          ['工作区', h('span', { className: 'vk-mono' }, deployment.workspace || '—')],
          ['仓库根目录', h('span', { className: 'vk-mono' }, deployment.reposRoot || '—')],
          ['任务根目录', h('span', { className: 'vk-mono' }, deployment.tasksRoot || '—')],
          ['桥', h('span', { className: 'vk-mono' }, (deployment.bridge ? deployment.bridge.host + ':' + deployment.bridge.port : '—'))],
          ['平台', (deployment.platform || '—') + ' · ' + (deployment.node || '')],
        ],
      }),
      h(VkHint, null, '工作区、桥地址和 GitHub 身份在 DSH 插件页的 vika 设置里修改，保存后需要重启 dsh web 生效。')),
    h('div', { className: 'vk-block' },
      h('h2', { className: 'vk-block-title' }, '保存历史'),
      h(VkHistory, { history: data.history })))
}

function VkSettingsPage(props) {
  var app = props.app
  var group = app.route.query && app.route.query.group ? app.route.query.group : 'source'
  var poll = vkUsePoll(function () { return app.request('/settings') }, [app.refreshTick], 5000)
  var data = poll.state.value
  var content = null
  if (data !== null) {
    if (group === 'source') content = h(VkChannelSettings, { app: app, data: data })
    else if (group === 'eval') content = h(VkEvalSettings, { app: app, data: data })
    else if (group === 'execution') content = h(VkExecutionSettings, { app: app, data: data })
    else if (group === 'prompts') content = h(VkPromptSettings, { app: app, data: data })
    else content = h(VkDeploymentSettings, { app: app, data: data })
  }
  return h('div', { className: 'vk-settings' },
    h('nav', { className: 'vk-settings-nav', 'aria-label': '设置分组' },
      VK_SETTINGS_GROUPS.map(function (item) {
        return h('button', {
          key: item[0], type: 'button', className: 'vk-settings-link',
          'aria-current': group === item[0] ? 'page' : undefined,
          onClick: function () { app.navigate({ page: 'settings', query: { group: item[0] } }, true) },
        }, item[1])
      })),
    h('div', { className: 'vk-settings-body' },
      h('h2', { className: 'vk-settings-title' }, (VK_SETTINGS_GROUPS.find(function (item) { return item[0] === group }) || ['', '设置'])[1]),
      data === null
        ? h(VkLoadState, { loading: poll.state.loading, error: poll.state.error })
        : h('div', { key: group + '-' + (data.blocks.channels.revision + '-' + data.blocks.eval.revision + '-' + data.blocks.executor.revision + '-' + data.blocks.policy.revision + '-' + data.blocks.prompts.revision) }, content)))
}
