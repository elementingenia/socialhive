// Unit tests for lib/movieScores.js -- community score shown on the
// Suggestions cards and both "Rate a Film" cards.
//
//   npm run test:unit

import { communityAverages, interestScore, typicalVoteCount, NEUTRAL_SCORE } from '../../lib/movieScores.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }
const eq = (actual, expected, msg) => ok(JSON.stringify(actual) === JSON.stringify(expected), `${msg} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`)

{
  const votes = [
    { movie_id: 'm1', score: 8 },
    { movie_id: 'm1', score: 5 },
    { movie_id: 'm2', score: 10 },
    { movie_id: 'm1', score: 2 },
  ]
  const r = communityAverages(votes)
  eq(r.m1, { avg: 5, count: 3 }, 'averages all votes for a movie with count')
  eq(r.m2, { avg: 10, count: 1 }, 'single vote -> that score, count 1')
  eq(r.m3, undefined, 'movie with no votes has no entry (card shows "Not yet rated")')
}

{
  eq(communityAverages(null), {}, 'null -> empty, not a crash')
  eq(communityAverages([]), {}, 'no votes -> empty')
  eq(communityAverages([{ movie_id: 'm1', score: null }, { movie_id: null, score: 5 }, null]), {}, 'rows without a movie or numeric score are ignored')
}

{
  // typical = median vote count, minimum 2
  eq(typicalVoteCount({ a:{avg:8,count:2}, b:{avg:8,count:6}, c:{avg:8,count:9} }), 6, 'median of counts')
  eq(typicalVoteCount({ a:{avg:8,count:2}, b:{avg:8,count:6} }), 4, 'even list -> mean of middle two')
  eq(typicalVoteCount({ a:{avg:8,count:1} }), 2, 'floored at 2')
  eq(typicalVoteCount({}), 2, 'no data -> 2')
  eq(interestScore(undefined, 6), 0, 'no votes -> 0, ranks last')
  ok(Math.abs(interestScore({avg:9,count:6}, 6) - (9+NEUTRAL_SCORE)/2) < 1e-9, 'typical voters -> halfway between own average and neutral')
  // Iain's real examples (live data, 2026-10-17, typical = 6)
  const loveActually = interestScore({ avg:9.5, count:2 }, 6)
  const remarkably   = interestScore({ avg:8.1, count:7 }, 6)
  const judy         = interestScore({ avg:8.5, count:6 }, 6)
  ok(remarkably > loveActually, 'more interested voters beat a high average from two votes')
  ok(Math.abs(remarkably - judy) < 0.2, 'Remarkably Bright Creatures sits alongside Judy')
  // Many lukewarm votes hold a film down
  ok(interestScore({ avg:5, count:20 }, 6) < interestScore({ avg:5, count:2 }, 6), 'more below-neutral votes drag lower')
  ok(interestScore({ avg:8, count:20 }, 6) > interestScore({ avg:8, count:4 }, 6), 'more positive votes lift higher')
}

console.log(`movieScores: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
