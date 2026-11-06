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
