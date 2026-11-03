/**
 * 把一条 viking:// 引用插进当前会话的输入草稿（片段）。
 *
 * 与 dsh-better-sidebar 文件树的 @ 按钮同一机制：走宿主的
 * `conversation.input.insertReference`，编辑器里显示紧凑 chip，模型收到完整 ref。
 * 拿不到 chip 通道时退回纯文本追加，绝不抛错打断点击。
 *
 * 注意：viking:// 不是工作区路径，不能用宿主的工作区引用接口（那个会按
 * 工作区根投影路径），所以这里自己拼 chip 与 detect 投影偏移。
 */

function ovxConversationOf(ctx) {
  try {
    if (ctx === undefined || ctx === null || typeof ctx.get !== 'function') return null
    var conversation = ctx.get('conversation')
    if (conversation === undefined || conversation === null || conversation.input === undefined) return null
    return conversation
  } catch (error) {
    return null
  }
}

function ovxSessionScopeOf(ctx, sessionId) {
  try {
    if (ctx === undefined || ctx === null || typeof ctx.get !== 'function') return null
    var sessions = ctx.get('sessions')
    if (sessions === undefined || sessions === null || typeof sessions.scope !== 'function') return null
    if (typeof sessionId !== 'string' || sessionId === '') return null
    return sessions.scope(sessionId) || null
  } catch (error) {
    return null
  }
}

/** 追加文本需要的前导空格：空草稿不加，已有空白不重复。 */
function ovxLeadFor(draft) {
  if (String(draft).trim() === '') return ''
  return /\s$/.test(draft) ? '' : ' '
}

/**
 * 把 clipboard 投影（chip 展开成整段文本）的偏移折成 detect 投影（chip 压成 1 个字符）。
 * 宿主只接受 detect 投影里的 span，不折叠会多算 length-1 个字符而拒绝插入。
 */
function ovxFoldClipboardOffset(draft, occurrences, offset) {
  var target = Math.max(0, Math.min(offset, draft.length))
  var shrink = 0
  for (var index = 0; index < occurrences.length; index += 1) {
    var occurrence = occurrences[index]
    var end = occurrence.offset + occurrence.length
    if (target >= end) {
      shrink += occurrence.length - 1
      continue
    }
    if (target > occurrence.offset) return occurrence.offset - shrink + 1
    break
  }
  return target - shrink
}

/** 追加位置对应的 detect 偏移；命令 chip（/goal）也要折掉。 */
function ovxAppendOffset(snapshot) {
  var draft = snapshot.draft === undefined ? '' : snapshot.draft
  var occurrences = snapshot.occurrences === undefined || snapshot.occurrences === null ? [] : snapshot.occurrences
  var token = ''
  if (snapshot.phase === 'claimed' && snapshot.claim !== undefined && snapshot.claim !== null && draft.startsWith(snapshot.claim.token)) {
    token = snapshot.claim.token
  }
  if (token === '') return ovxFoldClipboardOffset(draft, occurrences, draft.length)
  var rest = draft.slice(token.length)
  var offsetInRest = []
  for (var index = 0; index < occurrences.length; index += 1) {
    var occurrence = occurrences[index]
    if (occurrence.offset < token.length) continue
    offsetInRest.push({ offset: occurrence.offset - token.length, length: occurrence.length })
  }
  return 1 + ovxFoldClipboardOffset(rest, offsetInRest, rest.length)
}

/**
 * 插入一条 viking:// 引用。
 * @returns {boolean} 是否成功（false 表示宿主没有草稿通道或被拒绝，调用方可提示）
 */
function ovxInsertUriReference(ctx, sessionId, uri) {
  var target = String(uri === undefined || uri === null ? '' : uri)
  if (target === '') return false
  var conversation = ovxConversationOf(ctx)
  var actx = ovxSessionScopeOf(ctx, sessionId)
  if (conversation === null || actx === null) return false

  // chip：屏幕上显示紧凑的 URI，模型收到的 ref 也是 URI（由模型自己去读 OpenViking）。
  // 不声明 appearance：这不是工作区文件，点 chip 不应交给宿主文件打开器。
  var reference = {
    source: 'reference',
    ref: target,
    label: target,
    clipboardText: target,
  }
  try {
    var input = conversation.input.for(actx)
    var snapshot = input.state.getSnapshot()
    var draft = snapshot.draft === undefined ? '' : snapshot.draft
    var canChip = typeof input.insertReference === 'function'
      && snapshot.draftRev !== undefined
      && snapshot.phase !== 'adjudicating'
      && snapshot.phase !== 'submitting'
    if (canChip) {
      var at = ovxAppendOffset(snapshot)
      var rev = snapshot.draftRev
      var start = at
      if (ovxLeadFor(draft) !== '') {
        actx.emit('slash/input-insert-text', { text: ' ', span: { draftRev: rev, start: at, end: at } })
        var afterSpace = input.state.getSnapshot()
        if (afterSpace.draftRev === rev) throw new Error('预留分隔空格失败')
        rev = afterSpace.draftRev
        start = at + 1
      }
      var applied = input.insertReference(reference, { draftRev: rev, start: start, end: start })
      if (applied !== false) return true
    }
    if (typeof input.setDraft === 'function') {
      input.setDraft(ovxLeadFor(draft) + target)
      return true
    }
  } catch (error) {
    // 宿主可能已经应用了这次编辑再抛错：看草稿修订号判断，避免重复插入。
    try {
      var input2 = conversation.input.for(actx)
      if (input2.state.getSnapshot().draftRev !== snapshot.draftRev) return true
    } catch (ignored) { /* 探测失败就按失败处理 */ }
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn('[dsh-openviking-expand] 引用插入失败：', error)
    }
  }
  return false
}

/** 目录条目在草稿里带尾斜杠，与宿主的目录 mention 习惯一致。 */
function ovxReferenceTargetOf(entry) {
  var uri = String(entry && entry.uri ? entry.uri : '')
  if (uri === '') return ''
  if (entry.isDir === true && uri.charAt(uri.length - 1) !== '/') return uri + '/'
  return uri
}
