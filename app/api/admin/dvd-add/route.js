import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const TMDB_KEY = process.env.TMDB_API_KEY || '0e0ec3c6d62df378f31f7ddb78a83b49'
const OMDB_KEY = process.env.OMDB_API_KEY || 'ed1ed939'

function makeAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getMember(token) {
  const db = makeAdmin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return null
  const { data } = await db.from('members').select('id, is_admin').eq('auth_id', user.id).single()
  return data
}

export async function POST(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const member = await getMember(token)
  if (!member?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { tmdb_id } = await req.json()
  if (!tmdb_id) return NextResponse.json({ error: 'tmdb_id required' }, { status: 400 })

  const db = makeAdmin()

  // Duplicate check — already in DVD library
  const { data: existing } = await db
    .from('movies')
    .select('id, title')
    .eq('we_own', true)
    .eq('tmdb_id', String(tmdb_id))
    .maybeSingle()
  if (existing) return NextResponse.json({ error: `"${existing.title}" is already in the DVD Library` }, { status: 409 })

  // Fetch full details from TMDB + OMDb (reuse same pattern as tmdb/details route)
  try {
    const [details, credits, external] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/movie/${tmdb_id}?api_key=${TMDB_KEY}&language=en-US`).then(r => r.json()),
      fetch(`https://api.themoviedb.org/3/movie/${tmdb_id}/credits?api_key=${TMDB_KEY}`).then(r => r.json()),
      fetch(`https://api.themoviedb.org/3/movie/${tmdb_id}/external_ids?api_key=${TMDB_KEY}`).then(r => r.json()),
    ])

    const imdb_id = external.imdb_id || null
    let rating_imdb = null, rating = null, rating_rt = null, plot = null

    if (imdb_id) {
      try {
        const omdb = await fetch(`https://www.omdbapi.com/?i=${imdb_id}&apikey=${OMDB_KEY}&plot=full`).then(r => r.json())
        if (omdb.Response === 'True') {
          if (omdb.imdbRating && omdb.imdbRating !== 'N/A') rating_imdb = omdb.imdbRating
          if (omdb.Rated     && omdb.Rated     !== 'N/A') rating     = omdb.Rated
          if (omdb.Plot      && omdb.Plot      !== 'N/A') plot       = omdb.Plot
          const rt = (omdb.Ratings || []).find(r => r.Source === 'Rotten Tomatoes')
          if (rt) rating_rt = rt.Value
        }
      } catch { /* OMDb optional */ }
    }

    const actors = credits.cast?.slice(0, 4).map(c => c.name).join(', ') || null

    const payload = {
      tmdb_id:    String(tmdb_id),
      imdb_id,
      title:      details.title,
      year:       details.release_date?.split('-')[0] || null,
      genre:      details.genres?.slice(0, 3).map(g => g.name).join(', ') || null,
      plot:       plot || details.overview || null,
      poster_url: details.poster_path ? `https://image.tmdb.org/t/p/w300${details.poster_path}` : null,
      runtime:    details.runtime ? `${details.runtime} min` : null,
      director:   credits.crew?.find(c => c.job === 'Director')?.name || null,
      actors,
      rating_imdb,
      rating_rt,
      rating,
      we_own:     true,
      enrichment_status: 'ok',
    }

    const { data: movie, error } = await db.from('movies').insert(payload).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(movie)
  } catch (err) {
    return NextResponse.json({ error: 'TMDB fetch failed: ' + err.message }, { status: 500 })
  }
}
