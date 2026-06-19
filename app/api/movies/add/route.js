import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function getRtRating(imdbId) {
  if (!imdbId) return null
  try {
    const res = await fetch(
      `https://www.omdbapi.com/?i=${imdbId}&apikey=${process.env.OMDB_API_KEY || 'ed1ed939'}`
    )
    const data = await res.json()
    const rt = (data.Ratings || []).find(r => r.Source === 'Rotten Tomatoes')
    return rt?.Value || null
  } catch {
    return null
  }
}

export async function POST(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: member } = await supabaseAdmin
    .from('members').select('id, is_admin').eq('auth_id', user.id).single()
  if (!member?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await req.json()
  const { tmdb_id, imdb_id, title, year, genre, plot, poster_url, runtime, director, actors, rating_imdb } = body

  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  // Check duplicate
  const { data: existing } = await supabaseAdmin
    .from('movies').select('id').ilike('title', title).maybeSingle()
  if (existing) return NextResponse.json({ error: `"${title}" is already in the library` }, { status: 409 })

  // Fetch RT rating from OMDb
  const rating_rt = await getRtRating(imdb_id)

  const { data: movie, error } = await supabaseAdmin
    .from('movies')
    .insert({
      tmdb_id: tmdb_id?.toString() || null,
      imdb_id: imdb_id || null,
      title, year, genre, plot, poster_url, runtime, director, actors,
      rating_imdb: rating_imdb || null,
      rating_rt,
      suggested_by: member.id,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(movie)
}
