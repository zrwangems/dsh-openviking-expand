/**
 * vika 面板兼容入口（片段）。
 *
 * 真正的实现在 client/vika/ 下：theme/ui/data/pages/app。
 * 这里只保留 `vikaPanelPart` 这个入口名，供 client/entry.mjs 引用。
 */

var vikaPanelPart = { apply: vikaApply }
