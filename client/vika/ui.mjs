/**
 * vika 面板的公共 UI 控件（片段）。
 *
 * 风格对齐 vika 面板：DSH 设计令牌、紧凑按钮、状态点、行/卡片、
 * 筛选胶囊、确认弹窗；不引入第三方组件库。
 */

var VK_ICON_PATHS = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  question: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
  play: 'M8 5l11 7-11 7z',
  pause: 'M9 6v12M15 6v12',
  'chevron-left': 'M15 5l-7 7 7 7',
  'chevron-right': 'M9 5l7 7-7 7',
  'chevron-down': 'M5 9l7 7 7-7',
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  session: 'M4 5h16v14H4zM8 10l3 2-3 2M13 15h3',
  filter: 'M4 5h16l-6 7.5V18l-4 2v-7.5z',
  decision: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 12.5l2.5 2.5 4.5-5',
  message: 'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-5 4V6a1 1 0 0 1 1-1z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  hash: 'M10 4L8 20M16 4l-2 16M5 9h15M4 15h15',
  alert: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5.5M12 16.5h.01',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5',
  robot: 'M12 4a3 3 0 0 1 3 3v1h2a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3h2V7a3 3 0 0 1 3-3zM9 14h.01M15 14h.01',
}

function VkIcon(props) {
  var name = props.name
  var size = props.size || 16
  var path = VK_ICON_PATHS[name] || VK_ICON_PATHS.question
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
    className: props.className,
  }, h('path', { d: path }))
}

function VkButton(props) {
  var variant = props.variant || 'ghost'
  var size = props.size || 'md'
  var className = 'vk-btn vk-btn-' + variant + ' vk-btn-' + size
  if (props.busy === true) className += ' vk-btn-busy'
  if (props.className !== undefined && props.className !== '') className += ' ' + props.className
  return h('button', {
    type: 'button',
    className: className,
    disabled: props.disabled === true || props.busy === true,
    title: props.title,
    'aria-label': props['aria-label'],
    onClick: props.onClick,
  }, props.icon !== undefined && props.icon !== null ? h('span', { className: 'vk-btn-icon' }, props.icon) : null, props.children)
}

function VkTag(props) {
  var tone = props.tone || 'outline'
  return h('span', { className: 'vk-tag', 'data-tone': tone, title: props.title }, props.children)
}

function VkDot(props) {
  var state = props.state || 'idle'
  return h('span', { className: 'vk-dot-wrap', title: props.label },
    h('span', { className: 'vk-dot', 'data-state': state, 'aria-hidden': 'true' }))
}

function VkInput(props) {
  var inner = h('input', {
    type: props.type || 'text',
    value: props.value,
    placeholder: props.placeholder,
    min: props.min,
    max: props.max,
    required: props.required,
    spellCheck: false,
    onChange: props.onChange,
    onBlur: props.onBlur,
    onKeyDown: props.onKeyDown,
    'aria-label': props['aria-label'],
  })
  if (props.icon === undefined || props.icon === null) return inner
  return h('span', { className: 'vk-input' }, h('span', { className: 'vk-input-icon' }, props.icon), inner)
}

function VkSwitch(props) {
  return h('button', {
    type: 'button',
    className: 'vk-switch',
    role: 'switch',
    'aria-checked': props.checked === true,
    'aria-label': props.label,
    title: props.label,
    onClick: props.onChange,
  }, h('span', { className: 'vk-switch-thumb' }))
}

function VkPill(props) {
  return h('button', {
    type: 'button',
    className: 'vk-pill' + (props.active === true ? ' vk-pill-active' : ''),
    onClick: props.onClick,
    'aria-pressed': props.active === true,
  }, props.children)
}

function VkTabs(props) {
  return h('nav', { className: 'vk-tabs', 'aria-label': props.label },
    props.items.map(function (item) {
      var active = props.value === item.value
      return h('button', {
        key: item.value,
        type: 'button',
        role: 'tab',
        className: 'vk-tab',
        'aria-selected': active,
        onClick: function () { props.onChange(item.value) },
      }, item.label)
    }))
}

function VkSegmented(props) {
  return h('div', { className: 'vk-segmented', role: 'tablist', 'aria-label': props.label },
    props.items.map(function (item) {
      var active = props.value === item.value
      return h('button', {
        key: item.value,
        type: 'button',
        role: 'tab',
        className: 'vk-segment',
        'aria-selected': active,
        title: item.title,
        onClick: function () { props.onChange(item.value) },
      }, item.label)
    }))
}

function VkSection(props) {
  return h('section', { className: 'vk-section' },
    h('h2', { className: 'vk-section-title' },
      props.icon !== undefined ? h('span', { className: 'vk-section-icon' }, props.icon) : null,
      h('span', { className: 'vk-section-name' }, props.title),
      props.count !== undefined && props.count !== null ? h('span', { className: 'vk-count' }, String(props.count)) : null,
      props.hint !== undefined ? h('span', { className: 'vk-info', title: props.hint }, h(VkIcon, { name: 'question', size: 14 })) : null,
      props.action !== undefined && props.action !== null ? h('span', { className: 'vk-section-action' }, props.action) : null),
    props.children)
}

function VkHint(props) {
  return h('p', { className: 'vk-hint' }, props.children)
}

function VkError(props) {
  return h('p', { className: 'vk-error', role: 'alert' }, props.children)
}

function VkLabelValue(props) {
  return h('span', { className: 'vk-lv' },
    h('span', { className: 'vk-lv-label' }, props.label), ' ',
    h('span', { className: 'vk-lv-value' }, props.value))
}

function VkKeyValues(props) {
  var rows = props.rows || []
  return h('dl', { className: 'vk-kv' },
    rows.map(function (row, index) {
      return h('div', { key: index, style: { display: 'contents' } },
        h('dt', null, row[0]), h('dd', null, row[1]))
    }))
}

function VkStatusHead(props) {
  return h('div', { className: 'vk-status-head' },
    h('h2', { className: 'vk-status-title' }, props.title || '状态',
      props.hint !== undefined ? h('span', { className: 'vk-info', title: props.hint }, h(VkIcon, { name: 'question', size: 14 })) : null),
    props.action !== undefined && props.action !== null ? props.action : null)
}

function VkPageHead(props) {
  return h('div', { className: 'vk-page-head' },
    h(VkButton, { variant: 'ghost', size: 'sm', icon: h(VkIcon, { name: 'chevron-left' }), onClick: props.onBack }, props.backLabel || '返回'),
    h('div', { className: 'vk-page-title' },
      h('h2', null, props.title),
      props.children !== undefined && props.children !== null ? h('span', { className: 'vk-actions' }, props.children) : null))
}

function VkLoadState(props) {
  if (props.error !== undefined && props.error !== null && props.error !== '') return h(VkError, null, props.error)
  if (props.loading === true) return h(VkHint, null, '正在读取…')
  return null
}

function VkWhen(props) {
  return h('time', { dateTime: props.at, title: vkFullTime(props.at) }, vkWhen(props.at))
}

function VkMarkdown(props) {
  return h('div', { className: 'vk-md' }, OvxMarkdown({ text: props.text }))
}

function VkModal(props) {
  if (props.open !== true) return null
  return h('div', { className: 'vk-modal-root', role: 'dialog', 'aria-modal': 'true', 'aria-label': props.title },
    h('div', { className: 'vk-modal-mask', onClick: props.onClose }),
    h('div', { className: 'vk-modal' },
      h('div', { className: 'vk-modal-header' },
        h('h2', null, props.title),
        h('button', { type: 'button', className: 'vk-modal-close', 'aria-label': '关闭', onClick: props.onClose }, h(VkIcon, { name: 'close' }))),
      props.description !== undefined ? h('p', { className: 'vk-modal-description' }, props.description) : null,
      props.children !== undefined ? h('div', { className: 'vk-modal-body' }, props.children) : null,
      props.footer !== undefined ? h('div', { className: 'vk-modal-footer' }, props.footer) : null))
}

function VkConfirmButton(props) {
  var openPair = React.useState(false)
  var open = openPair[0]
  var setOpen = openPair[1]
  var busyPair = React.useState(false)
  var busy = busyPair[0]
  var setBusy = busyPair[1]
  var errorPair = React.useState('')
  var error = errorPair[0]
  var setError = errorPair[1]
  var confirm = function () {
    setBusy(true)
    setError('')
    Promise.resolve().then(props.onConfirm).then(function () {
      setBusy(false)
      setOpen(false)
    }, function (failure) {
      setBusy(false)
      setError(vkErrorText(failure))
    })
  }
  return h('span', { className: 'vk-confirm' },
    h(VkButton, {
      variant: props.variant || 'outline',
      icon: props.icon !== undefined ? h(VkIcon, { name: props.icon, size: 14 }) : null,
      onClick: function () { setOpen(true) },
    }, props.label),
    h(VkModal, {
      open: open,
      title: props.title,
      description: props.message,
      onClose: function () { if (!busy) setOpen(false) },
      footer: h('span', { className: 'vk-modal-actions' },
        error !== '' ? h(VkError, null, error) : null,
        h(VkButton, { variant: 'ghost', onClick: function () { if (!busy) setOpen(false) } }, '取消'),
        h(VkButton, { variant: 'primary', busy: busy, onClick: confirm }, '确定')),
    }))
}

function VkToast(props) {
  if (props.text === undefined || props.text === null || props.text === '') return null
  return h('div', { className: 'vk-toast', role: 'status' }, props.text)
}

function VkEmpty(props) {
  return h(VkHint, null, props.children || '暂无。')
}
