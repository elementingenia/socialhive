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
