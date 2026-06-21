import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const TMDB_KEY = process.env.TMDB_API_KEY || '0e0ec3c6d62df378f31f7ddb78a83b49'
const OMDB_KEY = process.env.OMDB_API_KEY || 'ed1ed939'

function makeAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
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

const delay = ms => new Promise(r => setTimeout(r, ms))

export async function GET(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const member = await getMember(token)
  if (!member?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const limit     = Math.min(parseInt(searchParams.get('limit') || '20'), 30)
  const catalogue = searchParams.get('catalogue') === 'true'

  // Service-role client — bypasses RLS for all writes
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  try {
    const p = JSON.parse(Buffer.from((svcKey||'').split('.')[1]||'e30=','base64').toString())
    console.log(`[cfg] role:${p.role} ref:${p.ref} url:${supabaseUrl?.slice(-20)}`)
  } catch(e) { console.log('[cfg] key-err:', e.message) }
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

  const { data: movies, error } = await supabaseAdmin
    .from('movies')
    .select('id, title, imdb_id, poster_url, genre, enrichment_status')
    .eq('we_own', true)
    .is('poster_url', null)
    .or('enrichment_status.is.null,enrichment_status.eq.api_error')
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
          const tmdb = await enrichFromTmdb(movie.title, isTV)
          if (tmdb?._apiError) { failReason = tmdb.reason }
          else if (tmdb) data = { ...data, ...tmdb }
        }
        await delay(150)
      } else {
        const tmdb = await enrichFromTmdb(movie.title, isTV)
        if (tmdb?._apiError) failReason = tmdb.reason
        else data = tmdb
        await delay(250)
      }

      if (failReason) {
        await supabaseAdmin.from('movies').update({ enrichment_status: 'api_error' }).eq('id', movie.id)
        failed++
        results.push({ id: movie.id, title: movie.title, status: 'api_error', reason: failReason })
        continue
      }
      if (!data) {
        await supabaseAdmin.from('movies').update({ enrichment_status: 'no_match' }).eq('id', movie.id)
        skipped++
        results.push({ id: movie.id, title: movie.title, status: 'no_match' })
        continue
      }

      // Build update fields — only non-null values
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
      console.log(`[w]r:${writeData?.length}e:${writeErr?.code||0}`)
      if (writeErr) {
        failed++
        results.push({ id: movie.id, title: movie.title, status: 'db_error', reason: writeErr.message })
      } else {
        enriched++
        results.push({ id: movie.id, title: movie.title, status: 'ok' })
      }

    } catch (err) {
      failed++
      results.push({ id: movie.id, title: movie.title, status: 'exception', reason: err.message })
    }
  }

  return NextResponse.json({ processed: movies.length, enriched, failed, skipped, results })
}
