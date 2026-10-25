// Unit tests for lib/suggestionList.js -- Show Time > Suggestions tabs,
// grace period, Others, retiring, vote spread, Rate a Film order.
//
//   npm run test:unit

import { guessNight, nightFor, inNight, isValidNight, daysOnList, isNew, suggestionStatus, voteSpread, voteSpreadLabel, rateQueue } from '../../lib/suggestionList.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }
const eq = (actual, expected, msg) => ok(JSON.stringify(actual) === JSON.stringify(expected), `${msg} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`)

const NOW = new Date('2026-10-25T05:00:00Z')
const ago = (d) => new Date(NOW.getTime() - d * 86400000).toISOString()

// ── tabs ──
eq(guessNight('Action, Drama'), 'action', 'Action -> action')
eq(guessNight('Thriller'), 'action', 'Thriller -> action')
eq(guessNight('drama / thriller'), 'action', 'slash-separated, lower case')
eq(guessNight('Drama, Romance'), 'sunday', 'Drama -> sunday')
eq(guessNight(null), 'sunday', 'no genre -> sunday')
eq(guessNight('Crime, Mystery'), 'sunday', 'Crime alone is not action')
eq(nightFor({ genre: 'Thriller, Drama', showtime_night: 'sunday' }), 'sunday', 'admin override wins')
eq(nightFor({ genre: 'Drama', showtime_night: 'action' }), 'action', 'override to action')
eq(nightFor({ genre: 'Action', showtime_night: 'junk' }), 'action', 'bad override ignored')
eq(nightFor({ genre: 'Drama', showtime_night: 'both' }), 'both', 'both override')
ok(inNight({ genre: 'Drama', showtime_night: 'both' }, 'action'), 'both shows in action tab')
ok(inNight({ genre: 'Drama', showtime_night: 'both' }, 'sunday'), 'both shows in sunday tab')
ok(inNight({ genre: 'Thriller' }, 'action') && !inNight({ genre: 'Thriller' }, 'sunday'), 'guessed action only in action tab')
ok(!inNight({ genre: 'Thriller', showtime_night: 'sunday' }, 'action'), 'override sunday leaves action tab')
ok(isValidNight('both') && isValidNight('action') && isValidNight('sunday') && !isValidNight('x') && !isValidNight(null), 'valid night values')

// ── clock ──
eq(Math.round(daysOnList({ added_at: ago(10) }, NOW)), 10, 'days from added_at')
eq(Math.round(daysOnList({ added_at: ago(90), suggestion_clock_from: ago(5) }, NOW)), 5, 'restore restarts clock')
eq(daysOnList({}, NOW), 0, 'no date -> 0')
ok(isNew({ added_at: ago(13) }, NOW), '13 days is new')
ok(!isNew({ added_at: ago(15) }, NOW), '15 days is not new')

// ── status ──
const st = (m, a, opt = {}) => suggestionStatus(m, a, { now: NOW, ...opt })
eq(st({ added_at: ago(3) }, undefined).status, 'main', 'new film with no votes stays in main')
ok(st({ added_at: ago(3) }, undefined).isNew, 'new film flagged New')
eq(st({ added_at: ago(20) }, { count: 2, avg: 9 }).status, 'others', 'after grace, 2 votes -> Others')
eq(st({ added_at: ago(20) }, { count: 3, avg: 9 }).status, 'main', '3 votes -> main')
eq(st({ added_at: ago(61) }, { count: 2, avg: 9 }).status, 'retired', '61 days, 2 votes -> retired')
ok(st({ added_at: ago(61) }, { count: 2, avg: 9 }).autoRetired, 'auto retired marked')
eq(st({ added_at: ago(59) }, { count: 2, avg: 9 }).status, 'others', '59 days, 2 votes -> still Others')
eq(st({ added_at: ago(61) }, { count: 4, avg: 6.2 }).flagged, true, '61 days, 4 votes, avg 6.2 -> flagged')
eq(st({ added_at: ago(61) }, { count: 4, avg: 7 }).flagged, false, 'avg exactly 7 not flagged')
eq(st({ added_at: ago(61) }, { count: 5, avg: 3 }).flagged, false, '5 votes not flagged')
eq(st({ added_at: ago(30) }, { count: 4, avg: 3 }).flagged, false, 'under 60 days not flagged')
eq(st({ added_at: ago(5), suggestion_retired_at: ago(1) }, { count: 9, avg: 9 }).status, 'retired', 'manual retire wins')
eq(st({ added_at: ago(200), suggestion_clock_from: ago(2) }, { count: 0 }).status, 'main', 'restored film back in grace')
eq(st({ added_at: ago(200) }, { count: 0 }, { scheduled: true }).status, 'main', 'scheduled never retired')
eq(st({ added_at: ago(200), suggestion_retired_at: ago(1) }, { count: 0 }, { scheduled: true }).status, 'main', 'scheduled beats manual retire')
eq(st({ added_at: ago(30) }, { count: 1 }, { scheduled: true }).status, 'main', 'scheduled never in Others')

// ── spread ──
const votes = [
  { movie_id: 'a', score: 8 }, { movie_id: 'a', score: 8 }, { movie_id: 'a', score: 8 },
  { movie_id: 'a', score: 5 }, { movie_id: 'a', score: 5 }, { movie_id: 'a', score: 1 }, { movie_id: 'a', score: 1 },
  { movie_id: 'b', score: 10 },
]
eq(voteSpread(votes, 'a'), [{ score: 8, count: 3 }, { score: 5, count: 2 }, { score: 1, count: 2 }], 'spread highest first')
eq(voteSpreadLabel(voteSpread(votes, 'a')), '7 votes: 3 × 8, 2 × 5, 2 × 1', 'spread label')
eq(voteSpreadLabel(voteSpread(votes, 'b')), '1 vote: 1 × 10', 'singular')
eq(voteSpreadLabel(voteSpread(votes, 'z')), 'No votes yet', 'empty')
ok(!voteSpreadLabel(voteSpread(votes, 'a')).includes('member'), 'no names in label')

// ── rate queue ──
const movies = [
  { id: 'old3', added_at: ago(40) },
  { id: 'old1', added_at: ago(40) },
  { id: 'new10', added_at: ago(10) },
  { id: 'gone', added_at: ago(90) },
  { id: 'new2', added_at: ago(2) },
  { id: 'gonebutbooked', added_at: ago(90) },
]
const counts = { old3: 4, old1: 1, new10: 0, gone: 1, new2: 0, gonebutbooked: 0 }
eq(rateQueue(movies, counts, { now: NOW }).map(m => m.id), ['new2', 'new10', 'old1', 'old3'], 'new first (newest first), then under 3, retired dropped')
eq(rateQueue(movies, counts, { now: NOW, scheduledIds: new Set(['gonebutbooked']) }).map(m => m.id), ['new2', 'new10', 'old1', 'gonebutbooked', 'old3'], 'scheduled film kept')

console.log(`suggestionList: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
