// Propose a group / club (backlog B1, migration 126). Pure helpers shared by
// app/api/group-proposals, app/api/admin/group-proposals and the UI -- no DB
// import, so tests/unit/groupProposals.test.mjs can run them directly.
// Decisions: claude/Element_Happenings_Propose_a_Group_Scope_Answered.md.

export const NAME_MIN = 3
export const NAME_MAX = 60
export const DESCRIPTION_MAX = 500
export const DEFAULT_THRESHOLD = 5
export const THRESHOLD_MIN = 2
export const THRESHOLD_MAX = 50
export const EXPIRY_DAYS = 60
export const THRESHOLD_SETTING_KEY = "group_proposal_threshold"

export const STATUS = Object.freeze({
  PENDING: "pending",     // waiting for an admin to approve it going live
  LIVE: "live",           // visible to everyone, collecting "I'd join"
  DECLINED: "declined",
  CREATED: "created",     // turned into a club
  WITHDRAWN: "withdrawn", // the proposer took it down
})

const DAY_MS = 24 * 60 * 60 * 1000

export function normaliseText(s) {
  return typeof s === "string" ? s.trim().replace(/\s+/g, " ") : ""
}

// Case/whitespace-insensitive comparison key for duplicate checks.
export function nameKey(s) {
  return normaliseText(s).toLowerCase()
}

// null when fine, otherwise a resident-facing error.
export function validateProposal({ name, description } = {}) {
  const n = normaliseText(name)
  if (n.length < NAME_MIN) return `Please give the group a name of at least ${NAME_MIN} characters.`
  if (n.length > NAME_MAX) return `Please keep the name to ${NAME_MAX} characters or fewer.`
  if (!/\p{L}/u.test(n)) return "Please use words in the name, not just numbers or symbols."
  const d = typeof description === "string" ? description.trim() : ""
  if (d.length > DESCRIPTION_MAX) return `Please keep the description to ${DESCRIPTION_MAX} characters or fewer.`
  return null
}

// Is this name already taken by an existing club or another open proposal?
// Returns a resident-facing message, or null.
export function duplicateMessage(name, clubs = [], proposals = [], exceptId = null) {
  const key = nameKey(name)
  if (!key) return null
  const club = clubs.find(c => nameKey(c.name) === key)
  if (club) return `There's already a group called "${club.name}" -- have a look in All Groups & Clubs.`
  const open = proposals.find(p => p.id !== exceptId && nameKey(p.name) === key
    && (p.status === STATUS.PENDING || (p.status === STATUS.LIVE && !isExpired(p))))
  if (open) return `"${open.name}" has already been proposed -- you can tap "I'd join" on it instead.`
  return null
}

// Settings value -> a usable whole-number threshold.
export function parseThreshold(raw) {
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return DEFAULT_THRESHOLD
  return Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, n))
}

// null when an admin-entered threshold is acceptable, otherwise an error.
export function validateThreshold(raw) {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < THRESHOLD_MIN || n > THRESHOLD_MAX) {
    return `Please enter a whole number from ${THRESHOLD_MIN} to ${THRESHOLD_MAX}.`
  }
  return null
}

// A live proposal closes 60 days after it went live (decision 5). Computed,
// not stored, so no cron is needed.
export function expiresAt(p) {
  if (!p?.live_at) return null
  return new Date(new Date(p.live_at).getTime() + EXPIRY_DAYS * DAY_MS)
}

export function isExpired(p, now = new Date()) {
  if (p?.status !== STATUS.LIVE) return false
  const at = expiresAt(p)
  return !!at && at.getTime() <= now.getTime()
}

export function daysLeft(p, now = new Date()) {
  const at = expiresAt(p)
  if (!at) return null
  return Math.max(0, Math.ceil((at.getTime() - now.getTime()) / DAY_MS))
}

export function isReady(p, supporterCount, threshold, now = new Date()) {
  return p?.status === STATUS.LIVE && !isExpired(p, now) && supporterCount >= threshold
}

// Should this "I'd join" tap trigger the one-off admin alert?
export function shouldAlertThreshold(p, supporterCount, threshold, now = new Date()) {
  return isReady(p, supporterCount, threshold, now) && !p.threshold_alerted_at
}

// What a resident is allowed to see in the Groups & Clubs list: live,
// unexpired proposals, plus their own still-pending ones.
export function visibleToResident(p, memberId, now = new Date()) {
  if (p.status === STATUS.LIVE) return !isExpired(p, now)
  if (p.status === STATUS.PENDING) return !!memberId && p.proposed_by === memberId
  return false
}

// Admin list bucket for a proposal.
export function adminBucket(p, supporterCount, threshold, now = new Date()) {
  if (p.status === STATUS.PENDING) return "pending"
  if (p.status === STATUS.LIVE) {
    if (isExpired(p, now)) return "closed"
    return supporterCount >= threshold ? "ready" : "live"
  }
  return "closed"
}

export function closedLabel(p, now = new Date()) {
  if (p.status === STATUS.CREATED) return "Club created"
  if (p.status === STATUS.DECLINED) return "Declined"
  if (p.status === STATUS.WITHDRAWN) return "Withdrawn"
  if (isExpired(p, now)) return "Expired"
  return p.status
}

export function slugify(s) {
  return (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
}

// First free slug: "walking-group", then "walking-group-2", ...
export function uniqueSlug(name, takenSlugs = []) {
  const base = slugify(name) || "group"
  const taken = new Set(takenSlugs)
  if (!taken.has(base)) return base
  for (let i = 2; i < 1000; i++) {
    if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
  }
  return `${base}-${Date.now()}`
}

export function countLine(count, threshold) {
  const people = count === 1 ? "1 person would join" : `${count} people would join`
  return count >= threshold ? `${people} 🎉` : `${people} · ${threshold} needed`
}

// ── Notification wording ────────────────────────────────────────────────────
export function newProposalMessage(name) {
  return `New group proposal to review: "${name}".`
}
export function thresholdReachedMessage(name, count) {
  return `"${name}" now has ${count} people who'd join -- ready to create as a club.`
}
export function approvedMessage(name) {
  return `Your group proposal "${name}" is now live in Groups & Clubs. Neighbours can tap "I'd join".`
}
// wasLive: an admin closed a proposal that had already gone live, rather
// than declining it at review.
export function declinedMessage(name, reason, wasLive = false) {
  const r = normaliseText(reason)
  const base = wasLive ? `Your group proposal "${name}" has been closed` : `Your group proposal "${name}" wasn't approved`
  return r ? `${base}: ${r}` : `${base}.`
}
export function clubCreatedMessage(name, isOwner) {
  return isOwner
    ? `"${name}" is now a club and you're its Owner. Open Groups & Clubs to set it up.`
    : `"${name}" is now a club and you've been added as a member.`
}
