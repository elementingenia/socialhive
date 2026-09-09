// Unit tests for lib/surveys.js — Surveys hub.
// Run: node tests/unit/surveys.test.mjs

import {
  SURVEY_STATUS, computeSurveyStatus, isSurveyOpen, normalizeHouseNumber,
  householdAlreadySubmitted, isEligibleForSurvey, validateAnswerShape,
  isAnswerEmpty, canSeeResults, canQuestionHaveComment, resolveCommentText,
} from '../../lib/surveys.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

// ── computeSurveyStatus — computed live, never stored (same pattern as Voting) ──
ok(computeSurveyStatus({ opened_at: null, closes_at: null, published_at: null }) === SURVEY_STATUS.DRAFT,
  'no opened_at => Draft')

ok(computeSurveyStatus({ opened_at: '2026-09-01T00:00:00Z', closes_at: '2026-09-10T00:00:00Z', published_at: null }, new Date('2026-09-05T00:00:00Z')) === SURVEY_STATUS.OPEN,
  'opened, before closes_at => Open')

ok(computeSurveyStatus({ opened_at: '2026-09-01T00:00:00Z', closes_at: '2026-09-10T00:00:00Z', published_at: null }, new Date('2026-09-10T00:00:00Z')) === SURVEY_STATUS.CLOSED,
  'opened, at/after closes_at, not published => Closed')

ok(computeSurveyStatus({ opened_at: '2026-09-01T00:00:00Z', closes_at: '2026-09-10T00:00:00Z', published_at: '2026-09-11T00:00:00Z' }, new Date('2026-09-20T00:00:00Z')) === SURVEY_STATUS.PUBLISHED,
  'published_at set => Published, regardless of closes_at')

ok(isSurveyOpen({ opened_at: '2026-09-01T00:00:00Z', closes_at: '2026-09-10T00:00:00Z', published_at: null }, new Date('2026-09-05T00:00:00Z')) === true,
  'isSurveyOpen true during the open window')
ok(isSurveyOpen({ opened_at: null }, new Date()) === false, 'isSurveyOpen false for Draft')

// ── normalizeHouseNumber ──
ok(normalizeHouseNumber('Unit 12') === '12', 'strips "Unit " prefix and lowercases')
ok(normalizeHouseNumber('  #7 ') === '7', 'strips "#" prefix and trims whitespace')
ok(normalizeHouseNumber(null) === null, 'null stays null')
ok(normalizeHouseNumber('') === null, 'empty string stays null')

// ── householdAlreadySubmitted — only counts SUBMITTED responses, not drafts ──
const submittedInHouse12 = [
  { member_id: 'm1', house_number: '12' },
  { member_id: 'm2', house_number: 'Unit 34' },
]
ok(householdAlreadySubmitted({ id: 'm9', house_number: '12' }, submittedInHouse12) === true,
  'same normalized house_number as an existing submitted response => blocked')
ok(householdAlreadySubmitted({ id: 'm9', house_number: '99' }, submittedInHouse12) === false,
  'different house_number => not blocked')
ok(householdAlreadySubmitted({ id: 'm1', house_number: '12' }, submittedInHouse12) === false,
  "a member never blocks against their OWN existing response row (member_id !== member.id check)")
ok(householdAlreadySubmitted({ id: 'm9', house_number: null }, submittedInHouse12) === false,
  'no house_number => normalizeHouseNumber(null) short-circuits false here (isEligibleForSurvey handles that case separately)')

// ── isEligibleForSurvey ──
ok(isEligibleForSurvey({ eligibility_mode: 'per_resident' }, { id: 'm1', house_number: null }, []).eligible === true,
  'per_resident mode: no house_number needed')
{
  const res = isEligibleForSurvey({ eligibility_mode: 'per_household' }, { id: 'm1', house_number: null }, [])
  ok(res.eligible === false && /house number/i.test(res.reason),
    'per_household mode: no house_number => ineligible with a clear reason')
}
{
  const res = isEligibleForSurvey({ eligibility_mode: 'per_household' }, { id: 'm9', house_number: '12' }, submittedInHouse12)
  ok(res.eligible === false && /household/i.test(res.reason),
    'per_household mode: someone else in the house already submitted => ineligible')
}
ok(isEligibleForSurvey({ eligibility_mode: 'per_household' }, { id: 'm9', house_number: '99' }, submittedInHouse12).eligible === true,
  'per_household mode: no household conflict => eligible')

// ── validateAnswerShape ──
const choices = ['c1', 'c2', 'c3']
ok(validateAnswerShape({ type: 'single_choice' }, { choice_id: 'c1' }, choices).ok === true,
  'single_choice: a valid choice_id passes')
ok(validateAnswerShape({ type: 'single_choice' }, { choice_id: 'unknown' }, choices).ok === false,
  'single_choice: an unknown choice_id fails')
ok(validateAnswerShape({ type: 'single_choice' }, {}, choices).ok === false,
  'single_choice: missing choice_id fails')

ok(validateAnswerShape({ type: 'multi_choice' }, { choice_ids: ['c1', 'c2'] }, choices).ok === true,
  'multi_choice: multiple valid choice_ids passes')
ok(validateAnswerShape({ type: 'multi_choice' }, { choice_ids: [] }, choices).ok === false,
  'multi_choice: empty selection fails')
ok(validateAnswerShape({ type: 'multi_choice' }, { choice_ids: ['c1', 'c1'] }, choices).ok === false,
  'multi_choice: duplicate choice_ids fails')
ok(validateAnswerShape({ type: 'multi_choice' }, { choice_ids: ['c1', 'zzz'] }, choices).ok === false,
  'multi_choice: any unknown choice_id fails the whole answer')

ok(validateAnswerShape({ type: 'rating' }, { rating_value: 7 }).ok === true, 'rating: 7 is valid')
ok(validateAnswerShape({ type: 'rating' }, { rating_value: 1 }).ok === true, 'rating: 1 (lower bound) is valid')
ok(validateAnswerShape({ type: 'rating' }, { rating_value: 10 }).ok === true, 'rating: 10 (upper bound) is valid')
ok(validateAnswerShape({ type: 'rating' }, { rating_value: 0 }).ok === false, 'rating: 0 is out of range')
ok(validateAnswerShape({ type: 'rating' }, { rating_value: 11 }).ok === false, 'rating: 11 is out of range')
ok(validateAnswerShape({ type: 'rating' }, { rating_value: 5.5 }).ok === false, 'rating: non-integer fails')
ok(validateAnswerShape({ type: 'rating' }, {}).ok === false, 'rating: missing value fails')

ok(validateAnswerShape({ type: 'yes_no' }, { yes_no: true }).ok === true, 'yes_no: true is valid')
ok(validateAnswerShape({ type: 'yes_no' }, { yes_no: false }).ok === true, 'yes_no: false is valid')
ok(validateAnswerShape({ type: 'yes_no' }, {}).ok === false, 'yes_no: missing value fails')
ok(validateAnswerShape({ type: 'yes_no' }, { yes_no: 'true' }).ok === false, 'yes_no: string "true" fails -- must be a real boolean')

ok(validateAnswerShape({ type: 'free_text' }, { free_text: 'Great BBQ!' }).ok === true, 'free_text: a string passes')
ok(validateAnswerShape({ type: 'free_text' }, {}).ok === true, 'free_text: no shape violation for an absent (optional) answer')
ok(validateAnswerShape({ type: 'free_text' }, { free_text: 123 }).ok === false, 'free_text: a non-string value fails')

ok(validateAnswerShape({ type: 'not_a_real_type' }, {}).ok === false, 'unknown question type always fails')

// ── isAnswerEmpty ──
ok(isAnswerEmpty({ type: 'single_choice' }, {}) === true, 'single_choice: no choice_id => empty')
ok(isAnswerEmpty({ type: 'single_choice' }, { choice_id: 'c1' }) === false, 'single_choice: has choice_id => not empty')
ok(isAnswerEmpty({ type: 'multi_choice' }, { choice_ids: [] }) === true, 'multi_choice: empty array => empty')
ok(isAnswerEmpty({ type: 'multi_choice' }, { choice_ids: ['c1'] }) === false, 'multi_choice: non-empty array => not empty')
ok(isAnswerEmpty({ type: 'rating' }, {}) === true, 'rating: no value => empty')
ok(isAnswerEmpty({ type: 'rating' }, { rating_value: 0 }) === false, 'rating: 0 is a real (if invalid-range) value, not empty -- validateAnswerShape catches the range separately')
ok(isAnswerEmpty({ type: 'yes_no' }, {}) === true, 'yes_no: no value => empty')
ok(isAnswerEmpty({ type: 'yes_no' }, { yes_no: false }) === false, 'yes_no: false is a real answer, not empty')
ok(isAnswerEmpty({ type: 'free_text' }, { free_text: '   ' }) === true, 'free_text: whitespace-only => empty')
ok(isAnswerEmpty({ type: 'free_text' }, { free_text: 'ok' }) === false, 'free_text: real content => not empty')

// ── canSeeResults is re-exported from lib/voting.js -- confirm it's the SAME function, not a copy ──
ok(typeof canSeeResults === 'function', 'canSeeResults is exported from lib/surveys.js')
ok(canSeeResults({ results_visibility_outcome: 'admin_only' }, { field: 'results_visibility_outcome', isCoordinator: true }) === true,
  'canSeeResults behaves identically here as in lib/voting.js (coordinator-only, Change Request #3)')
ok(canSeeResults({ results_visibility_outcome: 'admin_only' }, { field: 'results_visibility_outcome', isCoordinator: false }) === false,
  'canSeeResults: no blanket admin bypass here either')

// ── canQuestionHaveComment / resolveCommentText (102_survey_comments.sql) ──
ok(canQuestionHaveComment({ type: 'single_choice' }) === true, 'canQuestionHaveComment: single_choice allowed')
ok(canQuestionHaveComment({ type: 'multi_choice' }) === true, 'canQuestionHaveComment: multi_choice allowed')
ok(canQuestionHaveComment({ type: 'rating' }) === true, 'canQuestionHaveComment: rating allowed')
ok(canQuestionHaveComment({ type: 'yes_no' }) === true, 'canQuestionHaveComment: yes_no allowed')
ok(canQuestionHaveComment({ type: 'free_text' }) === false, 'canQuestionHaveComment: free_text is NEVER allowed -- it is already a comment field')

ok(resolveCommentText({ allow_comment: true, question: { type: 'rating' } }, { comment: '  Great BBQ  ' }) === 'Great BBQ',
  'resolveCommentText: trims whitespace and returns the comment when allowed and provided')
ok(resolveCommentText({ allow_comment: false, question: { type: 'rating' } }, { comment: 'x' }) === null,
  'resolveCommentText: null when the survey_items toggle is off, regardless of type')
ok(resolveCommentText({ allow_comment: true, question: { type: 'free_text' } }, { comment: 'x' }) === null,
  'resolveCommentText: null for free_text even if allow_comment was somehow set (type-level rule always wins)')
ok(resolveCommentText({ allow_comment: true, question: { type: 'rating' } }, { comment: '   ' }) === null,
  'resolveCommentText: whitespace-only comment resolves to null, not an empty string')
ok(resolveCommentText({ allow_comment: true, question: { type: 'rating' } }, {}) === null,
  'resolveCommentText: no comment field at all => null')
ok(resolveCommentText({ allow_comment: true, question: { type: 'rating' } }, { comment: 123 }) === null,
  'resolveCommentText: a non-string comment value is ignored, not coerced')

console.log(`\nsurveys.test.mjs: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
