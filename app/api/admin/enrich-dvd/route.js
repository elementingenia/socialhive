import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const TMDB_KEY = process.env.TMDB_API_KEY || '0e0ec3c6d62df378f31f7ddb78a83b49'
const OMDB_KEY = process.env.OMDB_API_KEY || 'ed1ed939'

async function getMember(token) {
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return null
  const { data } = await supabaseAdmin
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

async function enrichFromTmdb(title, isTV) {
  const searchType = isTV ? 'tv' : 'movie'
  const clean = cleanTitle(title)
  const searchUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(clean)}&language=en-AU`
  const searchRes = await fetch(searchUrl)
  if (!searchRes.ok) return { _apiError: true, reason: `TMDB search HTTP ${searchRes.status}` }
  const searchData = await searchRes.json()
  const result = searchData.results?.[0]
  if (!result) return null

  const detailUrl = `https://api.themoviedb.org/3/${searchType}/${result.id}?api_key=${TMDB_KEY}&language=en-AU&append_to_response=credits,external_ids`
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

async function dbUpdate(movieId, fields) {
  const { error, count } = await supabaseAdmin
    .from('movies')
    .update(fields, { count: 'exact' })
    .eq('id', movieId)
  return { error, count }
}

const delay = ms => new Promise(r => setTimeout(r, ms))

export async function GET(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const member = await getMember(token)
  if (!member?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const limit        = Math.min(parseInt(searchParams.get('limit') || '30'), 50)
  const forceRefresh = searchParams.get('force') === 'true'
  const catalogue    = searchParams.get('catalogue') === 'true'

  // Diagnostic: confirm which key the function actually has
  const keySnippet   = searchParams.get('diag') === 'true'
    ? (process.env.SUPABASE_SERVICE_ROLE_KEY || 'MISSING').slice(0, 30) + '...'
    : undefined

  if (catalogue) {
    const { data } = await supabaseAdmin
      .from('movies')
      .select('id, title, enrichment_status, genre')
      .in('enrichment_status', ['no_match', 'api_error'])
      .order('enrichment_status')
      .order('title')
    return NextResponse.json({ failures: data || [] })
  }

  let query = supabaseAdmin
    .from('movies')
    .select('id, title, imdb_id, poster_url, plot, genre, enrichment_status')
    .eq('we_own', true)
    .limit(limit)

  if (!forceRefresh) {
    query = query
      .is('poster_url', null)
      .or('enrichment_status.is.null,enrichment_status.eq.api_error')
  }

  const { data: movies, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!movies?.length) return NextResponse.json({
    message: 'All DVD items enriched or no_match catalogued',
    enriched: 0, processed: 0,
    ...(keySnippet ? { _keySnippet: keySnippet } : {})
  })

  const results = { enriched: 0, skipped: 0, failed: 0, dbWriteErrors: 0, details: [] }

  for (const movie of movies) {
    const isTV = movie.genre?.toLowerCase().includes('tv') || movie.genre?.toLowerCase().includes('series')

    try {
      let enriched = null
      let failReason = null

      if (movie.imdb_id) {
        enriched = await enrichFromOmdb(movie.imdb_id)
        if (!enriched?.poster_url) {
          const tmdb = await enrichFromTmdb(movie.title, isTV)
          if (tmdb?._apiError) {
            failReason = tmdb.reason
            enriched = enriched || null
          } else if (tmdb) {
            enriched = { ...enriched, ...tmdb }
          }
        }
        await delay(150)
      } else {
        const tmdb = await enrichFromTmdb(movie.title, isTV)
        if (tmdb?._apiError) {
          failReason = tmdb.reason
        } else {
          enriched = tmdb
        }
        await delay(250)
      }

      if (failReason) {
        const { error: ue, count: uc } = await dbUpdate(movie.id, { enrichment_status: 'api_error' })
        if (ue || uc === 0) {
          results.dbWriteErrors++
          results.details.push({ id: movie.id, title: movie.title, status: 'db_write_failed', reason: `api_error mark failed: ${ue?.message || '0 rows affected'}` })
        } else {
          results.failed++
          results.details.push({ id: movie.id, title: movie.title, status: 'api_error', reason: failReason })
        }
        continue
      }

      if (!enriched) {
        const { error: ue, count: uc } = await dbUpdate(movie.id, { enrichment_status: 'no_match' })
        if (ue || uc === 0) {
          results.dbWriteErrors++
          results.details.push({ id: movie.id, title: movie.title, status: 'db_write_failed', reason: `no_match mark failed: ${ue?.message || '0 rows affected'}` })
        } else {
          results.skipped++
          results.details.push({ id: movie.id, title: movie.title, status: 'no_match', reason: 'Not found on TMDB or OMDb' })
        }
        continue
      }

      const update = { enrichment_status: 'ok' }
      if (enriched.poster_url)  update.poster_url  = enriched.poster_url
      if (enriched.plot)        update.plot        = enriched.plot
      if (enriched.runtime)     update.runtime     = enriched.runtime
      if (enriched.director)    update.director    = enriched.director
      if (enriched.actors)      update.actors      = enriched.actors
      if (enriched.rating_imdb) update.rating_imdb = enriched.rating_imdb
      if (enriched.rating)      update.rating      = enriched.rating
      if (enriched.year)        update.year        = enriched.year
      if (enriched.imdb_id && !movie.imdb_id) update.imdb_id = enriched.imdb_id
      if (enriched.genre && !movie.genre)     update.genre   = enriched.genre

      const { error: updateErr, count: updateCount } = await dbUpdate(movie.id, update)

      if (updateErr) {
        results.dbWriteErrors++
        results.details.push({ id: movie.id, title: movie.title, status: 'db_write_failed', reason: `DB error: ${updateErr.message}` })
      } else if (updateCount === 0) {
        results.dbWriteErrors++
        results.details.push({ id: movie.id, title: movie.title, status: 'db_write_failed', reason: '0 rows affected — RLS blocked write (check service role key)' })
      } else {
        results.enriched++
        results.details.push({ id: movie.id, title: movie.title, status: 'ok', fields: Object.keys(update).filter(k => k !== 'enrichment_status') })
      }
    } catch (err) {
      const { error: ue, count: uc } = await dbUpdate(movie.id, { enrichment_status: 'api_error' })
      if (ue || uc === 0) {
        results.dbWriteErrors++
      } else {
        results.failed++
      }
      results.details.push({ id: movie.id, title: movie.title, status: 'exception', reason: err.message })
      await delay(500)
    }
  }

  return NextResponse.json({
    processed: movies.length,
    ...results,
    ...(keySnippet ? { _keySnippet: keySnippet } : {})
  })
}
