// Interests ("Ask me about...", backlog B3, Iain 2026-10-02) and Skills
// ("I can help with", backlog B7, 2026-10-03 -- same engine, `kind` column). Scope: claude/Element_Happenings_Interests_on_Profiles_Scope_Answered.md
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

// Skills ("I can help with", backlog B7, Iain 2026-10-03, migration 124):
// same engine as interests (S1) -- a chip's `kind` says which list it's on.
// Rows from before migration 124 have no kind and count as interests.
export const KIND = Object.freeze({ INTEREST: "interest", SKILL: "skill" })
export const MAX_SKILLS = 5
export const NOTE_MAX = 80
export const MAX_BY_KIND = Object.freeze({ interest: MAX_INTERESTS, skill: MAX_SKILLS })
export function kindOf(t) { return t?.kind === KIND.SKILL ? KIND.SKILL : KIND.INTEREST }
export function normaliseKind(k) { return k === KIND.SKILL ? KIND.SKILL : KIND.INTEREST }
export function kindNoun(k) { return normaliseKind(k) === KIND.SKILL ? "skill" : "interest" }

// S2: optional short note on a skill pick. Returns { note } (null when
// blank) or { error }.
export function normaliseNote(raw) {
  if (raw == null) return { note: null }
  if (typeof raw !== "string") return { error: "Invalid note." }
  const note = raw.trim().replace(/\s+/g, " ")
  if (!note) return { note: null }
  if (note.length > NOTE_MAX) return { error: `Please keep each note to ${NOTE_MAX} characters or fewer.` }
  return { note }
}
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
export function resolveSuggestion(raw, tags, kind = KIND.INTEREST) {
  const err = validateLabel(raw)
  if (err) return { action: "error", error: err }
  const key = labelKey(raw)
  const k = normaliseKind(kind)
  // Matching is within one kind only: suggesting "Photography" as a skill
  // must not select the "Photography" interest (migration 124 index).
  const live = (tags || []).filter(t => t && kindOf(t) === k && labelKey(t.label) === key)
  const approved = live.find(t => t.status === STATUS.APPROVED)
  if (approved) return { action: "select", tag: approved }
  const pending = live.find(t => t.status === STATUS.PENDING)
  if (pending) return { action: "join", tag: pending }
  const retired = live.find(t => t.status === STATUS.RETIRED)
  if (retired) return { action: "unavailable", tag: retired, error: `"${retired.label}" isn't on the list at the moment.` }
  return { action: "create", label: normaliseLabel(raw), kind: k }
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
  const current = new Set(currentIds || [])
  const get = (id) => (tagsById instanceof Map ? tagsById.get(id) : tagsById?.[id])
  const counts = { interest: 0, skill: 0 }
  for (const id of ids) {
    const t = get(id)
    if (!t) return { error: "One of those choices no longer exists. Please reopen your profile." }
    if (!(t.status === STATUS.APPROVED || (t.status === STATUS.PENDING && current.has(id)))) {
      return { error: "One of those choices is no longer available. Please reopen your profile." }
    }
    counts[kindOf(t)]++
  }
  // Caps are per list: up to 8 interests AND up to 5 skills.
  if (counts.interest > MAX_INTERESTS) return { error: `You can choose up to ${MAX_INTERESTS} interests.` }
  if (counts.skill > MAX_SKILLS) return { error: `You can choose up to ${MAX_SKILLS} skills.` }
  return { ids }
}

// D2: Private residents' interests are excluded for everyone. Builds the
// directory map Contacts uses: { member_id: ["Bridge", "Gardening"] }.
// Only active non-test non-private members, labels A-Z. Approved chips by
// default; pass status = STATUS.PENDING for the Info > Interests page's
// unapproved suggestions (Iain, 2026-10-03 -- shown there in amber, but
// never on Contacts cards or in Contacts search).
export function buildDirectory(members, links, tags, status = STATUS.APPROVED, kind = KIND.INTEREST) {
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
    if (!t || t.status !== status || kindOf(t) !== normaliseKind(kind)) continue
    ;(out[l.member_id] ||= []).push(t.label)
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
  return out
}

export function interestsLine(labels) {
  return Array.isArray(labels) && labels.length ? labels.join(", ") : ""
}

// Skill notes for the Info > Skills list: { member_id: { label: note } },
// same visibility rules as buildDirectory (Private/test/inactive stripped),
// approved and pending skills only, blank notes omitted.
export function buildSkillNotes(members, links, tags) {
  const tagById = new Map((tags || []).map(t => [t.id, t]))
  const visible = new Set((members || [])
    .filter(m => m && m.status === "active" && !m.is_test && !m.hide_name).map(m => m.id))
  const out = {}
  for (const l of links || []) {
    if (!l || !l.note || !visible.has(l.member_id)) continue
    const t = tagById.get(l.tag_id)
    if (!t || kindOf(t) !== KIND.SKILL) continue
    if (t.status !== STATUS.APPROVED && t.status !== STATUS.PENDING) continue
    ;(out[l.member_id] ||= {})[t.label] = l.note
  }
  return out
}

// Pending suggestions an admin hasn't yet been alerted about (Q2 caveat:
// once-daily admin alert, only when something new is waiting).
export function pendingToAlert(tags) {
  return (tags || []).filter(t => t && t.status === STATUS.PENDING && !t.admin_alerted_at)
}

export function adminAlertMessage(newCount, totalPending) {
  if (!newCount) return null
  const s = newCount === 1 ? "1 new suggestion" : `${newCount} new suggestions`
  const extra = totalPending > newCount ? ` (${totalPending} waiting in total)` : ""
  return `${s} to review in Admin › Interests & Skills${extra}.`
}

// Q3: resident hears back, in-app only.
// tagKind: "interest" (default) or "skill" -- only changes the wording.
export function reviewOutcomeMessage(kind, label, targetLabel, tagKind = KIND.INTEREST) {
  const noun = kindNoun(tagKind)
  switch (kind) {
    case "approved": return `Your ${noun} suggestion "${label}" was approved and now shows on your profile.`
    case "merged":   return `Your ${noun} suggestion "${label}" was added as "${targetLabel}".`
    case "rejected": return `Your ${noun} suggestion "${label}" wasn't added to the list.`
    default: return null
  }
}

export function sortByLabel(rows) {
  return [...(rows || [])].sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }))
}

// Info > Interests (2026-10-03, Iain: "base it on interests that have been
// used by contacts only"). Inverts the Contacts directory map
// ({ member_id: [labels] }, already Private/test/inactive-stripped and
// approved-only server-side) into [{ label, memberIds }] -- one entry per
// interest at least one visible resident has chosen, so there are never
// empty pills. Interests A-Z; memberIds in first-seen order (the page sorts
// people by display name, which this module can't see).
export function groupByInterest(directory) {
  const byKey = new Map()
  for (const [memberId, labels] of Object.entries(directory || {})) {
    for (const label of Array.isArray(labels) ? labels : []) {
      const k = labelKey(label)
      if (!k) continue
      if (!byKey.has(k)) byKey.set(k, { label, memberIds: [] })
      const g = byKey.get(k)
      if (!g.memberIds.includes(memberId)) g.memberIds.push(memberId)
    }
  }
  return sortByLabel([...byKey.values()])
}
