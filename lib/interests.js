// Interests / skills on profiles ("Ask me about..."), backlog B3 (Iain,
// 2026-10-02). Scope: claude/Element_Happenings_Interests_on_Profiles_Scope_Answered.md
// in the Element Happenings project, plus Google Docs _Scope_v1/_v2.
//
// Pure logic only -- no DB import -- so it's unit-testable without a live
// connection (same split as lib/voting.js / lib/digest.js). The API routes
// (app/api/interests, app/api/admin/interests, the review-alert cron) do the
// DB work and lean on these helpers for every rule that matters:
//   - suggestions are matched against existing chips by a normalised key, so
//     "gardening", " Gardening " and "GARDENING" are the same chip
//   - a Private (hide_name) resident's interests are never shown to anyone,
//     admins included (D2) -- enforced server-side before data leaves the API
//   - max MAX_INTERESTS chips per resident, pending suggestions included

export const MAX_INTERESTS = 8
export const LABEL_MIN = 2
export const LABEL_MAX = 40

export const STATUS = Object.freeze({
  APPROVED: "approved",
  PENDING: "pending",
  REJECTED: "rejected",
  RETIRED: "retired",
  MERGED: "merged",
})

// Tidy a typed label for storage: trim, collapse internal whitespace.
export function normaliseLabel(s) {
  return typeof s === "string" ? s.trim().replace(/\s+/g, " ") : ""
}

// Comparison key -- case-insensitive, whitespace-collapsed. Mirrors the
// unique index in migration 120 (lower(regexp_replace(btrim(label), ...))).
export function labelKey(s) {
  return normaliseLabel(s).toLowerCase()
}

// null when fine, otherwise a resident-facing error message.
export function validateLabel(raw) {
  const label = normaliseLabel(raw)
  if (label.length < LABEL_MIN) return `Please type at least ${LABEL_MIN} characters.`
  if (label.length > LABEL_MAX) return `Please keep it to ${LABEL_MAX} characters or fewer.`
  if (!/\p{L}/u.test(label)) return "Please use words, not just numbers or symbols."
  return null
}

// What should happen when a resident types a suggestion, given the current
// tag list (rows with id, label, status). A rejected/merged label is treated
// as new (those rows are history). A RETIRED label is "unavailable": an admin
// deliberately took it off the list, and the live-label unique index in
// migration 120 would refuse a pending duplicate of it anyway -- only an
// admin can bring it back (Restore).
export function resolveSuggestion(raw, tags) {
  const err = validateLabel(raw)
  if (err) return { action: "error", error: err }
  const key = labelKey(raw)
  const live = (tags || []).filter(t => t && labelKey(t.label) === key)
  const approved = live.find(t => t.status === STATUS.APPROVED)
  if (approved) return { action: "select", tag: approved }
  const pending = live.find(t => t.status === STATUS.PENDING)
  if (pending) return { action: "join", tag: pending }
  const retired = live.find(t => t.status === STATUS.RETIRED)
  if (retired) return { action: "unavailable", tag: retired, error: `"${retired.label}" isn't on the list at the moment.` }
  return { action: "create", label: normaliseLabel(raw) }
}

// Validates a resident's full chosen set on Save. A resident may hold
// approved chips, plus pending chips they're already linked to (their own
// suggestions, or ones they joined). Anything else is refused.
//   chosenIds   -- what the client sent
//   tagsById    -- Map/obj of tag rows for those ids
//   currentIds  -- the resident's links before this save
export function validateSelection(chosenIds, tagsById, currentIds) {
  if (!Array.isArray(chosenIds)) return { error: "Invalid selection." }
  const ids = [...new Set(chosenIds.filter(x => typeof x === "string" && x))]
  if (ids.length > MAX_INTERESTS) return { error: `You can choose up to ${MAX_INTERESTS}.` }
  const current = new Set(currentIds || [])
  const get = (id) => (tagsById instanceof Map ? tagsById.get(id) : tagsById?.[id])
  for (const id of ids) {
    const t = get(id)
    if (!t) return { error: "One of those interests no longer exists. Please reopen your profile." }
    if (t.status === STATUS.APPROVED) continue
    if (t.status === STATUS.PENDING && current.has(id)) continue
    return { error: "One of those interests is no longer available. Please reopen your profile." }
  }
  return { ids }
}

// D2: Private residents' interests are excluded for everyone. Builds the
// directory map Contacts uses: { member_id: ["Bridge", "Gardening"] }.
// Only approved chips, only active non-test non-private members, labels A-Z.
export function buildDirectory(members, links, tags) {
  const tagById = new Map((tags || []).map(t => [t.id, t]))
  const visible = new Set(
    (members || [])
      .filter(m => m && m.status === "active" && !m.is_test && !m.hide_name)
      .map(m => m.id)
  )
  const out = {}
  for (const l of links || []) {
    if (!l || !visible.has(l.member_id)) continue
    const t = tagById.get(l.tag_id)
    if (!t || t.status !== STATUS.APPROVED) continue
    ;(out[l.member_id] ||= []).push(t.label)
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
  return out
}

export function interestsLine(labels) {
  return Array.isArray(labels) && labels.length ? labels.join(", ") : ""
}

// Pending suggestions an admin hasn't yet been alerted about (Q2 caveat:
// once-daily admin alert, only when something new is waiting).
export function pendingToAlert(tags) {
  return (tags || []).filter(t => t && t.status === STATUS.PENDING && !t.admin_alerted_at)
}

export function adminAlertMessage(newCount, totalPending) {
  if (!newCount) return null
  const s = newCount === 1 ? "1 new interest suggestion" : `${newCount} new interest suggestions`
  const extra = totalPending > newCount ? ` (${totalPending} waiting in total)` : ""
  return `${s} to review in Admin › Interests${extra}.`
}

// Q3: resident hears back, in-app only.
export function reviewOutcomeMessage(kind, label, targetLabel) {
  switch (kind) {
    case "approved": return `Your interest suggestion "${label}" was approved and now shows on your profile.`
    case "merged":   return `Your interest suggestion "${label}" was added as "${targetLabel}".`
    case "rejected": return `Your interest suggestion "${label}" wasn't added to the list.`
    default: return null
  }
}

export function sortByLabel(rows) {
  return [...(rows || [])].sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }))
}
