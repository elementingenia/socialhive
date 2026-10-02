// Weekly Digest (Iain, 2026-10-02) -- pure helpers, dependency-free apart
// from lib/date.js, unit tested under plain Node (tests/unit/digest.test.mjs).
// The data gathering itself lives server-side in lib/digestData.js.
import { sydneyTodayStr, dateStrPlusDays } from "./date.js"

export const DIGEST_DAYS_AHEAD = 7   // events: today + the next 6 days
export const DIGEST_DAYS_BACK  = 7   // "new this week": the last 7 days

/** The Sydney date range the digest covers, as YYYY-MM-DD strings. */
export function digestWindow(now = new Date()) {
  const today = sydneyTodayStr(now)
  return {
    from: today,
    to: dateStrPlusDays(today, DIGEST_DAYS_AHEAD - 1),
    sinceIso: new Date(now.getTime() - DIGEST_DAYS_BACK * 86400000).toISOString(),
  }
}

function plural(n, one, many) { return `${n} ${n === 1 ? one : many}` }

/**
 * The notification text. Counts are community-wide; `invites` is this
 * resident's own unbooked invites. Returns null when there's nothing
 * community-wide -- Iain: skip the send entirely in a quiet week.
 */
export function digestMessage(counts = {}, invites = 0) {
  const parts = []
  if (counts.events)    parts.push(plural(counts.events, "event", "events"))
  if (counts.newGroups) parts.push(plural(counts.newGroups, "new group", "new groups"))
  if (counts.news)      parts.push(plural(counts.news, "news post", "news posts"))
  if (counts.committee) parts.push(plural(counts.committee, "Committee update", "Committee updates"))
  if (counts.votes)     parts.push(plural(counts.votes, "vote open", "votes open"))
  if (counts.surveys)   parts.push(plural(counts.surveys, "survey open", "surveys open"))
  if (parts.length === 0) return null
  let msg = `This week at Element Happenings: ${parts.join(", ")}`
  if (invites > 0) msg += `, plus ${plural(invites, "invite", "invites")} for you`
  return msg
}

/** Is there anything at all to send this week? */
export function digestHasContent(counts = {}) {
  return digestMessage(counts) !== null
}

export const DIGEST_AUDIENCES = ["admins", "community"]

/** Anything other than an explicit 'community' is treated as admins-only --
 * the safe direction if the setting is missing or garbled. */
export function normaliseAudience(audience) {
  return audience === "community" ? "community" : "admins"
}

/**
 * Who gets it: active, logged in at least once, not a test account, their
 * own Profile switch on -- and, while the audience is 'admins' (Iain: "keep
 * it in-house to start"), admins only.
 */
export function digestRecipients(members = [], audience = "admins") {
  const adminsOnly = normaliseAudience(audience) === "admins"
  return members
    .filter(m => m && m.status === "active" && m.auth_id && !m.is_test && m.weekly_digest !== false)
    .filter(m => !adminsOnly || m.is_admin)
    .map(m => m.id)
}
