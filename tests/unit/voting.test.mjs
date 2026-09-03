// Unit tests for lib/voting.js — Governance Voting hub.
// Run: node tests/unit/voting.test.mjs

import {
  VOTING_STATUS, computeVotingStatus, isVotingOpen, normalizeHouseNumber,
  householdAlreadyVoted, isEligibleToVote, validateSelfVote,
  validateBallotSelection, tallyBallots, householdAnomalyReport, canSeeResults,
} from '../../lib/voting.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

// ── computeVotingStatus — the whole point is this is computed, not stored ──
ok(computeVotingStatus({ opened_at: null, closes_at: null, published_at: null }) === VOTING_STATUS.DRAFT,
  'no opened_at => Draft')

ok(computeVotingStatus({ opened_at: '2026-09-01T00:00:00Z', closes_at: '2026-09-10T00:00:00Z', published_at: null }, new Date('2026-09-05T00:00:00Z')) === VOTING_STATUS.OPEN,
  'opened, before closes_at => Open')

ok(computeVotingStatus({ opened_at: '2026-09-01T00:00:00Z', closes_at: '2026-09-10T00:00:00Z', published_at: null }, new Date('2026-09-10T00:00:00Z')) === VOTING_STATUS.CLOSED,
  'opened, exactly at closes_at => Closed (boundary is inclusive of closed)')

ok(computeVotingStatus({ opened_at: '2026-09-01T00:00:00Z', closes_at: '2026-09-10T00:00:00Z', published_at: null }, new Date('2026-09-09T23:59:59Z')) === VOTING_STATUS.OPEN,
  'one second before closes_at => still Open')

ok(computeVotingStatus({ opened_at: '2026-09-01T00:00:00Z', closes_at: '2026-09-10T00:00:00Z', published_at: '2026-09-11T00:00:00Z' }, new Date('2026-09-05T00:00:00Z')) === VOTING_STATUS.PUBLISHED,
  'published_at set => Published, even if now() is technically still before closes_at (published always wins)')

ok(isVotingOpen({ opened_at: '2026-09-01T00:00:00Z', closes_at: '2026-09-10T00:00:00Z' }, new Date('2026-09-05T00:00:00Z')) === true,
  'isVotingOpen convenience wrapper agrees with computeVotingStatus')

// ── normalizeHouseNumber ──
ok(normalizeHouseNumber('12') === '12', 'plain number unchanged')
ok(normalizeHouseNumber('Unit 12') === '12', 'strips "Unit " prefix')
ok(normalizeHouseNumber(' 12 ') === '12', 'trims whitespace')
ok(normalizeHouseNumber('LOT 5') === '5', 'strips "LOT " prefix, case-insensitive')
ok(normalizeHouseNumber('#7') === '7', 'strips "#" prefix')
ok(normalizeHouseNumber(null) === null, 'null => null')
ok(normalizeHouseNumber('') === null, 'empty string => null')

// ── householdAlreadyVoted ──
const participants = [
  { member_id: 'm1', house_number: '12' },
  { member_id: 'm2', house_number: 'Unit 34' },
]
ok(householdAlreadyVoted({ id: 'm3', house_number: '12' }, participants) === true,
  'another member at the same house_number has already voted => true')
ok(householdAlreadyVoted({ id: 'm3', house_number: '34' }, participants) === true,
  'normalized match against "Unit 34" => true')
ok(householdAlreadyVoted({ id: 'm1', house_number: '12' }, participants) === false,
  'the SAME member is excluded from the check against themselves')
ok(householdAlreadyVoted({ id: 'm3', house_number: '99' }, participants) === false,
  'no match at a different house => false')
ok(householdAlreadyVoted({ id: 'm3', house_number: null }, participants) === false,
  'no house_number at all => false (handled separately by isEligibleToVote, not this function)')

// ── isEligibleToVote ──
ok(isEligibleToVote({ eligibility_mode: 'per_resident' }, { id: 'm1', house_number: null }, []).eligible === true,
  'per_resident: no house_number needed, always eligible')

const noHouse = isEligibleToVote({ eligibility_mode: 'per_household' }, { id: 'm1', house_number: null }, [])
ok(noHouse.eligible === false && /house number/i.test(noHouse.reason),
  'per_household: a member with no house_number is explicitly ineligible (Iain, 2026-09-02)')

const houseTaken = isEligibleToVote({ eligibility_mode: 'per_household' }, { id: 'm3', house_number: '12' }, participants)
ok(houseTaken.eligible === false && /household/i.test(houseTaken.reason),
  'per_household: blocked once someone else at the same house has voted')

const houseFree = isEligibleToVote({ eligibility_mode: 'per_household' }, { id: 'm9', house_number: '99' }, participants)
ok(houseFree.eligible === true, 'per_household: eligible when nobody at that house has voted yet')

// ── validateSelfVote ──
const choices = [
  { id: 'c1', candidate_member_id: 'm1' },
  { id: 'c2', candidate_member_id: 'm2' },
  { id: 'c3', candidate_member_id: null },
]
ok(validateSelfVote({ allow_self_vote: true }, { id: 'm1' }, ['c1'], choices).ok === true,
  'allow_self_vote=true => never blocked')
ok(validateSelfVote({ allow_self_vote: false }, { id: 'm1' }, ['c1'], choices).ok === false,
  'allow_self_vote=false, voting for own candidacy => blocked')
ok(validateSelfVote({ allow_self_vote: false }, { id: 'm1' }, ['c2'], choices).ok === true,
  'allow_self_vote=false, voting for someone else => fine')
ok(validateSelfVote({ allow_self_vote: false }, { id: 'm9' }, ['c3'], choices).ok === true,
  'allow_self_vote=false, a non-candidate choice (candidate_member_id null) => never blocked')

// ── validateBallotSelection ──
const allIds = ['c1', 'c2', 'c3']
ok(validateBallotSelection({ vote_mode: 'single' }, [], allIds).ok === false, 'empty selection rejected')
ok(validateBallotSelection({ vote_mode: 'single' }, ['c1'], allIds).ok === true, 'single mode, exactly one => ok')
ok(validateBallotSelection({ vote_mode: 'single' }, ['c1', 'c2'], allIds).ok === false, 'single mode, two selected => rejected')
ok(validateBallotSelection({ vote_mode: 'single' }, ['zzz'], allIds).ok === false, 'unknown choice id => rejected')
ok(validateBallotSelection({ vote_mode: 'single' }, ['c1', 'c1'], allIds).ok === false, 'duplicate id in one submission => rejected')
ok(validateBallotSelection({ vote_mode: 'multi', max_selections: 2 }, ['c1', 'c2'], allIds).ok === true, 'multi mode, exactly at max => ok')
ok(validateBallotSelection({ vote_mode: 'multi', max_selections: 2 }, ['c1', 'c2', 'c3'], allIds).ok === false, 'multi mode, over max => rejected')
ok(validateBallotSelection({ vote_mode: 'multi', max_selections: null }, ['c1', 'c2', 'c3'], allIds).ok === true, 'multi mode, max_selections null falls back to allChoiceIds.length (select-all-that-apply)')

// ── tallyBallots — never touches member identity, purely choice_id counts ──
const ballots = [{ choice_id: 'c1' }, { choice_id: 'c1' }, { choice_id: 'c2' }]
const tally = tallyBallots(ballots)
ok(tally.get('c1') === 2 && tally.get('c2') === 1 && !tally.has('c3'), 'tally counts correctly, absent choice has no entry')

// ── householdAnomalyReport ──
ok(householdAnomalyReport({ eligibility_mode: 'per_resident' }, participants).length === 0,
  'per_resident mode never produces an anomaly report')

const dupParticipants = [
  { member_id: 'm1', house_number: '12' },
  { member_id: 'm2', house_number: 'Unit 12' }, // same house, normalized
  { member_id: 'm3', house_number: '34' },
]
const anomalies = householdAnomalyReport({ eligibility_mode: 'per_household' }, dupParticipants)
ok(anomalies.length === 1 && anomalies[0].normalizedHouseNumber === '12' && anomalies[0].memberIds.length === 2,
  'per_household mode flags exactly the one house with 2+ voters, matched after normalization')

// ── canSeeResults ──
ok(canSeeResults({ results_visibility_outcome: 'admin_only' }, { field: 'results_visibility_outcome', isAdmin: false }) === false,
  'admin_only + non-admin viewer => cannot see')
ok(canSeeResults({ results_visibility_outcome: 'admin_only' }, { field: 'results_visibility_outcome', isAdmin: true }) === true,
  'admin_only + admin viewer => can always see')
ok(canSeeResults({ results_visibility_outcome: 'residents' }, { field: 'results_visibility_outcome', isAdmin: false }) === true,
  'residents visibility => any viewer can see')

console.log(`\nvoting.test.mjs: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
