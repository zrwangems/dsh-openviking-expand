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
  var tabPair = React.useState('openviking')
  var tab = tabPair[0]
  var setTab = tabPair[1]

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

  var tabs = h('div', { style: { display: 'flex', gap: '8px', marginBottom: '14px' } },
    [['openviking', 'OpenViking'], ['vika', 'vika']].map(function (item) {
      return h('div', {
        key: item[0],
        onClick: function () { setTab(item[0]) },
        style: Object.assign({
          cursor: 'pointer', padding: '6px 14px', borderRadius: '8px', fontSize: '13px',
        }, tab === item[0]
          ? { background: 'var(--dsw-alias-bg-layer-2, #222)', border: '1px solid var(--dsw-alias-border-l2, #555)' }
          : { color: 'var(--dsw-alias-label-secondary, #999)' }),
      }, item[1])
    }))

  if (tab === 'vika') {
    return h('div', { style: { padding: '16px', overflowY: 'auto' } }, tabs, h(VikaSettingsForm))
  }

  return h('div', { style: { padding: '16px', overflowY: 'auto' } }, tabs,
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
  register('plugins.row.config', 'dsh-openviking-expand#openviking-expand-vika')
}

var connectPart = { inject: ['slots'], apply: ovxApplyConnect }

function VikaSettingsForm() {
  var statePair = React.useState({
    containerName: '',
    displayName: '',
    containers: [],
    bridgeHost: '127.0.0.1',
    bridgePort: '3742',
    steps: [],
    githubOutput: '',
    loaded: false,
  })
  var form = statePair[0]
  var setForm = statePair[1]
  var statusPair = React.useState({ busy: false, error: '', ok: '' })
  var status = statusPair[0]
  var setStatus = statusPair[1]
  var githubPoll = React.useRef(null)

  function patch(next) { setForm(Object.assign({}, form, next)) }

  function clearGithubPoll() {
    if (githubPoll.current !== null) {
      clearInterval(githubPoll.current)
      githubPoll.current = null
    }
  }

  React.useEffect(function () {
    return function () { clearGithubPoll() }
  }, [])

  function applyVika(vika) {
    patch({
      containerName: vika.containerName || '',
      displayName: vika.displayName || '',
      bridgeHost: vika.bridgeHost || '127.0.0.1',
      bridgePort: String(vika.bridgePort || 3742),
    })
  }

  React.useEffect(function () {
    ovxConnectRequest('/openviking-vika-config/settings').then(function (result) {
      var vika = result.vika || {}
      var finish = function (containers) {
        patch({
          containerName: vika.containerName || '',
          displayName: vika.displayName || '',
          bridgeHost: vika.bridgeHost || '127.0.0.1',
          bridgePort: String(vika.bridgePort || 3742),
          loaded: true,
          containers: containers || [],
        })
      }
      return ovxConnectRequest('/openviking-vika-config/containers').then(function (data) {
        var containers = data.containers || []
        if (!vika.containerName) {
          var running = containers.filter(function (item) { return item && item.running })
          if (running.length === 1) vika.containerName = running[0].name
        }
        finish(containers)
      }).catch(function () { finish([]) })
    }).catch(function () {
      patch({ loaded: true })
    })
  }, [])

  function currentBody() {
    return {
      containerName: form.containerName,
      bridgeHost: form.bridgeHost,
      bridgePort: Number(form.bridgePort) || 3742,
    }
  }

  async function save() {
    setStatus({ busy: true, error: '', ok: '' })
    try {
      var result = await ovxConnectRequest('/openviking-vika-config/settings/vika', {
        method: 'POST',
        body: currentBody(),
      })
      if (result.settings && result.settings.vika) applyVika(result.settings.vika)
      setStatus({ busy: false, error: '', ok: '已保存' })
      try { window.dispatchEvent(new Event('ovx-config-saved')) } catch (error) { /* 忽略 */ }
    } catch (error) {
      setStatus({ busy: false, error: String(error && error.message ? error.message : error), ok: '' })
    }
  }

  async function detect() {
    setStatus({ busy: true, error: '', ok: '' })
    try {
      var result = await ovxConnectRequest('/openviking-vika-config/containers')
      var containers = (result.containers || []).filter(function (item) { return item && item.name })
      var next = { containers: containers }
      if (form.containerName === '' && containers.length === 1) next.containerName = containers[0].name
      patch(next)
      setStatus({ busy: false, error: '', ok: containers.length === 0 ? '没有找到 Vika 容器；请先在 Docker 里启动 Vika' : '找到 ' + containers.length + ' 个容器，选择后点“一键配置 Vika”' })
    } catch (error) {
      setStatus({ busy: false, error: String(error && error.message ? error.message : error), ok: '' })
    }
  }

  async function configure() {
    setStatus({ busy: true, error: '', ok: '' })
    try {
      var result = await ovxConnectRequest('/openviking-vika-config/configure', {
        method: 'POST',
        body: currentBody(),
      })
      patch({ steps: result.steps || [] })
      if (result.settings && result.settings.vika) applyVika(result.settings.vika)
      setStatus({ busy: false, error: '', ok: result.health ? 'Vika 已配置并重启，桥健康检查通过' : 'Vika 已配置并重启；桥健康检查暂未通过，看下面的步骤/DSH 日志' })
    } catch (error) {
      setStatus({ busy: false, error: String(error && error.message ? error.message : error), ok: '' })
    }
  }

  async function githubSetup() {
    if (form.containerName.trim() === '') {
      setStatus({ busy: false, error: '先选择 Vika 容器', ok: '' })
      return
    }
    setStatus({ busy: true, error: '', ok: '' })
    try {
      var result = await ovxConnectRequest('/openviking-vika-config/github/setup', {
        method: 'POST',
        body: { container: form.containerName },
      })
      clearGithubPoll()
      patch({ githubOutput: result.output || result.message || JSON.stringify(result, null, 2), steps: result.steps || [] })
      if (result.authorized) {
        setStatus({ busy: false, error: '', ok: 'GitHub CLI 已登录' })
      } else {
        setStatus({ busy: false, error: '', ok: '等待浏览器授权…授权完成后这里会自动变成已登录' })
        var tries = 0
        githubPoll.current = setInterval(function () {
          tries += 1
          ovxConnectRequest('/openviking-vika-config/github/status', { method: 'POST', body: { container: form.containerName } }).then(function (state) {
            if (state.authorized) {
              clearGithubPoll()
              patch({ githubOutput: '', steps: [] })
              setStatus({ busy: false, error: '', ok: 'GitHub CLI 已登录' })
            } else if (tries > 80) {
              clearGithubPoll()
              setStatus({ busy: false, error: '没有检测到 GitHub 授权，请重新点击按钮生成新的设备码', ok: '' })
            }
          }).catch(function () { /* 下一轮再试 */ })
        }, 2500)
      }
    } catch (error) {
      setStatus({ busy: false, error: String(error && error.message ? error.message : error), ok: '' })
    }
  }

  async function resetVika() {
    if (!window.confirm('将撤销插件对 Vika 的全部改动：删除注入的工具/桥配置/角色、撤销 /dshin 命令解析补丁、清除 GitHub CLI 登录与 git 身份（插件装的 gh 也会卸载），并清空宿主 .vika 状态；Vika 的飞书/OV/模型配置保留。继续？')) return
    setStatus({ busy: true, error: '', ok: '' })
    try {
      var result = await ovxConnectRequest('/openviking-vika-config/reset', {
        method: 'POST',
        body: { container: form.containerName },
      })
      patch({ steps: result.steps || [] })
      setStatus({ busy: false, error: '', ok: result.hostState === 'removed' ? '已恢复 Vika 原始接线，宿主状态已清空' : '已恢复 Vika 原始接线；宿主状态将在 DSH 重启后清空' })
      try { window.dispatchEvent(new Event('ovx-config-saved')) } catch (error) { /* 忽略 */ }
    } catch (error) {
      setStatus({ busy: false, error: String(error && error.message ? error.message : error), ok: '' })
    }
  }

  var containerOptions = [h('option', { key: '__empty', value: '' }, '选择 Vika 容器…')].concat(
    form.containers.map(function (item) {
      return h('option', { key: item.name, value: item.name }, item.name + ' · ' + (item.status || ''))
    }))

  return h('div', { style: { padding: '0', overflowY: 'auto' } },
    h('div', { style: OVX_CONNECT.card },
      h('div', { style: OVX_CONNECT.h1 }, form.displayName !== '' ? 'vika 设置 · ' + form.displayName : 'vika 设置'),
      h('div', { style: OVX_CONNECT.sub }, 'Vika 容器和 OpenViking 都由用户自己部署。插件只负责把工具、角色和桥配置部署进容器；工作区直接使用容器 /workspace 的挂载目录，不需要在这里配置。'),
      h('div', { style: OVX_CONNECT.label }, 'Vika 容器'),
      h('div', { style: { display: 'flex', gap: '8px' } },
        h('select', {
          style: Object.assign({}, OVX_CONNECT.input, { height: '38px' }),
          value: form.containerName,
          onChange: function (event) { patch({ containerName: event.target.value }) },
        }, containerOptions),
        h('button', {
          style: Object.assign({}, OVX_CONNECT.btnPrimary, { whiteSpace: 'nowrap' }, status.busy ? { opacity: 0.6, cursor: 'wait' } : {}),
          disabled: status.busy,
          onClick: detect,
        }, '检测容器')),
      h('div', { style: OVX_CONNECT.hint }, '只操作已存在的容器；不会创建/删除容器。工作区=容器 /workspace 的挂载目录，插件不创建任何工作区子目录。'),
      form.displayName !== '' ? h('div', { style: OVX_CONNECT.hint }, 'Vika 名称（自动读取）：' + form.displayName) : null,
      h('div', { style: OVX_CONNECT.label }, '桥监听地址'),
      h('div', { style: { display: 'flex', gap: '8px' } },
        h('input', { style: OVX_CONNECT.input, value: form.bridgeHost, onChange: function (event) { patch({ bridgeHost: event.target.value }) }, placeholder: '127.0.0.1' }),
        h('input', { style: Object.assign({}, OVX_CONNECT.input, { width: '120px' }), value: form.bridgePort, onChange: function (event) { patch({ bridgePort: event.target.value }) }, placeholder: '3742' })),
      h('div', { style: OVX_CONNECT.actions },
        h('button', {
          style: Object.assign({}, OVX_CONNECT.btnPrimary, status.busy ? { opacity: 0.6, cursor: 'wait' } : {}),
          disabled: status.busy,
          onClick: save,
        }, status.busy ? '处理中…' : '保存设置'),
        h('button', {
          style: Object.assign({}, OVX_CONNECT.btnPrimary, { background: 'transparent', color: 'inherit' }, status.busy ? { opacity: 0.6, cursor: 'wait' } : {}),
          disabled: status.busy,
          onClick: configure,
        }, '一键配置 Vika'),
        h('button', {
          style: Object.assign({}, OVX_CONNECT.btnPrimary, { background: 'transparent', color: 'inherit' }, status.busy ? { opacity: 0.6, cursor: 'wait' } : {}),
          disabled: status.busy,
          onClick: githubSetup,
        }, '安装/登录 GitHub CLI'),
        h('button', {
          style: Object.assign({}, OVX_CONNECT.btnPrimary, { background: 'transparent', color: 'inherit' }, status.busy ? { opacity: 0.6, cursor: 'wait' } : {}),
          disabled: status.busy,
          onClick: resetVika,
        }, '恢复 Vika 原始接线'),
        status.ok !== '' ? h('span', { style: OVX_CONNECT.ok }, status.ok) : null,
        status.error !== '' ? h('span', { style: OVX_CONNECT.error }, status.error) : null),
      form.steps.length > 0 ? h('div', { style: { marginTop: '14px', padding: '10px 12px', borderRadius: '8px', background: 'var(--dsw-alias-bg-layer-2, transparent)', fontSize: '12px', lineHeight: 1.7 } },
        form.steps.map(function (step, index) { return h('div', { key: 'step-' + index }, '• ' + step) })) : null,
      form.githubOutput !== '' ? h('div', {
        style: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
      }, h('div', {
        style: { width: 'min(720px, 90vw)', maxHeight: '80vh', overflow: 'auto', borderRadius: '12px', padding: '18px 20px', background: 'var(--dsw-alias-bg-layer-1, #111)', border: '1px solid var(--dsw-alias-border-l2, #555)' },
      }, h('div', { style: OVX_CONNECT.h1 }, 'GitHub CLI 配置'),
        h('pre', { style: { whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: 1.6, margin: '10px 0' } }, form.githubOutput),
        h('div', { style: OVX_CONNECT.actions }, h('button', { style: OVX_CONNECT.btnPrimary, onClick: function () { patch({ githubOutput: '' }) } }, '关闭')))) : null))
}
