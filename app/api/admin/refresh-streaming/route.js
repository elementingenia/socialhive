import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchStreamingOffers } from '@/lib/justwatch'

function makeAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getAdmin(token) {
  if (!token) return null
  const authClient = makeAdminClient()
  const { data: { user } } = await authClient.auth.getUser(token)
  if (!user) return null
  const db = makeAdminClient()
  const { data } = await db.from('members').select('id, is_admin').eq('auth_id', user.id).single()
  return data?.is_admin ? data : null
}

const delay = ms => new Promise(r => setTimeout(r, ms))

// Re-checks streaming availability for viewing-suggestion movies (we_own=false)
// in small batches, oldest/never-checked first. Admin UI calls this repeatedly
// with an increasing offset until processed === 0 — kept batched rather than
// one giant request so it never risks hitting a serverless function timeout.
export async function GET(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const member = await getAdmin(token)
  if (!member) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 20)

  const supabaseAdmin = makeAdminClient()

  const { data: movies, error: queryErr } = await supabaseAdmin
    .from('movies')
    .select('id, title, year, tmdb_id')
    .eq('we_own', false)
    .order('streaming_checked_at', { ascending: true, nullsFirst: true })
    .limit(limit)

  if (queryErr) return NextResponse.json({ error: queryErr.message }, { status: 500 })
  if (!movies?.length) return NextResponse.json({ processed: 0, updated: 0, results: [] })

  let updated = 0
  const results = []

  for (const movie of movies) {
    try {
      const offers = await fetchStreamingOffers({ title: movie.title, tmdbId: movie.tmdb_id, year: movie.year })
      const { error: writeErr } = await supabaseAdmin
        .from('movies')
        .update({ streaming_offers: offers, streaming_checked_at: new Date().toISOString() })
        .eq('id', movie.id)

      if (writeErr) {
        results.push({ id: movie.id, title: movie.title, status: 'db_error', reason: writeErr.message })
      } else {
        updated++
        results.push({
          id: movie.id,
          title: movie.title,
          status: offers.matched ? 'ok' : 'not_found',
          flatrate: offers.flatrate,
        })
      }
      await delay(400) // be polite to JustWatch's unofficial endpoint
    } catch (err) {
      results.push({ id: movie.id, title: movie.title, status: 'exception', reason: err.message })
    }
  }

  return NextResponse.json({ processed: movies.length, updated, results })
}
