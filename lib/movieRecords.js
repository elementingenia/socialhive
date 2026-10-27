// One film = one movies row (Iain, 2026-10-27). A DVD we own and a
// suggestion for the same film must be the SAME record, so votes, showings
// and the "On DVD" source all line up. 30 films had drifted into two rows
// because DVD rows imported in bulk have no tmdb_id and the duplicate checks
// only matched on tmdb_id. These rules match on tmdb_id OR imdb_id.
//
// Title: the short TMDB/IMDb title wins over a DVD edition name ("Gladiator",
// not "Gladiator — Deluxe Collector's Edition") -- Iain's call.
//
// Pure functions only -- no DB access -- so they can be unit tested.

// Film details copied onto the kept record when it has none.
export const FILL_FIELDS = [
  'tmdb_id', 'imdb_id', 'year', 'genre', 'plot', 'poster_url', 'runtime', 'director',
  'actors', 'rating_imdb', 'rating_rt', 'rating', 'streaming_offers', 'streaming_checked_at',
]

const empty = v => v === null || v === undefined || v === ''

// Same film? tmdb_id or imdb_id match (either side may be missing one).
export function sameFilm(a, b) {
  if (!a || !b) return false
  if (a.tmdb_id && b.tmdb_id && String(a.tmdb_id) === String(b.tmdb_id)) return true
  if (a.imdb_id && b.imdb_id && a.imdb_id === b.imdb_id) return true
  return false
}

// Fields to fill on `target` from `source` where target has nothing.
export function fillMissing(target, source) {
  const patch = {}
  for (const k of FILL_FIELDS) {
    if (empty(target?.[k]) && !empty(source?.[k])) patch[k] = k === 'tmdb_id' ? String(source[k]) : source[k]
  }
  return patch
}

// A resident suggests a film we already own on DVD: flag the DVD record
// instead of creating a second one. `details` = the TMDB/OMDb details the
// Suggest dialog sent. The 60-day Suggestions clock starts now -- the DVD's
// added_at is when it was catalogued, not suggested, and would otherwise make
// a fresh suggestion look months old and auto-retire it.
export function dvdSuggestPatch(dvd, details, memberId, nowIso) {
  return {
    ...fillMissing(dvd, details),
    ...(details?.title ? { title: details.title } : {}),
    is_viewing_suggestion: true,
    suggested_by: memberId,
    suggestion_clock_from: nowIso,
    suggestion_retired_at: null,
  }
}

// A DVD is added for a film that's already a suggestion (or a resident's
// private-ownership record): turn that record into the DVD rather than
// inserting a second row. Keeps its votes, showings and suggestion state.
export function promoteToDvdPatch(existing, dvdPayload) {
  return {
    ...fillMissing(existing, dvdPayload),
    we_own: true,
    enrichment_status: dvdPayload.enrichment_status || existing.enrichment_status || null,
    ...(dvdPayload.barcode ? { barcode: dvdPayload.barcode } : {}),
  }
}

// Find DVD + other-row pairs for the one-off merge. Only groups with exactly
// one owned row: several owned rows sharing an id are separate seasons or
// discs of one series (Game of Thrones, Poirot), not duplicates.
// Returns [{ keep, remove: [rows] }].
export function duplicatePairs(movies) {
  const rows = movies || []
  const parent = {}
  const find = x => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  rows.forEach(m => { parent[m.id] = m.id })
  for (const key of ['imdb_id', 'tmdb_id']) {
    const by = {}
    for (const m of rows) if (m[key]) (by[String(m[key])] ||= []).push(m.id)
    for (const ids of Object.values(by)) for (let i = 1; i < ids.length; i++) parent[find(ids[i])] = find(ids[0])
  }
  const groups = {}
  for (const m of rows) (groups[find(m.id)] ||= []).push(m)
  const out = []
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue
    const owned = g.filter(m => m.we_own)
    if (owned.length !== 1) continue
    out.push({ keep: owned[0], remove: g.filter(m => !m.we_own) })
  }
  return out.sort((a, b) => String(a.keep.title).localeCompare(String(b.keep.title)))
}

// Patch for the kept DVD record when merging `other` into it.
export function mergePatch(dvd, other) {
  const patch = fillMissing(dvd, other)
  // Short TMDB/IMDb title wins (only a TMDB-sourced row has one we trust).
  if (other.tmdb_id && other.title && other.title !== dvd.title) patch.title = other.title
  if (other.is_viewing_suggestion && !dvd.is_viewing_suggestion) {
    patch.is_viewing_suggestion = true
    patch.suggested_by = other.suggested_by || null
    patch.suggestion_clock_from = other.suggestion_clock_from || other.added_at || null
    patch.suggestion_retired_at = other.suggestion_retired_at || null
    if (other.showtime_night && !dvd.showtime_night) patch.showtime_night = other.showtime_night
  }
  return patch
}
