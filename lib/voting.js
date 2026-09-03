// Governance Voting hub — core business logic.
// Element_Happenings_Voting_Scope, through v6 (Iain, 2026-09-02).
//
// Two rules drive every function in this file:
//
// 1. Lifecycle status is ALWAYS computed live, never stored. Same reasoning
//    as lib/booking.js's bookingsClosed() and lib/date.js's isEventPast() —
//    a written status column silently drifts from reality (this project has
//    shipped fixes for exactly that bug twice this same week: BUG-039, and
//    the whole PR #70 Sydney-date saga). Draft/Open/Closed/Published comes
//    from opened_at/closes_at/published_at compared against now(), full
//    stop — there is no status column on voting_events to keep in sync.
//
// 2. Anonymity is structural, not a permission check. voting_participation
//    (WHO voted — member_id, timestamped) and voting_ballots (WHAT was
//    voted — choice only, no member_id, no timestamp) are written together
//    but never joined. Nothing in this file may select member_id and
//    choice_id in the same query, or add a shared key between the two
//    tables. See the migration (088_voting_hub.sql) for the full design
//    rationale, including why voting_ballots has no timestamp either
//    (small-population timing-correlation risk, flagged by Iain 2026-09-02).

export const VOTING_STATUS = Object.freeze({
  DRAFT: "draft",
  OPEN: "open",
  CLOSED: "closed",
  PUBLISHED: "published",
})

export function computeVotingStatus(event, now = new Date()) {
  if (event.published_at) return VOTING_STATUS.PUBLISHED
  if (!event.opened_at) return VOTING_STATUS.DRAFT
  const closesAt = event.closes_at ? new Date(event.closes_at) : null
  if (closesAt && !isNaN(closesAt.getTime()) && now.getTime() >= closesAt.getTime()) {
    return VOTING_STATUS.CLOSED
  }
  return VOTING_STATUS.OPEN
}

export function isVotingOpen(event, now = new Date()) {
  return computeVotingStatus(event, now) === VOTING_STATUS.OPEN
}

// Normalizes a house_number for comparison purposes only — never written
// back to the DB. Trims, lowercases, strips common prefixes ("unit"/"lot"/
// "house"/"#"). A live audit of production data (2026-09-02, 169 non-null
// house_number values across 175 active members) found zero irregular-
// format entries — every value was a plain number or number+letter, so this
// normalization is currently a no-op in practice, but it's cheap insurance
// against a future entry like "Unit 12" vs "12" and costs nothing to keep.
export function normalizeHouseNumber(raw) {
  if (!raw) return null
  return String(raw).trim().toLowerCase().replace(/^(unit|lot|house|#)\s*/, "").replace(/\s+/g, "")
}

// True if `member` shares a normalized house_number with anyone who has
// ALREADY voted (i.e. already has a voting_participation row for this
// event) — per eligibility_mode = 'per_household'. Pass in the event's
// existing participants (member_id + house_number, joined from
// voting_participation + members — never from voting_ballots) as
// `existingParticipants`; this function does no DB access itself so it's
// trivially unit-testable.
export function householdAlreadyVoted(member, existingParticipants) {
  const mine = normalizeHouseNumber(member?.house_number)
  if (!mine) return false // no house_number => per Iain 2026-09-02, this member simply can't vote in per_household mode; handled by isEligibleToVote, not here
  return existingParticipants.some(p => p.member_id !== member.id && normalizeHouseNumber(p.house_number) === mine)
}

// Full eligibility check for casting a vote, per Iain's decisions:
//   - per_resident: any active member may vote, once.
//   - per_household: a member with no house_number cannot vote at all
//     ("Residents with no house cannot vote", Iain 2026-09-02, explicit).
//     Otherwise, blocked once anyone else at the same normalized
//     house_number has already voted.
// Does NOT check "have I already voted" (voting_participation's UNIQUE
// constraint is the actual enforcement for that — this function is about
// eligibility, the DB constraint is the backstop for the race condition).
export function isEligibleToVote(event, member, existingParticipants) {
  if (event.eligibility_mode === "per_household") {
    if (!member?.house_number) {
      return { eligible: false, reason: "This vote is by household — residents without a registered house number can't vote. Contact the office to register your unit." }
    }
    if (householdAlreadyVoted(member, existingParticipants)) {
      return { eligible: false, reason: "Someone in your household has already voted in this ballot." }
    }
  }
  return { eligible: true }
}

// Self-vote check — enforced at cast-time while identity is still known;
// does not conflict with ballot anonymity (which only concerns what's
// persisted afterward). `choices` must include candidate_member_id.
export function validateSelfVote(event, member, selectedChoiceIds, choices) {
  if (event.allow_self_vote) return { ok: true }
  const byId = new Map(choices.map(c => [c.id, c]))
  for (const choiceId of selectedChoiceIds) {
    const choice = byId.get(choiceId)
    if (choice?.candidate_member_id && choice.candidate_member_id === member.id) {
      return { ok: false, reason: "You can't vote for your own candidacy in this ballot." }
    }
  }
  return { ok: true }
}

// Validates the shape of a ballot submission against the event's vote_mode
// before anything is written. Returns { ok, reason } — never throws.
export function validateBallotSelection(event, selectedChoiceIds, allChoiceIds) {
  if (!Array.isArray(selectedChoiceIds) || selectedChoiceIds.length === 0) {
    return { ok: false, reason: "Select at least one option." }
  }
  const unique = new Set(selectedChoiceIds)
  if (unique.size !== selectedChoiceIds.length) {
    return { ok: false, reason: "Duplicate selection." }
  }
  for (const id of selectedChoiceIds) {
    if (!allChoiceIds.includes(id)) return { ok: false, reason: "Unknown choice." }
  }
  if (event.vote_mode === "single") {
    if (selectedChoiceIds.length !== 1) return { ok: false, reason: "This vote allows exactly one choice." }
    return { ok: true }
  }
  // multi
  const max = event.max_selections || allChoiceIds.length
  if (selectedChoiceIds.length > max) {
    return { ok: false, reason: `You can select up to ${max} option${max === 1 ? "" : "s"}.` }
  }
  return { ok: true }
}

// Tally: choice_id -> count. Pure function over ballot rows (never member-
// linked — see the anonymity note at the top of this file).
export function tallyBallots(ballots) {
  const counts = new Map()
  for (const b of ballots) {
    counts.set(b.choice_id, (counts.get(b.choice_id) || 0) + 1)
  }
  return counts
}

// Household anomaly report for the Closed -> Published admin review step
// (the safety net agreed 2026-09-02: normalization should catch everything,
// but a human checks before results go out). Returns an array of
// { normalizedHouseNumber, memberIds } for any house with more than one
// participation row, when eligibility_mode = 'per_household'. This is the
// LAST line of defence, not the primary enforcement — isEligibleToVote +
// the UNIQUE(voting_event_id, member_id) constraint are what should
// normally prevent this from ever finding anything.
export function householdAnomalyReport(event, participants) {
  if (event.eligibility_mode !== "per_household") return []
  const byHouse = new Map()
  for (const p of participants) {
    const key = normalizeHouseNumber(p.house_number)
    if (!key) continue
    if (!byHouse.has(key)) byHouse.set(key, [])
    byHouse.get(key).push(p.member_id)
  }
  return [...byHouse.entries()]
    .filter(([, memberIds]) => memberIds.length > 1)
    .map(([normalizedHouseNumber, memberIds]) => ({ normalizedHouseNumber, memberIds }))
}

// Results visibility gate — mirrors lib/payments.js's convention of one
// function every screen renders through, rather than each screen
// re-deriving its own check.
export function canSeeResults(event, { field, isAdmin }) {
  const visibility = event[field] // 'results_visibility_outcome' | 'results_visibility_turnout'
  if (isAdmin) return true
  return visibility === "residents"
}
