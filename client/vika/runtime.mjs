/**
 * 把 vendored vika runtime 面板接到 DSH 客户端（片段）。
 *
 * 面板本体是 vendored runtime 的 client bundle（vika/runtime/client.js），
 * 由 scripts/build-client.mjs 提取成 runtimeClientFactory；这里只在宿主
 * /orchestrator/api/state 可用时调用它的 apply，避免 vika 组件关闭时出现空面板。
 */

var VK_RUNTIME_API = '/orchestrator/api'

function vikaRuntimeApply(ctx) {
  var check = function () {
    return fetch(VK_RUNTIME_API + '/state', {
      headers: { 'x-orchestrator-request': '1', accept: 'application/json' },
    }).then(function (response) {
      return response.ok
    }, function () {
      return false
    })
  }
  check().then(function (ok) {
    if (!ok) return
    if (typeof window !== 'undefined' && window.__ovxVikaPanelRegistered === true) return
    var module = runtimeClientFactory(require)
    if (module === null || module === undefined || typeof module.apply !== 'function') return
    if (typeof window !== 'undefined') window.__ovxVikaPanelRegistered = true
    try {
      module.apply(ctx)
    } catch (error) {
      if (typeof window !== 'undefined') window.__ovxVikaPanelRegistered = false
      throw error
    }
  })
}

var vikaRuntimePart = { apply: vikaRuntimeApply }
