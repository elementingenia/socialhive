// Unit tests for lib/movieRecords.js -- one film = one record.
//
//   npm run test:unit

import { sameFilm, fillMissing, dvdSuggestPatch, promoteToDvdPatch, duplicatePairs, mergePatch } from '../../lib/movieRecords.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }
const eq = (a, e, msg) => ok(JSON.stringify(a) === JSON.stringify(e), `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(e)})`)

// sameFilm
ok(sameFilm({ tmdb_id: '98' }, { tmdb_id: 98 }), 'tmdb match (string vs number)')
ok(sameFilm({ imdb_id: 'tt1', tmdb_id: null }, { imdb_id: 'tt1', tmdb_id: '5' }), 'imdb match when DVD has no tmdb_id')
ok(!sameFilm({ imdb_id: 'tt1' }, { imdb_id: 'tt2' }), 'different films')
ok(!sameFilm({}, {}), 'no ids -> not the same')

// fillMissing never overwrites
eq(fillMissing({ tmdb_id: null, plot: 'Mine', poster_url: '' }, { tmdb_id: 98, plot: 'Theirs', poster_url: 'p.jpg', title: 'X' }),
  { tmdb_id: '98', poster_url: 'p.jpg' }, 'fills only empty fields, never title')

// Suggesting a DVD we own
{
  const dvd = { id: 'd', title: "Gladiator — Deluxe Collector's Edition", tmdb_id: null, imdb_id: 'tt0172495', plot: 'Old plot' }
  const p = dvdSuggestPatch(dvd, { title: 'Gladiator', tmdb_id: 98, imdb_id: 'tt0172495', plot: 'New' }, 'm1', '2026-10-27T00:00:00Z')
  eq(p.title, 'Gladiator', 'short TMDB title wins')
  eq(p.tmdb_id, '98', 'missing tmdb_id filled')
  eq(p.plot, undefined, 'existing plot kept')
  eq([p.is_viewing_suggestion, p.suggested_by, p.suggestion_clock_from, p.suggestion_retired_at], [true, 'm1', '2026-10-27T00:00:00Z', null], 'suggestion state, clock starts now')
}

// Adding a DVD that's already a suggestion
{
  const p = promoteToDvdPatch({ id: 's', title: 'Taken', tmdb_id: '8681', poster_url: 'a.jpg', enrichment_status: null },
    { title: 'Taken', tmdb_id: '8681', poster_url: 'b.jpg', we_own: true, enrichment_status: 'ok', barcode: '123' })
  eq([p.we_own, p.barcode, p.enrichment_status, p.poster_url], [true, '123', 'ok', undefined], 'becomes the DVD, keeps its own poster')
  eq(promoteToDvdPatch({ id: 's' }, { we_own: true }).barcode, undefined, 'no barcode -> none set')
}

// Finding duplicate pairs
{
  const movies = [
    { id: 'dvd1', title: 'Salmon Fishing in the Yemen', we_own: true, imdb_id: 'tt1441952', tmdb_id: null },
    { id: 'sug1', title: 'Salmon Fishing in the Yemen', we_own: false, imdb_id: 'tt1441952', tmdb_id: '81025' },
    { id: 's1', title: 'Game of Thrones (Season 1)', we_own: true, imdb_id: 'tt0944947' },
    { id: 's2', title: 'Game of Thrones (Season 2)', we_own: true, imdb_id: 'tt0944947' },
    { id: 'solo', title: 'Solo', we_own: true, imdb_id: 'tt9' },
    { id: 'own', title: 'Batman Begins', we_own: false, imdb_id: 'tt0372784', tmdb_id: '272' },
    { id: 'dvd2', title: 'Batman Begins', we_own: true, imdb_id: 'tt0372784' },
    { id: 'sug3', title: 'Not owned twice', we_own: false, tmdb_id: '5' },
    { id: 'sug4', title: 'Not owned twice', we_own: false, tmdb_id: '5' },
  ]
  const pairs = duplicatePairs(movies)
  eq(pairs.map(p => [p.keep.id, p.remove.map(r => r.id)]), [['dvd2', ['own']], ['dvd1', ['sug1']]], 'DVD+other pairs only; series seasons and no-DVD groups left alone')
  eq(duplicatePairs([]), [], 'empty')
}

// Merge patch
{
  const dvd = { id: 'd', title: "Forrest Gump — Special Collector's Edition", tmdb_id: null, imdb_id: 'tt0109830', is_viewing_suggestion: false, added_at: '2026-06-21' }
  const sug = { id: 's', title: 'Forrest Gump', tmdb_id: '13', imdb_id: 'tt0109830', is_viewing_suggestion: true, suggested_by: 'm9', added_at: '2026-07-01', suggestion_clock_from: null, suggestion_retired_at: null, showtime_night: 'sunday', streaming_offers: [{ a: 1 }] }
  const p = mergePatch(dvd, sug)
  eq(p.title, 'Forrest Gump', 'short title')
  eq(p.tmdb_id, '13', 'tmdb filled')
  eq(p.suggestion_clock_from, '2026-07-01', "clock keeps the suggestion's own start date, not the DVD's")
  eq([p.is_viewing_suggestion, p.suggested_by, p.showtime_night], [true, 'm9', 'sunday'], 'suggestion state carried')
  eq(p.streaming_offers, [{ a: 1 }], 'streaming info carried')
  // ownership-only row (not a suggestion) onto a DVD that's already suggested
  const p2 = mergePatch({ ...dvd, is_viewing_suggestion: true, title: 'We Were Soldiers' }, { title: 'We Were Soldiers', tmdb_id: '10590', is_viewing_suggestion: false })
  eq([p2.is_viewing_suggestion, p2.title, p2.tmdb_id], [undefined, undefined, '10590'], "DVD's own suggestion state untouched")
  eq(mergePatch(dvd, { ...sug, tmdb_id: null, title: 'Gump' }).title, undefined, 'no TMDB id -> DVD title kept')
}

console.log(`movieRecords: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
