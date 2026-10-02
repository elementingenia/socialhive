// Picks the right TMDB search result for a DVD title, instead of blindly
// taking results[0].
//
// Why (found 2026-10-02, DVD IMDb-link audit): the Enrich DVD Library tool
// used TMDB's first search result. TMDB ranks by relevance/popularity, which
// often puts a newer or unreleased film with the same (or similar) title
// first — "Up" became a 2026 film called "Balls Up", "Doomsday" became
// "Avengers: Doomsday", "The Fast and the Furious" the 1954 film. That wrong
// match then overwrote the poster, plot, cast, year and IMDb link.
//
// Rules, in order:
//   1. Never pick something not yet released (release date after today).
//   2. Prefer an exact title match (punctuation, "&"/"and" and a leading
//      "The"/"A"/"An" ignored; original title counts too).
//   3. If we know the DVD's year, the pick must be within one year of it
//      (exact title first; otherwise a title that contains, or is contained
//      in, the DVD's title — catches "Anchorman" vs "Anchorman: The Legend
//      of Ron Burgundy").
//   4. Among what's left, take the most-voted (the well-known film).
//   5. If nothing qualifies, return null. The caller records no_match, which
//      shows in Admin's enrichment failures list for a manual fix. A visible
//      gap beats a confident wrong film.

import { sydneyTodayStr } from './date.js'

export function normTitle(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]/g, '')
}

function resultYear(r) {
  const d = r.release_date || r.first_air_date || ''
  return /^\d{4}/.test(d) ? parseInt(d.slice(0, 4), 10) : null
}

function resultTitles(r) {
  return [r.title, r.name, r.original_title, r.original_name].filter(Boolean).map(normTitle)
}

export function pickTmdbMatch(results, { title, year, today } = {}) {
  if (!Array.isArray(results) || !results.length || !title) return null
  const q = normTitle(title)
  if (!q) return null
  const todayStr = today || sydneyTodayStr()
  const wantYear = year != null && /^\d{4}/.test(String(year)) ? parseInt(String(year).slice(0, 4), 10) : null

  const released = results.filter(r => {
    const d = r.release_date || r.first_air_date || ''
    return !d || d <= todayStr
  })

  const exact = released.filter(r => resultTitles(r).includes(q))
  const near = released.filter(r => resultTitles(r).some(t => t && (t.includes(q) || q.includes(t))))
  const yearOk = r => {
    const y = resultYear(r)
    return y != null && Math.abs(y - wantYear) <= 1
  }

  let pool
  if (wantYear != null) {
    pool = exact.filter(yearOk)
    if (!pool.length) pool = near.filter(yearOk)
  } else {
    pool = exact
  }
  if (!pool.length) return null

  return pool.reduce((best, r) => ((r.vote_count || 0) > (best.vote_count || 0) ? r : best), pool[0])
}
