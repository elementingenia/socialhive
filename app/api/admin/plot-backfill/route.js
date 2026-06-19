import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'socialhive-admin-2026'
const OMDB_KEY = 'ed1ed939'

export async function GET(req) {
  if (req.headers.get('x-admin-secret') !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: movies, error } = await supabaseAdmin
    .from('movies')
    .select('id, title, imdb_id, plot')
    .not('imdb_id', 'is', null)
    .is('plot', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!movies?.length) return NextResponse.json({ message: 'Nothing to backfill', count: 0 })

  const results = []
  for (const movie of movies) {
    try {
      const url = 'https://www.omdbapi.com/?i=' + movie.imdb_id + '&apikey=' + OMDB_KEY
      const res = await fetch(url)
      const data = await res.json()

      if (data.Response === 'True' && data.Plot && data.Plot !== 'N/A') {
        const { error: upErr } = await supabaseAdmin
          .from('movies')
          .update({ plot: data.Plot })
          .eq('id', movie.id)

        results.push({ title: movie.title, status: upErr ? 'error' : 'updated', plot: data.Plot.substring(0, 60) + '...' })
      } else {
        results.push({ title: movie.title, status: 'no_plot', response: data.Response })
      }
    } catch (err) {
      results.push({ title: movie.title, status: 'fetch_error', error: err.message })
    }

    // Small delay to avoid rate-limit
    await new Promise(r => setTimeout(r, 120))
  }

  const updated = results.filter(r => r.status === 'updated').length
  return NextResponse.json({ processed: movies.length, updated, results })
}
