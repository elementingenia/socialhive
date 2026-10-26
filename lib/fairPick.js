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
//      average) / their spread (spread floored at minSpread). A 1 from a
//      habitual 1-giver is mildly negative; a 1 from someone who usually
//      gives 8s is a real objection. An always-10 voter's 10 is neutral.
//   2. That value is capped: up to +upCap, down to -downCap, so no one vote
//      can veto a film.
//   3. Each vote is weighted by the voter's film-screening attendance over
//      the last attendanceDays, using the attendance buckets.
//   4. Each film carries neutral weight equal to the typical vote count for
//      the night (median, min 2), and no voter's weight may exceed
//      maxVoterSharePct of the film's total weight. Films with under
//      minRankedVotes votes are not ranked ("Needs more votes").
//
// Every number is configurable in Admin > Hub Settings > Show Time (Iain,
// 2026-10-27: as more people get involved, adjusting these is a human
// decision). Stored as JSON in settings[FAIR_PICK_SETTING_KEY]; anything
// missing or invalid falls back to DEFAULT_FAIR_PICK_CONFIG.
//
// Pure functions only -- no DB access -- so they can be unit tested.

export const FAIR_PICK_SETTING_KEY = 'fair_pick_config'

export const DEFAULT_FAIR_PICK_CONFIG = Object.freeze({
  // from = screenings attended (at least); weight = % a vote counts.
  // Sorted by from; the last bucket is open-ended ("3 or more").
  attendanceBuckets: Object.freeze([
    Object.freeze({ from: 0, weight: 25 }),
    Object.freeze({ from: 1, weight: 50 }),
    Object.freeze({ from: 2, weight: 75 }),
    Object.freeze({ from: 3, weight: 100 }),
  ]),
  attendanceDays: 365,     // rolling attendance window
  recentShownDays: 365,    // leave out films shown this recently (0 = don't)
  minRankedVotes: 3,       // fewer -> "Needs more votes"
  maxVoterSharePct: 33,    // one voter's max share of a film's weight
  downCap: 1,              // how far one vote can pull a film down
  upCap: 2,                // how far one vote can lift a film
  minSpread: 1.5,          // floor on a voter's spread
  strongScore: 0.3,        // at or above -> "Strong pick"
  goodScore: 0.1,          // at or above -> "Good pick", else "Lukewarm"
  splitSpread: 0.9,        // opinion spread at or above -> "Split opinion"
})

// Field limits for validation and the settings form.
export const FAIR_PICK_LIMITS = Object.freeze({
  attendanceDays:   { min: 30,  max: 1095, step: 1 },
  recentShownDays:  { min: 0,   max: 1095, step: 1 },
  minRankedVotes:   { min: 1,   max: 20,   step: 1 },
  maxVoterSharePct: { min: 10,  max: 100,  step: 1 },
  downCap:          { min: 0.1, max: 5,    step: 0.1 },
  upCap:            { min: 0.1, max: 5,    step: 0.1 },
  minSpread:        { min: 0.5, max: 5,    step: 0.1 },
  strongScore:      { min: -2,  max: 2,    step: 0.05 },
  goodScore:        { min: -2,  max: 2,    step: 0.05 },
  splitSpread:      { min: 0.1, max: 3,    step: 0.05 },
})
export const MAX_BUCKETS = 10
export const MAX_BUCKET_FROM = 100

// Kept for existing callers/tests: the default values as plain constants.
export const ATTENDANCE_DAYS = DEFAULT_FAIR_PICK_CONFIG.attendanceDays
export const MIN_SPREAD = DEFAULT_FAIR_PICK_CONFIG.minSpread
export const UP_CAP = DEFAULT_FAIR_PICK_CONFIG.upCap
export const DOWN_CAP = DEFAULT_FAIR_PICK_CONFIG.downCap
export const MIN_RANKED_VOTES = DEFAULT_FAIR_PICK_CONFIG.minRankedVotes

const D = DEFAULT_FAIR_PICK_CONFIG
// Anything that isn't a config object (e.g. an index from Array.map) -> defaults.
const cfgOr = cfg => (cfg && typeof cfg === 'object' && Array.isArray(cfg.attendanceBuckets) ? cfg : D)

// null if valid, else a plain-English error for the settings form.
export function validateFairPickConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return 'Settings are missing.'
  const b = cfg.attendanceBuckets
  if (!Array.isArray(b) || b.length === 0) return 'Add at least one attendance bucket.'
  if (b.length > MAX_BUCKETS) return `No more than ${MAX_BUCKETS} attendance buckets.`
  const froms = new Set()
  for (const x of b) {
    if (!x || !Number.isInteger(x.from) || x.from < 0 || x.from > MAX_BUCKET_FROM) return `Each bucket's screenings must be a whole number from 0 to ${MAX_BUCKET_FROM}.`
    if (!Number.isInteger(x.weight) || x.weight < 0 || x.weight > 100) return 'Each bucket\'s weight must be a whole number from 0 to 100%.'
    if (froms.has(x.from)) return `Two buckets both start at ${x.from} screenings.`
    froms.add(x.from)
  }
  if (!froms.has(0)) return 'One bucket must start at 0 screenings, so every voter is covered.'
  if (!b.some(x => x.weight > 0)) return 'At least one bucket must count for more than 0%.'
  for (const [k, lim] of Object.entries(FAIR_PICK_LIMITS)) {
    const v = cfg[k]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lim.min || v > lim.max) return `${FIELD_LABELS[k]} must be between ${lim.min} and ${lim.max}.`
  }
  for (const k of ['attendanceDays', 'recentShownDays', 'minRankedVotes', 'maxVoterSharePct']) {
    if (!Number.isInteger(cfg[k])) return `${FIELD_LABELS[k]} must be a whole number.`
  }
  if (cfg.strongScore <= cfg.goodScore) return 'The Strong pick level must be higher than the Good pick level.'
  return null
}

export const FIELD_LABELS = Object.freeze({
  attendanceDays: 'Attendance period (days)',
  recentShownDays: 'Leave out films shown in the last (days)',
  minRankedVotes: 'Votes needed to be ranked',
  maxVoterSharePct: 'Most one voter can carry (%)',
  downCap: 'Low-score limit',
  upCap: 'High-score limit',
  minSpread: 'Scoring-habit floor',
  strongScore: 'Strong pick level',
  goodScore: 'Good pick level',
  splitSpread: 'Split opinion level',
})

// Sorted copy of the buckets (by from).
export function sortBuckets(buckets) {
  return [...(buckets || [])].map(x => ({ from: x.from, weight: x.weight })).sort((a, b) => a.from - b.from)
}

// Stored value (JSON text or object) -> a full, valid config. Invalid or
// missing -> defaults, so a bad save can never break the ranking.
export function parseFairPickConfig(raw) {
  let obj = raw
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw) } catch { obj = null }
  }
  if (!obj || typeof obj !== 'object') return cloneDefaults()
  const merged = { ...cloneDefaults(), ...obj }
  merged.attendanceBuckets = sortBuckets(Array.isArray(obj.attendanceBuckets) ? obj.attendanceBuckets : D.attendanceBuckets)
  return validateFairPickConfig(merged) ? cloneDefaults() : merged
}

export function cloneDefaults() {
  return { ...D, attendanceBuckets: D.attendanceBuckets.map(x => ({ ...x })) }
}

// "0: 25% · 1: 50% · 2: 75% · 3+: 100%"
export function bucketSummary(buckets) {
  const b = sortBuckets(buckets)
  return b.map((x, i) => {
    const last = i === b.length - 1
    const next = b[i + 1]
    const range = last ? `${x.from}+` : (next.from - x.from === 1 ? `${x.from}` : `${x.from}–${next.from - 1}`)
    return `${range}: ${x.weight}%`
  }).join(' · ')
}

export function attendanceWeight(attended, cfg = D) {
  const n = Math.max(0, Math.floor(Number(attended) || 0))
  let w = 0
  for (const x of sortBuckets(cfgOr(cfg).attendanceBuckets)) if (n >= x.from) w = x.weight
  return w / 100
}

// { [memberId]: { mean, spread, count } } from ALL of a voter's votes.
export function voterProfiles(votes, cfg = D) {
  cfg = cfgOr(cfg)
  const by = {}
  for (const v of votes || []) {
    if (!v || !v.member_id || typeof v.score !== 'number') continue
    ;(by[v.member_id] || (by[v.member_id] = [])).push(v.score)
  }
  const out = {}
  for (const [id, s] of Object.entries(by)) {
    const mean = s.reduce((a, b) => a + b, 0) / s.length
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length)
    out[id] = { mean, spread: Math.max(sd, cfg.minSpread), count: s.length }
  }
  return out
}

// One vote measured against the voter's own habits, with the veto cap.
export function voteValue(score, profile, cfg = D) {
  cfg = cfgOr(cfg)
  const p = profile || { mean: score, spread: cfg.minSpread }
  const raw = (score - p.mean) / p.spread
  const value = Math.max(-cfg.downCap, Math.min(cfg.upCap, raw))
  return { raw, value, cappedDown: raw < -cfg.downCap, cappedUp: raw > cfg.upCap }
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
export function filmVotes(filmVoteRows, profiles, attendance, typical, cfg = D) {
  cfg = cfgOr(cfg)
  const rows = (filmVoteRows || []).filter(v => v && v.member_id && typeof v.score === 'number')
  const base = rows.map(v => {
    const attended = attendance?.[v.member_id] || 0
    return { ...v, attended, attendanceWeight: attendanceWeight(attended, cfg), ...voteValue(v.score, profiles?.[v.member_id], cfg) }
  })
  const total = base.reduce((a, v) => a + v.attendanceWeight, 0) + typical
  const cap = total * (cfg.maxVoterSharePct / 100)
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
export function relativeScore(filmVoteRows, profiles, attendance, cfg = D) {
  cfg = cfgOr(cfg)
  return fairScore(filmVotes(filmVoteRows, profiles, attendance, 0, cfg), 0)
}

export function pickLabel(score, cfg = D) {
  cfg = cfgOr(cfg)
  if (score >= cfg.strongScore) return 'Strong pick'
  if (score >= cfg.goodScore) return 'Good pick'
  return 'Lukewarm'
}

// Rank candidate films for one night.
//   films:      [{ id, ... }] candidates for this night
//   votes:      ALL votes [{ movie_id, member_id, score }] (profiles use every vote)
//   attendance: { [memberId]: screenings attended }
// Returns { ranked, needsVotes, typical } -- each entry is the film plus
//   { score, count, avg, label, split }. ranked is best first; needsVotes
//   is most votes first, then title.
export function rankFilms(films, votes, attendance, cfg = D) {
  cfg = cfgOr(cfg)
  const profiles = voterProfiles(votes, cfg)
  const byFilm = {}
  for (const v of votes || []) {
    if (!v || !v.movie_id) continue
    ;(byFilm[v.movie_id] || (byFilm[v.movie_id] = [])).push(v)
  }
  const typical = typicalCount((films || []).map(f => (byFilm[f.id] || []).length))
  const ranked = [], needsVotes = []
  for (const f of films || []) {
    const fv = filmVotes(byFilm[f.id], profiles, attendance, typical, cfg)
    const count = fv.length
    const avg = count ? fv.reduce((a, v) => a + v.score, 0) / count : null
    const score = fairScore(fv, typical)
    const entry = { ...f, count, avg, score }
    if (count >= cfg.minRankedVotes) {
      entry.label = pickLabel(score, cfg)
      entry.split = opinionSpread(fv) >= cfg.splitSpread
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
export function voteNotes(v, profile, cfg = D) {
  cfg = cfgOr(cfg)
  const notes = []
  if (v.attendanceWeight < 1) {
    notes.push(`Counts ${Math.round(v.attendanceWeight * 100)}%`)
  }
  if (v.cappedDown) notes.push('Low score capped')
  if (v.shareCapped) notes.push(`Capped at ${cfg.maxVoterSharePct}% of this film`)
  if (profile && profile.count >= 5 && v.score <= 3 && profile.mean <= 5) {
    notes.push(`Usually scores low (average ${profile.mean.toFixed(1)})`)
  }
  if (profile && profile.count >= 5 && v.score >= 9 && profile.mean >= 9) {
    notes.push(`Usually scores high (average ${profile.mean.toFixed(1)})`)
  }
  return notes
}
