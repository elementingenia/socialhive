// Show Time "Fair Pick" ranking (Iain, 2026-10-26,
// Element_Happenings_ShowTime_Fair_Pick_Scope_v1). Admins and Show Time
// Owners only -- a planning tool for choosing the next film for each night.
// Residents' own Suggestions scores (lib/movieScores.js) are unchanged.
//
// Two problems it solves, both seen in the real votes:
//   - residents who rarely or never come to screenings moving the ranking;
//   - a voter who habitually scores 1 dragging films down for everyone.
//
// Per film, four steps:
//   1. Each vote is compared with that voter's OWN habits: (score - their
//      average) / their spread (spread floored at MIN_SPREAD). A 1 from a
//      habitual 1-giver is mildly negative; a 1 from someone who usually
//      gives 8s is a real objection. An always-10 voter's 10 is neutral.
//   2. That value is capped: up to +UP_CAP, down to -DOWN_CAP, so no one
//      vote can veto a film.
//   3. Each vote is weighted by the voter's Show Time attendance (booked,
//      not cancelled, past 12 months): 0 -> 25%, 1 -> 50%, 2 -> 75%, 3+ -> 100%.
//   4. Each film carries neutral weight equal to the typical vote count for
//      the night (median, min 2), and no voter's weight may exceed one third
//      of the film's total weight. Films with under MIN_RANKED_VOTES votes
//      are not ranked ("Needs more votes").
//
// Pure functions only -- no DB access -- so they can be unit tested.

export const ATTENDANCE_WEIGHTS = [0.25, 0.5, 0.75, 1]   // index = screenings attended (3+ -> last)
export const ATTENDANCE_DAYS = 365
export const MIN_SPREAD = 1.5
export const UP_CAP = 2
export const DOWN_CAP = 1
export const MAX_VOTER_SHARE = 1 / 3
export const MIN_RANKED_VOTES = 3
export const STRONG_SCORE = 0.3
export const GOOD_SCORE = 0.1
export const SPLIT_SPREAD = 0.9

export function attendanceWeight(attended) {
  const n = Math.max(0, Math.floor(Number(attended) || 0))
  return ATTENDANCE_WEIGHTS[Math.min(n, ATTENDANCE_WEIGHTS.length - 1)]
}

// { [memberId]: { mean, spread, count } } from ALL of a voter's votes.
export function voterProfiles(votes) {
  const by = {}
  for (const v of votes || []) {
    if (!v || !v.member_id || typeof v.score !== 'number') continue
    ;(by[v.member_id] || (by[v.member_id] = [])).push(v.score)
  }
  const out = {}
  for (const [id, s] of Object.entries(by)) {
    const mean = s.reduce((a, b) => a + b, 0) / s.length
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length)
    out[id] = { mean, spread: Math.max(sd, MIN_SPREAD), count: s.length }
  }
  return out
}

// One vote measured against the voter's own habits, with the veto cap.
export function voteValue(score, profile) {
  const p = profile || { mean: score, spread: MIN_SPREAD }
  const raw = (score - p.mean) / p.spread
  const value = Math.max(-DOWN_CAP, Math.min(UP_CAP, raw))
  return { raw, value, cappedDown: raw < -DOWN_CAP, cappedUp: raw > UP_CAP }
}

// Median vote count across films with at least one vote, minimum 2.
export function typicalCount(counts) {
  const c = (counts || []).filter(n => n > 0).sort((a, b) => a - b)
  if (!c.length) return 2
  const mid = Math.floor(c.length / 2)
  const median = c.length % 2 ? c[mid] : (c[mid - 1] + c[mid]) / 2
  return Math.max(2, median)
}

// Per-vote breakdown for one film. Returns the votes with weight and value,
// after the attendance weight and the single-voter cap.
export function filmVotes(filmVoteRows, profiles, attendance, typical) {
  const rows = (filmVoteRows || []).filter(v => v && v.member_id && typeof v.score === 'number')
  const base = rows.map(v => {
    const attended = attendance?.[v.member_id] || 0
    return { ...v, attended, attendanceWeight: attendanceWeight(attended), ...voteValue(v.score, profiles?.[v.member_id]) }
  })
  const total = base.reduce((a, v) => a + v.attendanceWeight, 0) + typical
  const cap = total * MAX_VOTER_SHARE
  return base.map(v => ({
    ...v,
    weight: Math.min(v.attendanceWeight, cap),
    shareCapped: v.attendanceWeight > cap,
  }))
}

export function fairScore(weightedVotes, typical) {
  const w = (weightedVotes || []).reduce((a, v) => a + v.weight, 0)
  if (!w) return 0
  return weightedVotes.reduce((a, v) => a + v.weight * v.value, 0) / (w + typical)
}

// Weighted spread of opinion among a film's votes (in the voters' own units).
export function opinionSpread(weightedVotes) {
  const w = (weightedVotes || []).reduce((a, v) => a + v.weight, 0)
  if (!w) return 0
  const mean = weightedVotes.reduce((a, v) => a + v.weight * v.value, 0) / w
  return Math.sqrt(weightedVotes.reduce((a, v) => a + v.weight * (v.value - mean) ** 2, 0) / w)
}

// How a film's voters scored it against their own usual scores, weighted by
// attendance, with NO pull toward neutral: > 0 = above their norm, < 0 =
// below. Used for the Suggestions "Consider retiring" flag (2026-10-26).
export function relativeScore(filmVoteRows, profiles, attendance) {
  return fairScore(filmVotes(filmVoteRows, profiles, attendance, 0), 0)
}

export function pickLabel(score) {
  if (score >= STRONG_SCORE) return 'Strong pick'
  if (score >= GOOD_SCORE) return 'Good pick'
  return 'Lukewarm'
}

// Rank candidate films for one night.
//   films:      [{ id, ... }] candidates for this night
//   votes:      ALL votes [{ movie_id, member_id, score }] (profiles use every vote)
//   attendance: { [memberId]: screenings attended }
// Returns { ranked, needsVotes, typical } -- each entry is the film plus
//   { score, count, avg, label, split }. ranked is best first; needsVotes
//   is most votes first, then title.
export function rankFilms(films, votes, attendance) {
  const profiles = voterProfiles(votes)
  const byFilm = {}
  for (const v of votes || []) {
    if (!v || !v.movie_id) continue
    ;(byFilm[v.movie_id] || (byFilm[v.movie_id] = [])).push(v)
  }
  const typical = typicalCount((films || []).map(f => (byFilm[f.id] || []).length))
  const ranked = [], needsVotes = []
  for (const f of films || []) {
    const fv = filmVotes(byFilm[f.id], profiles, attendance, typical)
    const count = fv.length
    const avg = count ? fv.reduce((a, v) => a + v.score, 0) / count : null
    const score = fairScore(fv, typical)
    const entry = { ...f, count, avg, score }
    if (count >= MIN_RANKED_VOTES) {
      entry.label = pickLabel(score)
      entry.split = opinionSpread(fv) >= SPLIT_SPREAD
      ranked.push(entry)
    } else {
      needsVotes.push(entry)
    }
  }
  ranked.sort((a, b) => b.score - a.score || b.count - a.count || String(a.title || '').localeCompare(String(b.title || '')))
  needsVotes.sort((a, b) => b.count - a.count || String(a.title || '').localeCompare(String(b.title || '')))
  return { ranked, needsVotes, typical }
}

// Why a vote counted less than face value, in plain words. [] = full value.
export function voteNotes(v, profile) {
  const notes = []
  if (v.attendanceWeight < 1) {
    notes.push(`Counts ${Math.round(v.attendanceWeight * 100)}%`)
  }
  if (v.cappedDown) notes.push('Low score capped')
  if (v.shareCapped) notes.push('Capped at a third of this film')
  if (profile && profile.count >= 5 && v.score <= 3 && profile.mean <= 5) {
    notes.push(`Usually scores low (average ${profile.mean.toFixed(1)})`)
  }
  if (profile && profile.count >= 5 && v.score >= 9 && profile.mean >= 9) {
    notes.push(`Usually scores high (average ${profile.mean.toFixed(1)})`)
  }
  return notes
}
