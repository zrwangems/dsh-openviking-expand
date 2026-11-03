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
