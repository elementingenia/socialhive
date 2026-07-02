import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchStreamingOffers } from '@/lib/justwatch'

const OMDB_KEY = process.env.OMDB_API_KEY || 'ed1ed939'

// Only fetched for movies that don't have a maturity rating yet — same gap as
// streaming_offers: movies/add never wrote this field until now, so every
// suggestion added before that fix is missing it. Piggybacks on this same
// batch loop rather than a separate runner, since it's a single lightweight
// OMDb call keyed on the imdb_id every suggestion already has.
async function fetchMaturityRating(imdbId) {
  if (!imdbId) return null
  try {
    const res = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_KEY}`)
    const data = await res.json()
    return (data.Rated && data.Rated !== 'N/A') ? data.Rated : null
  } catch {
    return null
  }
}

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
// until processed === 0 — kept batched rather than one giant request so it
// never risks hitting a serverless function timeout.
//
// IMPORTANT: eligibility is governed entirely server-side by a fixed cooldown
// window, not by anything the client sends. An earlier version relied on the
// client passing a "before" cutoff captured once at the start of a run — that
// broke the moment the browser served a stale cached bundle that didn't send
// it: the server fell back to computing "now" fresh on every single request,
// which never excludes anything a batch just checked, recreating the exact
// infinite loop this was meant to fix (confirmed live: it looped past 1200
// processed with 20 of 65 movies still never actually checked). A cooldown
// hardcoded here can't be defeated by a stale, buggy, or naive client — no
// matter what it sends (or doesn't), a movie checked within the last
// COOLDOWN_MS is never eligible again until real time passes, so a full pass
// is always guaranteed to exhaust and hit processed: 0.
const COOLDOWN_MS = 2 * 60 * 1000 // 2 minutes — long enough that one run can't re-select a row it just checked, short enough to re-run again shortly after if needed

export async function GET(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const member = await getAdmin(token)
  if (!member) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const limit  = Math.min(parseInt(searchParams.get('limit') || '10'), 20)
  const cutoff = new Date(Date.now() - COOLDOWN_MS).toISOString()

  const supabaseAdmin = makeAdminClient()

  const { data: movies, error: queryErr } = await supabaseAdmin
    .from('movies')
    .select('id, title, year, tmdb_id, imdb_id, rating')
    .eq('we_own', false)
    .eq('is_viewing_suggestion', true)
    .or(`streaming_checked_at.is.null,streaming_checked_at.lt.${cutoff}`)
    .order('streaming_checked_at', { ascending: true, nullsFirst: true })
    .limit(limit)

  if (queryErr) return NextResponse.json({ error: queryErr.message }, { status: 500 })
  if (!movies?.length) return NextResponse.json({ processed: 0, updated: 0, results: [] })

  let updated = 0
  const results = []

  for (const movie of movies) {
    try {
      const offers = await fetchStreamingOffers({ title: movie.title, tmdbId: movie.tmdb_id, year: movie.year })
      const patch = { streaming_offers: offers, streaming_checked_at: new Date().toISOString() }
      if (!movie.rating) {
        patch.rating = await fetchMaturityRating(movie.imdb_id)
      }
      const { error: writeErr } = await supabaseAdmin
        .from('movies')
        .update(patch)
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
