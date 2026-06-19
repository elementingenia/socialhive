import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(request) {
  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: member } = await supabaseAdmin.from('members').select('is_admin').eq('auth_id', user.id).single()
    if (!member?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const movie = await request.json()

    // Duplicate check
    const { data: existing } = await supabaseAdmin.from('movies').select('id').ilike('title', movie.title).maybeSingle()
    if (existing) return NextResponse.json({ error: `"${movie.title}" is already in the library` }, { status: 409 })

    const { error: insertError } = await supabaseAdmin.from('movies').insert({
      tmdb_id: movie.tmdb_id || null,
      imdb_id: movie.imdb_id || null,
      title: movie.title,
      year: movie.year || null,
      genre: movie.genre || null,
      plot: movie.plot || null,
      poster_url: movie.poster_url || null,
      runtime: movie.runtime || null,
      director: movie.director || null,
      actors: movie.actors || null,
    })

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
