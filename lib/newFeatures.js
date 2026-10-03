// New Features announcements + Documents "New Features" folder
// (Scope_Answered, Iain 2026-10-03). Pure helpers, dependency-free apart
// from lib/date.js, unit tested under plain Node (tests/unit/newFeatures.test.mjs).
// Server-only PDF building lives in lib/featureAnnouncementPdf.js.
import { sydneyNowTimeStr } from "./date.js"

export const NEW_FEATURES_KEY = "new_features"   // document_categories.system_key + hub_settings.hub_type
export const NEW_FEATURES_NAME = "New Features"
export const MAX_STEPS = 6
export const SEND_HOUR_SYDNEY = 8                 // decision 3: 08:30 Sydney

// ── Drafts ───────────────────────────────────────────────────────────────────

/** Steps arrive as an array or newline-separated text; returns <= 6 trimmed, non-empty strings. */
export function normaliseSteps(input) {
  let list = input
  if (typeof list === "string") list = list.split(/\r?\n/)
  if (!Array.isArray(list)) return []
  return list
    .map(s => (typeof s === "string" ? s : "").replace(/^\s*(\d+[.)]|[-*•])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, MAX_STEPS)
}

function clean(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}

/** Tidies an incoming draft into the columns we store. */
export function cleanDraft(src = {}) {
  return {
    title:         clean(src.title, 120),
    summary:       clean(src.summary, 300),
    what_it_does:  clean(src.what_it_does, 1500) || null,
    how_to_use:    normaliseSteps(src.how_to_use),
    where_to_find: clean(src.where_to_find, 300) || null,
    source_ref:    clean(src.source_ref, 60) || null,
  }
}

/** null when the draft can be saved/approved, otherwise a message for the admin. */
export function validateDraft(d) {
  if (!d?.title) return "Title is required"
  if (!d?.summary) return "One-line summary is required"
  return null
}

// ── Sending ──────────────────────────────────────────────────────────────────

/**
 * The cron is scheduled at both 21:30 and 22:30 UTC (vercel.json) because
 * Sydney moves between UTC+10 and UTC+11. Only the run that lands in the
 * 08:xx Sydney hour sends; the other one does nothing.
 */
export function isSendTime(now = new Date()) {
  const hour = Number(sydneyNowTimeStr(now).slice(0, 2))
  return hour === SEND_HOUR_SYDNEY
}

/** "3 October 2026" for the PDF title. */
export function featureDateLabel(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number)
  if (!y || !m || !d) return String(dateStr || "")
  const months = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"]
  return `${d} ${months[m - 1]} ${y}`
}

export function featureDocTitle(dateStr) {
  return `New Features — ${featureDateLabel(dateStr)}`
}

export function featureDocFileName(dateStr) {
  return `New-Features-${dateStr}.pdf`
}

/** The notification text for a day's batch. */
export function featureMessage(features = []) {
  const titles = features.map(f => f?.title).filter(Boolean)
  if (titles.length === 0) return null
  if (titles.length === 1) return `New in Element Happenings: ${titles[0]}. Tap to see how it works.`
  const shown = titles.slice(0, 3)
  const more = titles.length - shown.length
  const list = more > 0
    ? `${shown.join(", ")} and ${more} more`
    : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`
  return `${titles.length} new features in Element Happenings: ${list}. Tap to see how they work.`
}

export function normaliseAudience(audience) {
  return audience === "community" ? "community" : "admins"
}

/**
 * Who gets the announcement: active, logged in at least once, not a test
 * account; admins only while the audience is 'admins' (decision 6).
 */
export function featureRecipients(members = [], audience = "admins") {
  const adminsOnly = normaliseAudience(audience) === "admins"
  return members
    .filter(m => m && m.status === "active" && m.auth_id && !m.is_test)
    .filter(m => !adminsOnly || m.is_admin)
    .map(m => m.id)
}

/** Where a new_features notification/push lands: Documents, opening that day's PDF. */
export function featureDocLink(dateStr) {
  return `/info/documents?nf=${encodeURIComponent(dateStr || "")}`
}

/** "Goes out at 8:30am today/tomorrow" for an approved item, from now. */
export function nextSendLabel(now = new Date()) {
  const hhmm = sydneyNowTimeStr(now)
  return hhmm < "08:30" ? "Goes out at 8:30am today" : "Goes out at 8:30am tomorrow"
}


// ── Documents page ───────────────────────────────────────────────────────────

export function isInFolder(doc, folderId) {
  return !!folderId && (doc?.categories || []).some(c => c.id === folderId)
}

/** Lower-cased search hit across title, description, category names and file name (decision 7). */
export function docMatchesQuery(doc, query) {
  const q = String(query || "").trim().toLowerCase()
  if (q.length < 2) return true
  const hay = [
    doc?.title, doc?.description, doc?.file_name,
    ...(doc?.categories || []).map(c => c?.name),
  ].filter(Boolean).join(" ").toLowerCase()
  return q.split(/\s+/).every(word => hay.includes(word))
}

/** Newest first (created_at), explicit and stable. */
export function sortNewestFirst(docs = []) {
  return [...docs].sort((a, b) => String(b?.created_at || "").localeCompare(String(a?.created_at || "")))
}

/**
 * What the Documents list shows.
 * - "all": every document EXCEPT the New Features folder (that shows as a folder row).
 * - a category id: documents in that category (the New Features pill = the folder).
 * - A search (2+ chars) covers everything, folder included, narrowed by the active pill.
 */
export function visibleDocuments({ docs = [], filter = "all", query = "", folderId = null }) {
  const searching = String(query || "").trim().length >= 2
  let list = docs
  if (filter === "all") {
    if (!searching) list = list.filter(d => !isInFolder(d, folderId))
  } else {
    list = list.filter(d => (d.categories || []).some(c => c.id === filter))
  }
  if (searching) list = list.filter(d => docMatchesQuery(d, query))
  return sortNewestFirst(list)
}

/** Category pills: the New Features pill always last. */
export function orderPills(categories = [], folderId = null) {
  const rest = categories.filter(c => c.id !== folderId)
  const folder = categories.filter(c => c.id === folderId)
  return [...rest, ...folder]
}

/** True on /info and every page under it -- the Find (events) button hides there. */
export function isInfoPath(pathname) {
  return pathname === "/info" || String(pathname || "").startsWith("/info/")
}

