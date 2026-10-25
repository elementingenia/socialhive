// Show Time > Suggestions list rules (Iain, 2026-10-25,
// Element_Happenings_ShowTime_Suggestions_Scope_Answered).
//
// The list grew ~4x faster than films were screened, so it is split and
// trimmed:
//   - Two tabs: Action Night / Sunday Night at the Movies. A film's tab is
//     movies.showtime_night if an admin/Owner set it ('action', 'sunday' or
//     'both' -- shown in both tabs), otherwise guessed from its genres
//     (Action or Thriller -> Action Night).
//   - New films get a 14-day grace period in the main list ("New" badge).
//   - After that, under 3 votes -> collapsed "Others" section.
//   - On the list more than 60 days with under 3 votes -> retired (hidden
//     from residents). Worked out live from the data, so no cron is needed.
//   - More than 60 days, 3-4 votes and an average under 7 -> flagged for
//     admins/Owners to decide.
//   - A film booked for an upcoming showing is never retired, flagged or
//     put in Others.
// The 60-day clock runs from movies.suggestion_clock_from (set when a film
// is brought back from Retired) or, if empty, movies.added_at.
//
// Pure functions only -- no DB access -- so they can be unit tested.

export const GRACE_DAYS = 14
export const RETIRE_DAYS = 60
export const MIN_VOTES = 3          // below this after the grace period -> Others; after 60 days -> retired
export const FLAG_MAX_VOTES = 5     // fewer than this ...
export const FLAG_MAX_AVG = 7       // ... and an average below this -> flagged

export const NIGHTS = [
  { key: 'sunday', label: 'Sunday Night', full: 'Sunday Night at the Movies' },
  { key: 'action', label: 'Action Night', full: 'Action Night' },
]

// Choices an admin/Owner can pick for a film (tabs are NIGHTS above).
export const NIGHT_CHOICES = [
  { key: 'sunday', label: 'Sunday Night', done: 'Now shown under Sunday Night' },
  { key: 'action', label: 'Action Night', done: 'Now shown under Action Night' },
  { key: 'both',   label: 'Both',         done: 'Now shown under both tabs' },
]
const NIGHT_VALUES = new Set(NIGHT_CHOICES.map(c => c.key))

const DAY_MS = 24 * 60 * 60 * 1000

function parseGenres(g) {
  if (!g) return []
  return String(g).split(/[,|/]/).map(x => x.trim().toLowerCase()).filter(Boolean)
}

export function guessNight(genre) {
  const gs = parseGenres(genre)
  return gs.includes('action') || gs.includes('thriller') ? 'action' : 'sunday'
}

export function nightFor(movie) {
  if (movie && NIGHT_VALUES.has(movie.showtime_night)) return movie.showtime_night
  return guessNight(movie?.genre)
}

// Is this film shown in the given tab ('action' | 'sunday')?
export function inNight(movie, tab) {
  const n = nightFor(movie)
  return n === 'both' || n === tab
}

export function isValidNight(v) {
  return NIGHT_VALUES.has(v)
}

export function daysOnList(movie, now = new Date()) {
  const from = movie?.suggestion_clock_from || movie?.added_at
  if (!from) return 0
  const t = new Date(from).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, (now.getTime() - t) / DAY_MS)
}

export function isNew(movie, now = new Date()) {
  return daysOnList(movie, now) < GRACE_DAYS
}

// status: 'main' | 'others' | 'retired'
// avgData: { avg, count } from lib/movieScores.js communityAverages, or undefined
// scheduled: this film has an upcoming showing
export function suggestionStatus(movie, avgData, { now = new Date(), scheduled = false } = {}) {
  const count = avgData?.count || 0
  const avg = avgData?.avg || 0
  const days = daysOnList(movie, now)
  if (scheduled) return { status: 'main', isNew: days < GRACE_DAYS, flagged: false, autoRetired: false }
  if (movie?.suggestion_retired_at) return { status: 'retired', isNew: false, flagged: false, autoRetired: false }
  if (days > RETIRE_DAYS && count < MIN_VOTES) return { status: 'retired', isNew: false, flagged: false, autoRetired: true }
  if (days < GRACE_DAYS) return { status: 'main', isNew: true, flagged: false, autoRetired: false }
  if (count < MIN_VOTES) return { status: 'others', isNew: false, flagged: false, autoRetired: false }
  const flagged = days > RETIRE_DAYS && count < FLAG_MAX_VOTES && avg < FLAG_MAX_AVG
  return { status: 'main', isNew: false, flagged, autoRetired: false }
}

// Score spread for one film: [{ score, count }], highest score first.
export function voteSpread(votes, movieId) {
  const counts = {}
  for (const v of votes || []) {
    if (!v || v.movie_id !== movieId || typeof v.score !== 'number') continue
    counts[v.score] = (counts[v.score] || 0) + 1
  }
  return Object.entries(counts)
    .map(([score, count]) => ({ score: Number(score), count }))
    .sort((a, b) => b.score - a.score)
}

// "8 votes: 3 × 8, 2 × 5, 2 × 1"
export function voteSpreadLabel(spread) {
  const total = (spread || []).reduce((s, x) => s + x.count, 0)
  if (!total) return 'No votes yet'
  const parts = spread.map(x => `${x.count} × ${x.score}`).join(', ')
  return `${total} vote${total === 1 ? '' : 's'}: ${parts}`
}

// Order for the Rate a Film cards: films in their grace period first
// (newest first), then films with under 3 votes, then everything else.
// Retired films are dropped. counts: { [movieId]: voteCount }
export function rateQueue(movies, counts, { now = new Date(), scheduledIds = new Set() } = {}) {
  const rank = m => {
    if (isNew(m, now)) return 0
    if ((counts?.[m.id] || 0) < MIN_VOTES) return 1
    return 2
  }
  return (movies || [])
    .filter(m => {
      const c = counts?.[m.id] || 0
      return suggestionStatus(m, { count: c, avg: 0 }, { now, scheduled: scheduledIds.has(m.id) }).status !== 'retired'
    })
    .map((m, i) => ({ m, i, r: rank(m) }))
    .sort((a, b) => {
      if (a.r !== b.r) return a.r - b.r
      if (a.r === 0) return daysOnList(a.m, now) - daysOnList(b.m, now)
      return a.i - b.i
    })
    .map(x => x.m)
}
