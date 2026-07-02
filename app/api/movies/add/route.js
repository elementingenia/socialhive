import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchStreamingOffers } from '@/lib/justwatch'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Single OMDb call, used for both the Rotten Tomatoes score and the AU/US
// maturity classification (e.g. PG, M, MA15+) — was previously fetched for
// rating_rt only and the classification silently dropped, even though the
// movies.rating column exists and the UI already expects to display it.
async function getOmdbExtras(imdbId) {
  if (!imdbId) return { rating_rt: null, rating: null }
  try {
    const res = await fetch(
      `https://www.omdbapi.com/?i=${imdbId}&apikey=${process.env.OMDB_API_KEY || 'ed1ed939'}`
    )
    const data = await res.json()
    const rt = (data.Ratings || []).find(r => r.Source === 'Rotten Tomatoes')
    return {
      rating_rt: rt?.Value || null,
      rating: (data.Rated && data.Rated !== 'N/A') ? data.Rated : null,
    }
  } catch {
    return { rating_rt: null, rating: null }
  }
}

export async function POST(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: member } = await supabaseAdmin
    .from('members').select('id').eq('auth_id', user.id).single()
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 403 })

  const body = await req.json()
  const { tmdb_id, imdb_id, title, year, genre, plot, poster_url, runtime, director, actors, rating_imdb } = body

  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  // Block if already a viewing suggestion (we_own=false)
  let existingQuery = supabaseAdmin.from('movies').select('id').eq('we_own', false)
  existingQuery = tmdb_id
    ? existingQuery.eq('tmdb_id', tmdb_id.toString())
    : existingQuery.ilike('title', title)
  const { data: existing } = await existingQuery.maybeSingle()
  if (existing) return NextResponse.json({ error: `"${title}" has already been suggested` }, { status: 409 })

  // Block if this is a DVD we already own — user should suggest from the DVD Library instead
  if (tmdb_id) {
    const { data: ownedDvd } = await supabaseAdmin
      .from('movies').select('id, title').eq('we_own', true).eq('tmdb_id', tmdb_id.toString()).maybeSingle()
    if (ownedDvd) return NextResponse.json({
      error: `"${title}" is already in the DVD Library — suggest it for a screening from the DVD page instead.`,
      dvd_exists: true,
    }, { status: 409 })
  }

  const { rating_rt, rating: maturityRating } = await getOmdbExtras(imdb_id)

  // Streaming availability — non-fatal if JustWatch is down or the title
  // isn't found; the movie still gets suggested, just shows "not checked yet"
  // until an admin runs a refresh.
  let streaming_offers = null
  let streaming_checked_at = null
  try {
    streaming_offers = await fetchStreamingOffers({ title, tmdbId: tmdb_id, year })
    streaming_checked_at = new Date().toISOString()
  } catch {
    // leave both null — treated as "not checked yet" by computeFreeCost
  }

  const { data: movie, error } = await supabaseAdmin
    .from('movies')
    .insert({
      tmdb_id: tmdb_id?.toString() || null,
      imdb_id: imdb_id || null,
      title, year, genre, plot, poster_url, runtime, director, actors,
      rating_imdb: rating_imdb || null,
      rating_rt,
      rating: maturityRating,
      we_own: false,
      is_viewing_suggestion: true,
      suggested_by: member.id,
      streaming_offers,
      streaming_checked_at,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(movie)
}
