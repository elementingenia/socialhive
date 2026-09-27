// Unit tests for lib/movieScores.js -- community score shown on the
// Suggestions cards and both "Rate a Film" cards.
//
//   npm run test:unit

import { communityAverages } from '../../lib/movieScores.js'

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

console.log(`movieScores: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
