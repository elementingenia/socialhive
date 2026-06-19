import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'socialhive-admin-2026'
const TMDB_KEY = '0e0ec3c6d62df378f31f7ddb78a83b49'

export async function GET(req) {
  if (req.headers.get('x-admin-secret') !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: movies, error } = await supabaseAdmin
    .from('movies')
    .select('id, title, imdb_id')
    .not('imdb_id', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!movies?.length) return NextResponse.json({ message: 'No movies with imdb_id', count: 0 })

  const results = []
  for (const movie of movies) {
    try {
      const url = 'https://api.themoviedb.org/3/find/' + movie.imdb_id +
        '?external_source=imdb_id&api_key=' + TMDB_KEY
      const res = await fetch(url)
      const data = await res.json()

      const result = data.movie_results?.[0]
      if (result?.overview && result.overview.length > 0) {
        const { error: upErr } = await supabaseAdmin
          .from('movies')
          .update({ plot: result.overview })
          .eq('id', movie.id)

        results.push({
          title: movie.title,
          status: upErr ? 'error' : 'updated',
          plot: result.overview.substring(0, 80) + '...',
        })
      } else {
        results.push({ title: movie.title, status: 'no_overview', tmdb_id: result?.id })
      }
    } catch (err) {
      results.push({ title: movie.title, status: 'fetch_error', error: err.message })
    }

    await new Promise(r => setTimeout(r, 100))
  }

  const updated = results.filter(r => r.status === 'updated').length
  return NextResponse.json({ processed: movies.length, updated, results })
}
