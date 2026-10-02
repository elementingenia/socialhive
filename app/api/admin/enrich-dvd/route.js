import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'
import { pickTmdbMatch } from '@/lib/tmdbMatch'
const TMDB_KEY = process.env.TMDB_API_KEY || '0e0ec3c6d62df378f31f7ddb78a83b49'
const OMDB_KEY = process.env.OMDB_API_KEY || 'ed1ed939'

// Root cause (found 2026-07-16, same bug class as app/api/cron/book-return-check/route.js
// fixed 2026-07-15): this is a GET route hit with an identical URL/params on every
// re-run (the admin re-triggers it repeatedly to page through the backlog). Next.js's
// App Router silently caches the fetch() calls supabase-js makes under the hood, so a
// movie enriched one call was still coming back with poster_url/enrichment_status = null
// on the very next call -- the SELECT was being served from cache instead of hitting
// Supabase, so the same 20 rows got reprocessed forever and the backlog never advanced.
// force-dynamic disables Next's route-level cache; the explicit no-store fetch override
// is required in addition because force-dynamic alone does not propagate down into
// supabase-js's internal fetch calls (confirmed via live-fire testing on the cron route).
export const dynamic = 'force-dynamic'

function makeAdminClient() {
  return supabaseAdmin
}

async function getMember(token) {
  const authClient = makeAdminClient()
  const { data: { user } } = await authClient.auth.getUser(token)
  if (!user) return null
  const db = makeAdminClient()
  const { data } = await db
    .from('members').select('id, is_admin').eq('auth_id', user.id).single()
  return data
}

function cleanTitle(title) {
  return title
    .replace(/\s*—\s*(Special|Collector'?s?|Extended|Director'?s?|Limited|Platinum|Deluxe|Widescreen|Ultimate|2\s*Disc|Rockin'?|Anniversary|Uncorked)[^,]*/gi, '')
    .replace(/\s*\((?:Season|Series|Complete|Reunion|Specials?|S\d+)[^)]*\)/gi, '')
    .trim()
}

async function enrichFromOmdb(imdbId) {
  const url = `https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_KEY}&plot=full`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  if (data.Response === 'False') return null
  return {
    poster_url:  data.Poster  && data.Poster  !== 'N/A' ? data.Poster  : null,
    plot:        data.Plot    && data.Plot    !== 'N/A' ? data.Plot    : null,
    runtime:     data.Runtime && data.Runtime !== 'N/A' ? data.Runtime : null,
    director:    data.Director && data.Director !== 'N/A' ? data.Director : null,
    actors:      data.Actors  && data.Actors  !== 'N/A' ? data.Actors  : null,
    rating_imdb: data.imdbRating && data.imdbRating !== 'N/A' ? data.imdbRating : null,
    imdb_id:     imdbId,
    year:        data.Year && data.Year !== 'N/A' ? data.Year.slice(0, 4) : null,
    genre:       data.Genre && data.Genre !== 'N/A' ? data.Genre : null,
    rating:      data.Rated && data.Rated !== 'N/A' ? data.Rated : null,
  }
}

// Fetches full TMDB details for a known TMDB id (poster, overview, credits,
// IMDb id) plus OMDb ratings. Shared by both lookup paths below.
async function tmdbDetails(tmdbId, isTV) {
  const searchType = isTV ? 'tv' : 'movie'
  const detailUrl = `https://api.themoviedb.org/3/${searchType}/${tmdbId}?api_key=${TMDB_KEY}&language=en-AU&append_to_response=credits,external_ids`
  const detailRes = await fetch(detailUrl)
  if (!detailRes.ok) return { _apiError: true, reason: `TMDB detail HTTP ${detailRes.status}` }
  const d = await detailRes.json()

  const imdb_id  = d.external_ids?.imdb_id || null
  const poster   = d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null
  const runtime  = isTV
    ? (d.episode_run_time?.[0] ? `${d.episode_run_time[0]} min` : null)
    : (d.runtime ? `${d.runtime} min` : null)
  const director = !isTV ? d.credits?.crew?.find(c => c.job === 'Director')?.name || null : null
  const actors   = d.credits?.cast?.slice(0, 4).map(c => c.name).join(', ') || null
  const releaseYear = isTV ? d.first_air_date?.slice(0, 4) : d.release_date?.slice(0, 4)

  let rating_imdb = null
  let rating = null
  if (imdb_id) {
    const omdb = await enrichFromOmdb(imdb_id)
    rating_imdb = omdb?.rating_imdb || null
    rating = omdb?.rating || null
  }

  return { poster_url: poster, plot: d.overview || null, runtime, director, actors, rating_imdb, rating, imdb_id, year: releaseYear || null }
}

// Title search. Picks the right result via lib/tmdbMatch.js (title + year,
// most-voted, never unreleased) instead of blindly taking results[0] -- that
// was the 2026-10-02 bug that linked "Up" to a 2026 film, "Doomsday" to
// Avengers: Doomsday, etc. No confident match -> null -> no_match.
async function enrichFromTmdb(title, isTV, year) {
  const searchType = isTV ? 'tv' : 'movie'
  const clean = cleanTitle(title)
  const searchUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(clean)}&language=en-AU`
  const searchRes = await fetch(searchUrl)
  if (!searchRes.ok) return { _apiError: true, reason: `TMDB search HTTP ${searchRes.status}` }
  const searchData = await searchRes.json()
  const result = pickTmdbMatch(searchData.results, { title: clean, year: isTV ? null : year })
  if (!result) return null
  return tmdbDetails(result.id, isTV)
}

// Exact lookup when we already hold the IMDb id -- used to fill a missing
// poster without a title search that could pull in a different film's
// details (it used to merge a title-search result over the OMDb data).
async function enrichFromTmdbByImdb(imdbId) {
  const res = await fetch(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id`)
  if (!res.ok) return { _apiError: true, reason: `TMDB find HTTP ${res.status}` }
  const f = await res.json()
  if (f.movie_results?.[0]) return tmdbDetails(f.movie_results[0].id, false)
  if (f.tv_results?.[0]) return tmdbDetails(f.tv_results[0].id, true)
  return null
}

const delay = ms => new Promise(r => setTimeout(r, ms))

export async function GET(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const member = await getMember(token)
  if (!member?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const limit     = Math.min(parseInt(searchParams.get('limit') || '10'), 20)
  const catalogue = searchParams.get('catalogue') === 'true'

  const supabaseAdmin = makeAdminClient()

  if (catalogue) {
    const { data } = await supabaseAdmin
      .from('movies')
      .select('id, title, enrichment_status, genre')
      .in('enrichment_status', ['no_match', 'api_error'])
      .order('enrichment_status')
      .order('title')
    return NextResponse.json({ failures: data || [] })
  }

  const { data: movies, error: queryErr } = await supabaseAdmin
    .from('movies')
    .select('id, title, year, imdb_id, poster_url, genre, enrichment_status')
    .eq('we_own', true)
    .is('poster_url', null)
    .is('enrichment_status', null)
    .limit(limit)

  console.log(`[q] found:${movies?.length ?? 'null'} err:${queryErr?.code ?? 'none'}`)
  if (queryErr) return NextResponse.json({ error: queryErr.message }, { status: 500 })
  if (!movies?.length) return NextResponse.json({ processed: 0, enriched: 0, failed: 0, skipped: 0, results: [] })

  let enriched = 0, failed = 0, skipped = 0
  const results = []

  for (const movie of movies) {
    const isTV = movie.genre?.toLowerCase().includes('tv') || movie.genre?.toLowerCase().includes('series')

    try {
      let data = null
      let failReason = null

      if (movie.imdb_id) {
        data = await enrichFromOmdb(movie.imdb_id)
        if (!data?.poster_url) {
          // Same film by IMDb id -- only fill gaps, never replace what OMDb gave us.
          const tmdb = await enrichFromTmdbByImdb(movie.imdb_id)
          if (tmdb?._apiError) { failReason = tmdb.reason }
          else if (tmdb) {
            const merged = { ...(data || {}) }
            for (const [k, v] of Object.entries(tmdb)) if (merged[k] == null && v != null) merged[k] = v
            data = merged
          }
        }
        await delay(150)
      } else {
        const tmdb = await enrichFromTmdb(movie.title, isTV, movie.year)
        if (tmdb?._apiError) failReason = tmdb.reason
        else data = tmdb
        await delay(250)
      }

      if (failReason) {
        const { error: wErr } = await supabaseAdmin.from('movies').update({ enrichment_status: 'api_error' }).eq('id', movie.id)
        console.log(`[api_err] "${movie.title}" write_err:${wErr?.code ?? 'none'}`)
        failed++
        results.push({ id: movie.id, title: movie.title, status: 'api_error', reason: failReason })
        continue
      }
      if (!data) {
        const { error: wErr } = await supabaseAdmin.from('movies').update({ enrichment_status: 'no_match' }).eq('id', movie.id)
        console.log(`[no_match] "${movie.title}" write_err:${wErr?.code ?? 'none'}`)
        skipped++
        results.push({ id: movie.id, title: movie.title, status: 'no_match' })
        continue
      }

      const fields = { enrichment_status: 'ok' }
      if (data.poster_url)  fields.poster_url  = data.poster_url
      if (data.plot)        fields.plot        = data.plot
      if (data.runtime)     fields.runtime     = data.runtime
      if (data.director)    fields.director    = data.director
      if (data.actors)      fields.actors      = data.actors
      if (data.rating_imdb) fields.rating_imdb = data.rating_imdb
      if (data.rating)      fields.rating      = data.rating
      if (data.year)        fields.year        = data.year
      if (data.imdb_id && !movie.imdb_id) fields.imdb_id = data.imdb_id

      const { data: writeData, error: writeErr } = await supabaseAdmin.from('movies').update(fields).eq('id', movie.id).select('id')
      console.log(`[ok] "${movie.title}" rows:${writeData?.length ?? 0} err:${writeErr?.code ?? 'none'}`)
      if (writeErr) {
        failed++
        results.push({ id: movie.id, title: movie.title, status: 'db_error', reason: writeErr.message })
      } else {
        enriched++
        results.push({ id: movie.id, title: movie.title, status: 'ok' })
      }

    } catch (err) {
      console.log(`[exc] "${movie.title}" ${err.message}`)
      failed++
      results.push({ id: movie.id, title: movie.title, status: 'exception', reason: err.message })
    }
  }

  return NextResponse.json({ processed: movies.length, enriched, failed, skipped, results })
}
