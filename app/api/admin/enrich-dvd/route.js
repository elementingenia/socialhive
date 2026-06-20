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

// Strip season/series suffixes from TV titles before searching
// e.g. "Friends (Season 1)" → "Friends"
function stripSeason(title) {
  return title.replace(/\s*\((?:Season|Series|Complete|Reunion|Specials?|S\d+)[^)]*\)/gi, '').trim()
}

// Also strip common DVD edition suffixes for cleaner search
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
    title_check: data.Title,
    poster_url:  data.Poster && data.Poster !== 'N/A' ? data.Poster : null,
    plot:        data.Plot   && data.Plot   !== 'N/A' ? data.Plot   : null,
    runtime:     data.Runtime && data.Runtime !== 'N/A' ? data.Runtime : null,
    director:    data.Director && data.Director !== 'N/A' ? data.Director : null,
    actors:      data.Actors && data.Actors !== 'N/A' ? data.Actors : null,
    rating_imdb: data.imdbRating && data.imdbRating !== 'N/A' ? data.imdbRating : null,
    imdb_id:     imdbId,
    year:        data.Year && data.Year !== 'N/A' ? data.Year.slice(0, 4) : null,
  }
}

async function enrichFromTmdb(title, isTV) {
  const searchType = isTV ? 'tv' : 'movie'
  const clean = cleanTitle(title)
  const searchUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(clean)}&language=en-AU`
  const searchRes = await fetch(searchUrl)
  if (!searchRes.ok) return null
  const searchData = await searchRes.json()
  const result = searchData.results?.[0]
  if (!result) return null

  const detailUrl = `https://api.themoviedb.org/3/${searchType}/${result.id}?api_key=${TMDB_KEY}&language=en-AU&append_to_response=credits,external_ids`
  const detailRes = await fetch(detailUrl)
  if (!detailRes.ok) return null
  const d = await detailRes.json()

  const imdb_id = d.external_ids?.imdb_id || null
  const poster  = d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null
  const runtime = isTV
    ? (d.episode_run_time?.[0] ? `${d.episode_run_time[0]} min` : null)
    : (d.runtime ? `${d.runtime} min` : null)
  const director = !isTV
    ? d.credits?.crew?.find(c => c.job === 'Director')?.name || null
    : null
  const actors = d.credits?.cast?.slice(0, 4).map(c => c.name).join(', ') || null
  const overview = d.overview || null
  const releaseYear = isTV
    ? d.first_air_date?.slice(0, 4)
    : d.release_date?.slice(0, 4)

  // Also try OMDb for the IMDB rating if we have the ID
  let rating_imdb = null
  if (imdb_id) {
    const omdb = await enrichFromOmdb(imdb_id)
    rating_imdb = omdb?.rating_imdb || null
  }

  return {
    poster_url:  poster,
    plot:        overview,
    runtime,
    director,
    actors,
    rating_imdb,
    imdb_id,
    year:        releaseYear || null,
  }
}

// Small delay to respect rate limits
const delay = ms => new Promise(r => setTimeout(r, ms))

export async function GET(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const member = await getMember(token)
  if (!member?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 50)
  const forceRefresh = searchParams.get('force') === 'true'

  // Fetch DVD movies missing enrichment data
  let query = supabaseAdmin
    .from('movies')
    .select('id, title, imdb_id, poster_url, plot, genre')
    .eq('we_own', true)
    .limit(limit)

  if (!forceRefresh) {
    query = query.is('poster_url', null)
  }

  const { data: movies, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!movies?.length) return NextResponse.json({ message: 'All DVD items already enriched', enriched: 0 })

  const results = { enriched: 0, skipped: 0, failed: 0, details: [] }

  for (const movie of movies) {
    const isTV = movie.genre?.includes('TV Series')

    try {
      let enriched = null

      if (movie.imdb_id) {
        enriched = await enrichFromOmdb(movie.imdb_id)
        if (!enriched?.poster_url && !enriched?.plot) {
          // OMDb had no useful data — fall back to TMDB
          const tmdb = await enrichFromTmdb(movie.title, isTV)
          if (tmdb) enriched = { ...enriched, ...tmdb }
        }
        await delay(150) // OMDb rate limit
      } else {
        enriched = await enrichFromTmdb(movie.title, isTV)
        await delay(250) // TMDB rate limit buffer
      }

      if (!enriched) {
        results.skipped++
        results.details.push({ title: movie.title, status: 'no_match' })
        continue
      }

      // Only update fields that are currently NULL or being forced
      const update = {}
      if (!movie.poster_url && enriched.poster_url) update.poster_url = enriched.poster_url
      if (!movie.plot        && enriched.plot)       update.plot        = enriched.plot
      if (enriched.runtime)   update.runtime   = enriched.runtime
      if (enriched.director)  update.director  = enriched.director
      if (enriched.actors)    update.actors    = enriched.actors
      if (enriched.rating_imdb) update.rating_imdb = enriched.rating_imdb
      if (enriched.imdb_id && !movie.imdb_id) update.imdb_id = enriched.imdb_id
      if (enriched.year)      update.year      = enriched.year

      if (Object.keys(update).length === 0) {
        results.skipped++
        results.details.push({ title: movie.title, status: 'nothing_to_update' })
        continue
      }

      const { error: updateErr } = await supabaseAdmin
        .from('movies').update(update).eq('id', movie.id)

      if (updateErr) {
        results.failed++
        results.details.push({ title: movie.title, status: 'update_failed', error: updateErr.message })
      } else {
        results.enriched++
        results.details.push({
          title: movie.title,
          status: 'ok',
          fields: Object.keys(update),
          poster: !!update.poster_url,
        })
      }
    } catch (err) {
      results.failed++
      results.details.push({ title: movie.title, status: 'error', error: err.message })
      await delay(500)
    }
  }

  return NextResponse.json({
    processed: movies.length,
    ...results,
    message: `Enriched ${results.enriched}, skipped ${results.skipped}, failed ${results.failed}. Run again to continue.`,
  })
}
