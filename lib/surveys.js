// Surveys hub -- core business logic. Social_Hive_Surveys_Scope_Answered.md
// (Iain, 2026-09-08). Mirrors lib/voting.js's structure deliberately --
// Voting is this app's proven sibling system for "occasional hub with a
// Draft/Open/Closed/Published lifecycle, household eligibility, and a
// Coordinator" -- but read the two differences before assuming this file
// behaves exactly like that one:
//
// 1. Lifecycle is ALWAYS computed live, never stored -- identical reasoning
//    and identical shape to lib/voting.js's computeVotingStatus() (this
//    project has shipped fixes for "a written status silently drifts from
//    reality" twice already: BUG-039, and the whole PR #70 Sydney-date
//    saga). Draft/Open/Closed/Published comes from opened_at/closes_at/
//    published_at compared against now(), full stop.
//
// 2. Anonymity here is a DISPLAY-level mask, NOT Voting's structural
//    guarantee. survey_responses carries member_id on every row, always --
//    there is no split-table anonymity design to protect in this file the
//    way lib/voting.js's top-of-file warning protects voting_ballots. The
//    `anonymous` flag on a survey controls what the results API
//    (app/api/surveys/[id]/results) exposes to EVERY non-database viewer,
//    application-level, not a database-level guarantee.
//
//    CORRECTED 2026-09-09 (Iain, reviewing the original scope doc's item 1
//    in production): the original design let the Coordinator always see
//    identity, anonymous or not, on the reasoning that they need to follow
//    up on commentary. Iain's later call reverses that for a genuinely
//    anonymous survey: when `anonymous = true`, NOBODY sees identity,
//    Coordinator included -- only an aggregate. The Coordinator's
//    always-sees-identity behaviour now applies only when
//    `anonymous = false`. See app/api/surveys/[id]/results/route.js's
//    identityAllowed computation, and 100_survey_responses.sql's ANONYMITY
//    note (written before this correction -- read this comment as the
//    current, superseding word on that specific point).
//
// Results visibility: canSeeResults is imported from lib/voting.js and used
// AS-IS, not duplicated -- Change Request #3 (2026-09-08) made that
// function's contract ("coordinator-only, no blanket admin/owner bypass")
// the shared rule for both hubs. Surveys was built against the
// already-corrected version from day one.

// Relative import, not "@/lib/voting" -- this file's own unit tests
// (tests/unit/surveys.test.mjs) run under plain `node`, which can't resolve
// the "@/" alias (that's a Next.js/webpack-only path mapping). Same
// convention already used for lib-to-lib imports elsewhere, e.g.
// lib/categoryQuestions.js importing "./memberName.js".
import { canSeeResults } from "./voting.js"
export { canSeeResults }

export const SURVEY_STATUS = Object.freeze({
  DRAFT: "draft",
  OPEN: "open",
  CLOSED: "closed",
  PUBLISHED: "published",
})

export function computeSurveyStatus(survey, now = new Date()) {
  if (survey.published_at) return SURVEY_STATUS.PUBLISHED
  if (!survey.opened_at) return SURVEY_STATUS.DRAFT
  const closesAt = survey.closes_at ? new Date(survey.closes_at) : null
  if (closesAt && !isNaN(closesAt.getTime()) && now.getTime() >= closesAt.getTime()) {
    return SURVEY_STATUS.CLOSED
  }
  return SURVEY_STATUS.OPEN
}

export function isSurveyOpen(survey, now = new Date()) {
  return computeSurveyStatus(survey, now) === SURVEY_STATUS.OPEN
}

// Same normalization as lib/voting.js's normalizeHouseNumber -- trims,
// lowercases, strips common prefixes. Duplicated rather than imported
// because it's a pure, tiny, dependency-free helper -- importing it would
// couple this file to lib/voting.js for no real benefit (unlike
// canSeeResults, which is a shared PERMISSION RULE, not a formatting
// helper, and matters that both hubs literally agree on it).
export function normalizeHouseNumber(raw) {
  if (!raw) return null
  return String(raw).trim().toLowerCase().replace(/^(unit|lot|house|#)\s*/, "").replace(/\s+/g, "")
}

// True if `member` shares a normalized house_number with anyone who has
// ALREADY SUBMITTED (not merely started a draft) a response to this survey.
// Unlike Voting's householdAlreadyVoted (which reads voting_participation,
// a separate identity-only table), this reads survey_responses directly --
// there's no split table here, per the ANONYMITY note above. Pass in the
// survey's existing SUBMITTED responses (member_id + house_number, joined
// from survey_responses + members) as `existingResponses`; a still-in-
// -progress draft (submitted_at IS NULL) from someone else in the same
// household does NOT block eligibility -- only a final, submitted one does.
export function householdAlreadySubmitted(member, existingResponses) {
  const mine = normalizeHouseNumber(member?.house_number)
  if (!mine) return false // no house_number -- per Iain's identical Voting decision, this member simply can't respond in per_household mode
  return existingResponses.some(r => r.member_id !== member.id && normalizeHouseNumber(r.house_number) === mine)
}

// Full eligibility check for STARTING OR RESUMING a response, mirroring
// lib/voting.js's isEligibleToVote:
//   - per_resident: any active member may respond, once.
//   - per_household: a member with no house_number cannot respond at all,
//     same rule as Voting ("Residents with no house cannot vote" ->
//     applied identically here). Otherwise blocked once anyone ELSE in the
//     same household has already SUBMITTED (not just started a draft).
// Does not check "do I already have a response row for this survey" --
// the caller (app/api/surveys/[id]/respond) looks that up directly, since
// an existing DRAFT response should be resumed, not blocked, while an
// existing SUBMITTED one means the one-shot rule already applied.
export function isEligibleForSurvey(survey, member, existingSubmittedResponses) {
  if (survey.eligibility_mode === "per_household") {
    if (!member?.house_number) {
      return { eligible: false, reason: "This survey is by household -- residents without a registered house number can't respond. Contact the office to register your unit." }
    }
    if (householdAlreadySubmitted(member, existingSubmittedResponses)) {
      return { eligible: false, reason: "Someone in your household has already responded to this survey." }
    }
  }
  return { eligible: true }
}

// Validates one answer's shape against its question's type before writing
// it -- same "validate in application code, not a DB CHECK that can't join
// back to survey_questions.type" convention as lib/voting.js's
// validateBallotSelection. `question` needs at least { id, type }, and for
// choice types the question's own valid choice ids (`validChoiceIds`).
// Returns { ok, reason } for one answer at a time -- the route loops this
// over every submitted answer before writing any of them.
export function validateAnswerShape(question, answer, validChoiceIds = []) {
  const { type } = question
  if (type === "single_choice") {
    if (!answer?.choice_id) return { ok: false, reason: "Select one option." }
    if (!validChoiceIds.includes(answer.choice_id)) return { ok: false, reason: "Unknown choice." }
    return { ok: true }
  }
  if (type === "multi_choice") {
    const ids = Array.isArray(answer?.choice_ids) ? answer.choice_ids : []
    if (ids.length === 0) return { ok: false, reason: "Select at least one option." }
    if (new Set(ids).size !== ids.length) return { ok: false, reason: "Duplicate selection." }
    for (const id of ids) {
      if (!validChoiceIds.includes(id)) return { ok: false, reason: "Unknown choice." }
    }
    return { ok: true }
  }
  if (type === "rating") {
    const v = Number(answer?.rating_value)
    if (!Number.isInteger(v) || v < 1 || v > 10) return { ok: false, reason: "Rating must be 1-10." }
    return { ok: true }
  }
  if (type === "yes_no") {
    if (typeof answer?.yes_no !== "boolean") return { ok: false, reason: "Select Yes or No." }
    return { ok: true }
  }
  if (type === "free_text") {
    // free_text has no required minimum content here -- the item-level
    // `required` flag (survey_items.required) is what the route checks
    // separately to decide whether an EMPTY answer is allowed at all; this
    // function only validates the SHAPE of a non-empty one.
    if (answer?.free_text != null && typeof answer.free_text !== "string") {
      return { ok: false, reason: "Invalid response." }
    }
    return { ok: true }
  }
  return { ok: false, reason: "Unknown question type." }
}

// True if this question TYPE is allowed to carry an optional per-response
// comment at all (survey_items.allow_comment, 102_survey_comments.sql,
// Iain: "every question type except free_text" -- free_text is already a
// freeform comment field, a second one on top of it adds nothing). This is
// a TYPE-level rule, not the per-survey-attachment toggle itself --
// survey_items.allow_comment is the separate "is it actually turned on for
// THIS survey" switch a caller must check as well.
export function canQuestionHaveComment(question) {
  return question?.type !== 'free_text'
}

// Given one item (must include allow_comment) and its raw submitted answer
// object, resolves the trimmed comment text to actually write, or null if
// there's nothing to write -- centralizes the "type says no" / "toggle says
// no" / "nothing typed" checks the respond route would otherwise repeat
// once per question type.
export function resolveCommentText(item, answer) {
  if (!item?.allow_comment) return null
  if (!canQuestionHaveComment(item.question)) return null
  const raw = answer?.comment
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed || null
}

// True if an answer object is genuinely empty (nothing meaningful to
// write) -- used by the respond route to decide whether a required
// question was actually left blank, vs. an optional one being skipped.
export function isAnswerEmpty(question, answer) {
  const { type } = question
  if (type === "single_choice") return !answer?.choice_id
  if (type === "multi_choice") return !Array.isArray(answer?.choice_ids) || answer.choice_ids.length === 0
  if (type === "rating") return answer?.rating_value == null
  if (type === "yes_no") return typeof answer?.yes_no !== "boolean"
  if (type === "free_text") return !answer?.free_text || !String(answer.free_text).trim()
  return true
}
