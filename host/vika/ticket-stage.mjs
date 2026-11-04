/**
 * 工单阶段判定（open/working/person/ended）的纯函数。
 *
 * 与 vendored vika 运行时 `vika/runtime/lib/index.js` 的 `ticketStage` 保持同一判定顺序；
 * 桥只读工单快照，不必为此加载整个运行时（运行时会连带依赖 DSH 包，单测无法独立加载）。
 * 若上游调整阶段表，这里需同步；test/vika-ticket-stage.test.mjs 固定住判定表。
 */

/** 最后一条 assignment（与运行时 `ticket.assignments.at(-1)` 一致）。 */
function latestAssignment(ticket) {
  return Array.isArray(ticket.assignments) ? ticket.assignments.at(-1) : undefined;
}

/** 工单是否在等一个人：最近一次报告是 blocked/failed，且之后没有人的消息。 */
function waitsForPerson(ticket) {
  const report = latestAssignment(ticket)?.report;
  if (report?.state !== "blocked" && report?.state !== "failed") return false;
  return !ticket.inputs.some(input => input.kind === "trigger" && input.human && !input.context && input.at > report.at);
}

/** @param {object} ticket 工单快照。 @returns {{stage: string, action?: string}} */
export function ticketStage(ticket) {
  if (ticket.ended) return { stage: "ended" };
  if (ticket.delivery) return { stage: "person", action: "delivery" };
  if (ticket.attention) return { stage: "person", action: "answer" };
  const assignment = latestAssignment(ticket);
  const report = assignment?.report?.state;
  if (report === "ready") return { stage: "person", action: "review" };
  if ((report === "blocked" || report === "failed") && waitsForPerson(ticket)) {
    return { stage: "person", action: report };
  }
  if (!assignment || assignment.state === "pending") return { stage: "working", action: "queued" };
  if (report === "waiting" || assignment.state === "ended") return { stage: "idle" };
  return { stage: "working" };
}
