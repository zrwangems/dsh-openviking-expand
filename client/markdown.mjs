/**
 * 轻量 Markdown 渲染（片段）。
 *
 * 客户端只能 require('react')，不能引第三方库；这里直接返回 React 元素树，
 * 不用 innerHTML，避免 XSS 与样式失控。只覆盖 OpenViking 摘要/概览实际用到的语法：
 * 标题、表格、列表、代码块、引用、粗体、行内代码、链接、分隔线。
 */

/** 行内语法：**粗体**、`代码`、[文字](链接)。 */
function ovxMdInline(text, keyBase) {
  var nodes = []
  var buffer = ''
  var seq = 0
  var flush = function () {
    if (buffer.length > 0) {
      nodes.push(buffer)
      buffer = ''
    }
  }
  var index = 0
  var source = String(text)
  while (index < source.length) {
    if (source.startsWith('**', index)) {
      var boldEnd = source.indexOf('**', index + 2)
      if (boldEnd > index + 2) {
        flush()
        nodes.push(h('strong', { key: keyBase + '-s' + (seq += 1) }, source.slice(index + 2, boldEnd)))
        index = boldEnd + 2
        continue
      }
      // 孤立的两颗星（翻译/裁剪后残留）直接丢掉，别让它在正文里露出来
      if (boldEnd === index + 2 || (boldEnd === -1 && (index + 2 >= source.length || source[index + 2] === '\n'))) {
        flush()
        index += 2
        continue
      }
    }
    if (source[index] === '`') {
      var codeEnd = source.indexOf('`', index + 1)
      if (codeEnd > index + 1) {
        flush()
        nodes.push(h('code', { key: keyBase + '-c' + (seq += 1) }, source.slice(index + 1, codeEnd)))
        index = codeEnd + 1
        continue
      }
    }
    if (source[index] === '[') {
      var link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(source.slice(index))
      if (link !== null) {
        flush()
        nodes.push(h('a', { key: keyBase + '-a' + (seq += 1), href: link[2], target: '_blank', rel: 'noopener' }, link[1]))
        index += link[0].length
        continue
      }
    }
    buffer += source[index]
    index += 1
  }
  flush()
  return nodes
}

function ovxMdSplitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (cell) { return cell.trim() })
}

function ovxMdIsTableSeparator(line) {
  return /^\s*\|?[\s:-]+\|[\s:|-]*$/.test(line)
}

function ovxMdIsBlockStart(line, next) {
  if (/^(#{1,6})\s+/.test(line)) return true
  if (/^```/.test(line.trim())) return true
  if (/^\s*>/.test(line)) return true
  if (/^\s*[-*+]\s+/.test(line)) return true
  if (/^\s*\d+[.)]\s+/.test(line)) return true
  if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return true
  if (line.indexOf('|') >= 0 && typeof next === 'string' && ovxMdIsTableSeparator(next)) return true
  return false
}

/** 把 Markdown 文本转成 React 元素。 */
function OvxMarkdown(props) {
  var lines = String(props.text === undefined || props.text === null ? '' : props.text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
  var blocks = []
  var key = 0
  var index = 0
  var nextKey = function (prefix) { key += 1; return prefix + key }
  while (index < lines.length) {
    var line = lines[index]
    if (line.trim().length === 0) {
      index += 1
      continue
    }
    // 代码块
    if (/^```/.test(line.trim())) {
      index += 1
      var code = []
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      blocks.push(h('pre', { key: nextKey('pre') }, h('code', null, code.join('\n'))))
      continue
    }
    // 标题
    var heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading !== null) {
      var tag = heading[1].length <= 2 ? 'h3' : 'h4'
      blocks.push(h(tag, { key: nextKey('h') }, ovxMdInline(heading[2], 'h' + key)))
      index += 1
      continue
    }
    // 分隔线
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(h('hr', { key: nextKey('hr') }))
      index += 1
      continue
    }
    // 引用
    if (/^\s*>/.test(line)) {
      var quote = []
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      blocks.push(h('blockquote', { key: nextKey('q') }, ovxMdInline(quote.join('\n'), 'q' + key)))
      continue
    }
    // 表格
    if (line.indexOf('|') >= 0 && index + 1 < lines.length && ovxMdIsTableSeparator(lines[index + 1])) {
      var header = ovxMdSplitRow(line)
      index += 2
      var rows = []
      while (index < lines.length && lines[index].indexOf('|') >= 0 && lines[index].trim().length > 0) {
        rows.push(ovxMdSplitRow(lines[index]))
        index += 1
      }
      blocks.push(h('table', { key: nextKey('t') },
        h('thead', null, h('tr', null, header.map(function (cell, cellIndex) {
          return h('th', { key: cellIndex }, ovxMdInline(cell, 'th' + cellIndex))
        }))),
        h('tbody', null, rows.map(function (row, rowIndex) {
          return h('tr', { key: rowIndex }, row.map(function (cell, cellIndex) {
            return h('td', { key: cellIndex }, ovxMdInline(cell, 'td' + rowIndex + '-' + cellIndex))
          }))
        })),
      ))
      continue
    }
    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      var items = []
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ''))
        index += 1
      }
      blocks.push(h('ul', { key: nextKey('ul') }, items.map(function (item, itemIndex) {
        return h('li', { key: itemIndex }, ovxMdInline(item, 'ul' + itemIndex))
      })))
      continue
    }
    // 有序列表
    if (/^\s*\d+[.)]\s+/.test(line)) {
      var ordered = []
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        ordered.push(lines[index].replace(/^\s*\d+[.)]\s+/, ''))
        index += 1
      }
      blocks.push(h('ol', { key: nextKey('ol') }, ordered.map(function (item, itemIndex) {
        return h('li', { key: itemIndex }, ovxMdInline(item, 'ol' + itemIndex))
      })))
      continue
    }
    // 段落：连续普通行合并
    var paragraph = [line]
    index += 1
    while (index < lines.length && lines[index].trim().length > 0 && !ovxMdIsBlockStart(lines[index], lines[index + 1])) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push(h('p', { key: nextKey('p') }, ovxMdInline(paragraph.join('\n'), 'p' + key)))
  }
  if (blocks.length === 0) return h('div', { className: 'ovx-empty' }, '（空）')
  return h('div', { className: 'ovx-md' }, blocks)
}
