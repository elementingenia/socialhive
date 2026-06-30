import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function getMember(token) {
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data } = await supabaseAdmin
    .from('members').select('id, is_admin').eq('auth_id', user.id).single()
  return data || null
}

// POST — any member can suggest a DVD for screening
export async function POST(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { movie_id } = await req.json()
  if (!movie_id) return NextResponse.json({ error: 'movie_id required' }, { status: 400 })

  // Confirm it's a DVD we own
  const { data: movie } = await supabaseAdmin
    .from('movies').select('id, title, we_own, is_viewing_suggestion').eq('id', movie_id).single()
  if (!movie) return NextResponse.json({ error: 'Movie not found' }, { status: 404 })
  if (!movie.we_own) return NextResponse.json({ error: 'Only DVDs in the library can be suggested this way' }, { status: 400 })
  if (movie.is_viewing_suggestion) return NextResponse.json({ error: `"${movie.title}" is already suggested` }, { status: 409 })

  const { error } = await supabaseAdmin
    .from('movies')
    .update({ is_viewing_suggestion: true, suggested_by: member.id })
    .eq('id', movie_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, title: movie.title })
}

// DELETE — admin only, removes the suggestion flag
export async function DELETE(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const member = await getMember(token)
  if (!member?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { movie_id } = await req.json()
  if (!movie_id) return NextResponse.json({ error: 'movie_id required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('movies')
    .update({ is_viewing_suggestion: false, suggested_by: null })
    .eq('id', movie_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
