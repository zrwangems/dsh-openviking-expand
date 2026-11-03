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
