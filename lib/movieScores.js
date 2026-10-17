// Community score per movie: plain average of residents' 1-10 votes plus
// the vote count. Shared by the Suggestions list, both "Rate a Film"
// cards (Show Time home + Suggestions) so every place a movie's scores
// appear agrees on the numbers.
//
// Input is rows from the `votes` table ({ movie_id, score }). votes_read
// RLS lets any signed-in resident read every vote, so the browser client
// sees true counts (unlike bookings -- see lib/waitlist.js).

export function communityAverages(votes) {
  const sums = {}
  for (const v of votes || []) {
    if (!v || !v.movie_id || typeof v.score !== 'number') continue
    const s = sums[v.movie_id] || (sums[v.movie_id] = { total: 0, count: 0 })
    s.total += v.score
    s.count += 1
  }
  const out = {}
  for (const [id, s] of Object.entries(sums)) out[id] = { avg: s.total / s.count, count: s.count }
  return out
}

// Interest-weighted community score used to rank the Suggestions list
// (Community sort). Iain, 2026-10-17: the number of residents who voted
// is genuine "interest" and must carry weight -- a well-liked film with
// many voters should rank above one with a high average from two votes,
// and many lukewarm votes should hold a film down, not lift it.
//
// Shape: Bayesian average, pulled toward a NEUTRAL score (5.5, the
// middle of the 1-10 scale) until a film has about as many voters as a
// typical suggestion (the median vote count across voted films, min 2).
// Before this, the pull was toward the median film average (~7.0, already
// a good score), so two 9.5 votes barely moved and extra voters added
// almost nothing. Both inputs that matter are live: `typical` is derived
// from current data, so this rescales as more residents vote.
export const NEUTRAL_SCORE = 5.5

export function typicalVoteCount(averages) {
  const counts = Object.values(averages || {}).map(a => a.count).filter(c => c > 0).sort((a, b) => a - b)
  if (counts.length === 0) return 2
  const mid = Math.floor(counts.length / 2)
  const median = counts.length % 2 === 1 ? counts[mid] : (counts[mid - 1] + counts[mid]) / 2
  return Math.max(2, median)
}

export function interestScore(avgData, typical) {
  if (!avgData || !avgData.count) return 0
  const n = avgData.count
  return (n / (n + typical)) * avgData.avg + (typical / (n + typical)) * NEUTRAL_SCORE
}
