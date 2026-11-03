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
