// Unit tests for lib/fairPick.js -- Show Time > Manage > Pick a Film.
//
//   npm run test:unit

import {
  attendanceWeight, voterProfiles, voteValue, typicalCount, filmVotes, fairScore,
  rankFilms, pickLabel, voteNotes, relativeScore, MIN_SPREAD,
  DEFAULT_FAIR_PICK_CONFIG, parseFairPickConfig, validateFairPickConfig, cloneDefaults, bucketSummary, DOWN_CAP, UP_CAP,
} from '../../lib/fairPick.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }
const eq = (a, e, msg) => ok(JSON.stringify(a) === JSON.stringify(e), `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(e)})`)
const near = (a, e, msg) => ok(Math.abs(a - e) < 1e-9, `${msg} (got ${a}, expected ${e})`)

// Attendance weights (Iain, 2026-10-26): 0 -> 25%, 1 -> 50%, 2 -> 75%, 3+ -> 100%
eq([0, 1, 2, 3, 12].map(attendanceWeight), [0.25, 0.5, 0.75, 1, 1], 'attendance weights')
eq(attendanceWeight(undefined), 0.25, 'missing attendance counts as none')
eq(attendanceWeight(-2), 0.25, 'negative attendance treated as none')

// Profiles: mean and spread from all of a voter's votes, spread floored
{
  const p = voterProfiles([
    { movie_id: 'a', member_id: 'x', score: 2 }, { movie_id: 'b', member_id: 'x', score: 8 },
    { movie_id: 'a', member_id: 'y', score: 10 }, { movie_id: 'b', member_id: 'y', score: 10 },
    { movie_id: 'c', member_id: null, score: 5 }, { movie_id: 'c', member_id: 'z', score: null },
  ])
  near(p.x.mean, 5, 'mean of a voter')
  near(p.x.spread, 3, 'spread of a voter')
  near(p.y.spread, MIN_SPREAD, 'always-10 voter gets the minimum spread')
  eq(p.z, undefined, 'rows without a numeric score are ignored')
}

// Vote value: judged against the voter's habits, with the veto cap
{
  const harsh = { mean: 4, spread: 3, count: 50 }
  const kind = { mean: 8, spread: 1.5, count: 50 }
  ok(voteValue(1, harsh).raw > voteValue(1, kind).raw && voteValue(3, harsh).value > voteValue(3, kind).value, 'a 1 from a habitual low scorer counts for less than from a generous voter')
  eq(voteValue(1, kind).value, -DOWN_CAP, 'downside is capped')
  ok(voteValue(1, kind).cappedDown, 'cap is reported')
  eq(voteValue(10, { mean: 2, spread: 1.5 }).value, UP_CAP, 'upside is capped')
  near(voteValue(10, { mean: 10, spread: 1.5 }).value, 0, "always-10 voter's 10 is neutral")
  near(voteValue(7, undefined).value, 0, 'no profile -> neutral, not a crash')
}

// Typical vote count
eq(typicalCount([1, 3, 5, 0]), 3, 'median of films with votes')
eq(typicalCount([1, 1]), 2, 'minimum 2')
eq(typicalCount([]), 2, 'no films -> 2')

// Single-voter cap: no voter above a third of total weight (real + neutral)
{
  const votes = [{ movie_id: 'f', member_id: 'a', score: 9 }]
  const fv = filmVotes(votes, voterProfiles(votes), { a: 5 }, 2)
  near(fv[0].weight, 0.99, 'one full voter with typical 2: total 3, cap 33% = 0.99')
  const fv2 = filmVotes(votes, voterProfiles(votes), { a: 5 }, 1)
  near(fv2[0].weight, 0.66, 'typical 1: total 2, cap 33% = 0.66')
  ok(fv2[0].shareCapped, 'share cap is reported')
}

// Non-attenders count for less
{
  const all = [
    { movie_id: 'f', member_id: 'reg', score: 9 }, { movie_id: 'g', member_id: 'reg', score: 5 },
    { movie_id: 'f', member_id: 'non', score: 1 }, { movie_id: 'g', member_id: 'non', score: 9 },
  ]
  const prof = voterProfiles(all)
  const withAtt = fairScore(filmVotes(all.filter(v => v.movie_id === 'f'), prof, { reg: 6, non: 0 }, 2), 2)
  const equal = fairScore(filmVotes(all.filter(v => v.movie_id === 'f'), prof, { reg: 6, non: 6 }, 2), 2)
  ok(withAtt > equal, "a non-attender's low score drags a film less than a regular's would")
}

// Ranking: under 3 votes -> Needs more votes; habitual low scorer can't sink a film
{
  const v = []
  const add = (m, f, s) => v.push({ movie_id: f, member_id: m, score: s })
  // a habitual 1-giver who sometimes gives 10
  ;['p', 'q', 'r', 's', 't'].forEach(f => add('grump', f, 1))
  add('grump', 'liked', 1); add('grump', 'other', 10)
  ;['ann', 'bob', 'cat'].forEach(m => { add(m, 'liked', 9); add(m, 'other', 7); add(m, 'p', 5) })
  add('ann', 'solo', 10)
  const films = ['liked', 'other', 'solo'].map(id => ({ id, title: id }))
  const att = { grump: 0, ann: 5, bob: 5, cat: 5 }
  const { ranked, needsVotes } = rankFilms(films, v, att)
  eq(ranked.map(f => f.id), ['liked', 'other'], 'liked film ranks above, despite the grump scoring it 1')
  eq(needsVotes.map(f => f.id), ['solo'], 'single-vote film is not ranked')
  eq(ranked[0].count, 4, 'count is all votes')
  near(ranked[0].avg, 7, 'avg is the plain average')
  ok(typeof ranked[0].label === 'string', 'ranked films get a label')
  eq(needsVotes[0].label, undefined, 'needs-more-votes films get no label')
}

// Relative score: against voters' own norms, no pull toward neutral
{
  const all = [
    { movie_id: 'p', member_id: 'a', score: 5 }, { movie_id: 'q', member_id: 'a', score: 5 },
    { movie_id: 'f', member_id: 'a', score: 9 }, { movie_id: 'g', member_id: 'a', score: 3 },
    { movie_id: 'p', member_id: 'h', score: 1 }, { movie_id: 'q', member_id: 'h', score: 1 },
    { movie_id: 'f', member_id: 'h', score: 1 }, { movie_id: 'g', member_id: 'h', score: 1 },
  ]
  const prof = voterProfiles(all)
  const att = { a: 5, h: 5 }
  ok(relativeScore(all.filter(v => v.movie_id === 'f'), prof, att) > 0, 'average 5 but above the regular voter\'s norm, habitual 1-giver neutral -> positive')
  ok(relativeScore(all.filter(v => v.movie_id === 'g'), prof, att) < 0, 'below the regular voter\'s norm -> negative')
  eq(relativeScore([], prof, att), 0, 'no votes -> 0')
}

eq(rankFilms([], [], {}).ranked, [], 'empty input')
eq([0.5, 0.2, 0.0].map(pickLabel), ['Strong pick', 'Good pick', 'Lukewarm'], 'labels')

// Notes explaining a discounted vote
{
  const n = voteNotes({ score: 1, attended: 0, attendanceWeight: 0.25, cappedDown: true, shareCapped: false },
    { mean: 4, spread: 3, count: 40 })
  eq(n, ['Counts 25%', 'Low score capped', 'Usually scores low (average 4.0)'], 'notes for a discounted vote')
  eq(voteNotes({ score: 8, attended: 4, attendanceWeight: 1, cappedDown: false, shareCapped: false }, { mean: 7, spread: 2, count: 20 }),
    [], 'full-value vote has no notes')
}

// ── Configurable settings (2026-10-27) ──
{
  const d = cloneDefaults()
  eq(validateFairPickConfig(d), null, 'defaults are valid')
  eq(bucketSummary(d.attendanceBuckets), '0: 25% · 1: 50% · 2: 75% · 3+: 100%', 'default bucket summary')
  eq(bucketSummary([{ from: 0, weight: 20 }, { from: 2, weight: 60 }, { from: 5, weight: 100 }]), '0–1: 20% · 2–4: 60% · 5+: 100%', 'ranges in summary')

  const custom = { ...d, attendanceBuckets: [{ from: 5, weight: 100 }, { from: 0, weight: 10 }, { from: 2, weight: 60 }] }
  eq([0, 1, 2, 4, 5, 9].map(n => attendanceWeight(n, custom)), [0.1, 0.1, 0.6, 0.6, 1, 1], 'custom buckets, unsorted input')
  eq(attendanceWeight(3, { ...d, attendanceBuckets: [{ from: 0, weight: 100 }] }), 1, 'single bucket = everyone full weight')

  ok(validateFairPickConfig({ ...d, attendanceBuckets: [{ from: 1, weight: 50 }] }), 'must have a bucket at 0')
  ok(validateFairPickConfig({ ...d, attendanceBuckets: [{ from: 0, weight: 50 }, { from: 0, weight: 60 }] }), 'duplicate start rejected')
  ok(validateFairPickConfig({ ...d, attendanceBuckets: [{ from: 0, weight: 120 }] }), 'weight over 100 rejected')
  ok(validateFairPickConfig({ ...d, attendanceBuckets: [{ from: 0, weight: 0 }] }), 'all-zero weights rejected')
  ok(validateFairPickConfig({ ...d, attendanceBuckets: [{ from: 0.5, weight: 50 }] }), 'fractional screenings rejected')
  ok(validateFairPickConfig({ ...d, attendanceBuckets: [] }), 'no buckets rejected')
  ok(validateFairPickConfig({ ...d, attendanceDays: 10 }), 'attendance days below range rejected')
  ok(validateFairPickConfig({ ...d, minRankedVotes: 2.5 }), 'whole number required')
  ok(validateFairPickConfig({ ...d, strongScore: 0.1, goodScore: 0.2 }), 'strong must exceed good')
  ok(validateFairPickConfig({ ...d, downCap: NaN }), 'NaN rejected')
  eq(validateFairPickConfig({ ...d, recentShownDays: 0 }), null, '0 recent days allowed')

  eq(parseFairPickConfig(null), cloneDefaults(), 'nothing saved -> defaults')
  eq(parseFairPickConfig('not json'), cloneDefaults(), 'bad JSON -> defaults')
  eq(parseFairPickConfig(JSON.stringify({ attendanceDays: 5 })), cloneDefaults(), 'invalid saved value -> defaults, never broken')
  eq(parseFairPickConfig(JSON.stringify({ attendanceDays: 180 })).attendanceDays, 180, 'partial save merges with defaults')
  eq(parseFairPickConfig(JSON.stringify({ attendanceDays: 180 })).attendanceBuckets, cloneDefaults().attendanceBuckets, 'buckets default when not saved')
  ok(Object.isFrozen(DEFAULT_FAIR_PICK_CONFIG), 'defaults cannot be mutated')

  // Config flows through ranking: raising minRankedVotes moves films to needsVotes
  const v = [], add = (m, f, s) => v.push({ movie_id: f, member_id: m, score: s })
  ;['a', 'b', 'c'].forEach(m => { add(m, 'x', 8); add(m, 'y', 6) })
  const films = [{ id: 'x' }, { id: 'y' }]
  eq(rankFilms(films, v, {}).ranked.length, 2, '3 votes ranked by default')
  eq(rankFilms(films, v, {}, { ...d, minRankedVotes: 4 }).ranked.length, 0, 'minRankedVotes 4 -> none ranked')
  eq(voteNotes({ score: 5, attended: 9, attendanceWeight: 1, cappedDown: false, shareCapped: true }, null, { ...d, maxVoterSharePct: 40 }), ['Capped at 40% of this film'], 'note uses configured share')
}

console.log(`fairPick: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
