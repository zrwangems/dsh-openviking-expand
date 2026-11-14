/**
 * 浏览器半侧入口（片段）：把两个组件挂到 DSH 客户端。
 *
 *  consolePart —— 左侧栏 OpenViking 控制台入口 + 中间列 Studio（原 console 组件）；
 *  sidebar     —— 右侧栏 viking:// 页签（注册进 dsh-better-sidebar 的扩展点）。
 *
 * 右侧栏是软依赖：没装 dsh-better-sidebar 时只跳过页签，控制台照常工作。
 */

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
 * 让嵌入的 Studio 跟随本机 OV 配置。
 *
 * 插件不再提供连接配置界面：endpoint 和密钥全部由 Host 从本机 OV 配置解析。
 * 这里把解析结果同步成 Studio 的一条托管连接（id `dsh-console`），并切换过去；
 * 用户自己创建的连接原样保留，只是不会被自动选中。
 *
 * 旧版本会先把 localStorage 里那条「看起来合法」的旧连接（例如改配置前的
 * 127.0.0.1:1933）判为可用后提前返回，导致 Studio 与侧边栏继续连旧地址。
 * 现在只有在活动连接已经等于本机配置时才什么都不做。
 */
function ovxSeedStudioConnection(endpoint, apiKey, adminKey) {
  // Studio 嵌在同源 /studio 代理下，会把当前 origin（DSH 地址）误当成 OV 服务；
  // 另外 OV 默认 auth_mode=api_key，Studio 连接必须带 Key，否则「连接尚未验证成功」。
  try {
    if (typeof localStorage === 'undefined' || typeof location === 'undefined') return
    var keyText = typeof apiKey === 'string' ? apiKey : ''
    var adminText = typeof adminKey === 'string' ? adminKey : ''
    var target = typeof endpoint === 'string' && endpoint !== '' ? endpoint.replace(/\/+$/, '') : ''
    if (target === '') return
    var key = 'ov_console_connection_profiles'
    var parsed = null
    try {
      var raw = localStorage.getItem(key)
      if (raw !== null && raw !== '') parsed = JSON.parse(raw)
    } catch (error) { /* 旧数据解析失败就当作空 */ }
    var profiles = parsed !== null && parsed !== undefined && Array.isArray(parsed.profiles) ? parsed.profiles : []
    var activeId = parsed !== null && parsed !== undefined && typeof parsed.activeId === 'string' ? parsed.activeId : ''
    var origin = location.origin
    var active = null
    for (var index = 0; index < profiles.length; index += 1) {
      if (profiles[index] !== null && profiles[index] !== undefined && profiles[index].id === activeId) { active = profiles[index]; break }
    }
    if (active === null) active = profiles[0] !== undefined ? profiles[0] : null
    var connection = active !== null && active !== undefined && active.connection !== undefined ? active.connection : null
    var current = connection !== null && typeof connection.baseUrl === 'string' ? connection.baseUrl.replace(/\/+$/, '') : ''
    var currentKey = connection !== null && typeof connection.apiKey === 'string' ? connection.apiKey : ''
    // 活动连接已经是本机配置（并且带了密钥）：不动用户的存量设置。
    if (current === target && current !== origin && (keyText === '' || currentKey !== '')) return
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
      // 同源地址是旧版本把 DSH 地址误当 OV 服务留下的，清掉。
      if (base === origin) continue
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
  // 连接由 Host 从本机 OV 配置解析，插件页不再注册设置表单。
  ovxRequest('/bootstrap', null).then(function (payload) {
    var components = payload !== null && payload !== undefined && payload.components !== undefined && payload.components !== null
      ? payload.components
      : {}
    ovxSeedStudioConnection(
      payload !== null && payload !== undefined ? payload.endpoint : undefined,
      payload !== null && payload !== undefined ? payload.apiKey : undefined,
      payload !== null && payload !== undefined ? payload.adminKey : undefined,
    )
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
