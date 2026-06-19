import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const OMDB_KEY = 'ed1ed939'
const delay = ms => new Promise(r => setTimeout(r, ms))

export async function GET(req) {
  if (req.headers.get('x-admin-secret') !== 'tmp-diag-2026') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: movies } = await admin
    .from('movies')
    .select('id, title, imdb_id, genre')
    .is('genre', null)
    .not('imdb_id', 'is', null)

  if (!movies || movies.length === 0) {
    return NextResponse.json({ message: 'Nothing to backfill', count: 0 })
  }

  const results = []
  for (const movie of movies) {
    try {
      const url = 'https://www.omdbapi.com/?i=' + movie.imdb_id + '&apikey=' + OMDB_KEY
      const res = await fetch(url)
      const data = await res.json()
      const genre = data.Genre && data.Genre !== 'N/A' ? data.Genre : null
      if (genre) {
        await admin.from('movies').update({ genre }).eq('id', movie.id)
        results.push({ title: movie.title, genre, status: 'updated' })
      } else {
        results.push({ title: movie.title, status: 'no_genre' })
      }
    } catch (e) {
      results.push({ title: movie.title, status: 'error', error: String(e) })
    }
    await delay(220)
  }

  return NextResponse.json({ processed: movies.length, results })
}
