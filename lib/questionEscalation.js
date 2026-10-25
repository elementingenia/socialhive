// Pure escalation rules for unanswered questions -- no database access, so it
// can be unit-tested directly. The cron (app/api/cron/question-escalation-check)
// does the lookups and calls escalationStep() per question.
//
// Two steps (Iain, 2026-10-26):
//   1. After ESCALATE_AFTER_DAYS with no answer, tell the next tier up -- the
//      event's parent club/hub Owner(s) -- if there is anyone there who wasn't
//      already asked. Club matters stay inside the club first.
//   2. If still unanswered ESCALATE_AFTER_DAYS after that (or there was no
//      Owner tier to try), tell every admin. That sets escalated_at, which is
//      what puts the question in every admin's "To answer" box (BUG-052).

export const ESCALATE_AFTER_DAYS = 5
const DAY_MS = 24 * 60 * 60 * 1000

// The Owner tier for step 1: Owners not already among the original recipients
// and not the asker. Empty means step 1 is skipped and admins come next.
export function ownerTierIds(ownerIds, primaryIds, askerId) {
  const already = new Set(primaryIds || [])
  return [...new Set(ownerIds || [])].filter(id => !already.has(id) && id !== askerId)
}

// Returns "owner", "admin" or null (nothing to do yet / already done).
export function escalationStep(q, ownerTier, now = new Date()) {
  if (!q || q.escalated_at) return null
  if (q.status !== "open") return null
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  const wait = ESCALATE_AFTER_DAYS * DAY_MS

  if (q.owner_escalated_at) {
    return nowMs - new Date(q.owner_escalated_at).getTime() >= wait ? "admin" : null
  }
  if (nowMs - new Date(q.created_at).getTime() < wait) return null
  return ownerTier && ownerTier.length ? "owner" : "admin"
}

// "Unanswered for N days" uses the real age of the question, so the admin
// step reads 10 days after an Owner step and 5 when it went straight there.
export function escalationMessage(q, who, label, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  const days = Math.max(ESCALATE_AFTER_DAYS, Math.floor((nowMs - new Date(q.created_at).getTime()) / DAY_MS))
  return `Unanswered for ${days} days -- ${who} asked ${label}: "${String(q.subject || "").slice(0, 80)}"`
}
