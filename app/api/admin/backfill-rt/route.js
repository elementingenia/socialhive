import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function GET(req) {
  if (req.headers.get('x-admin-secret') !== 'tmp-admin-2026') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: movies } = await supabaseAdmin
    .from('movies')
    .select('id, title, imdb_id, rating_rt')
    .not('imdb_id', 'is', null)

  const toUpdate = (movies || []).filter(m => !m.rating_rt)
  const results = []

  for (const movie of toUpdate) {
    try {
      const res = await fetch(`https://www.omdbapi.com/?i=${movie.imdb_id}&apikey=ed1ed939`)
      const data = await res.json()
      const rt = (data.Ratings || []).find(r => r.Source === 'Rotten Tomatoes')
      const rtValue = rt?.Value || null

      if (rtValue) {
        await supabaseAdmin.from('movies').update({ rating_rt: rtValue }).eq('id', movie.id)
        results.push({ title: movie.title, rt: rtValue, status: 'updated' })
      } else {
        results.push({ title: movie.title, status: 'no_rt_on_omdb' })
      }

      await new Promise(r => setTimeout(r, 220))
    } catch (e) {
      results.push({ title: movie.title, status: 'error', error: e.message })
    }
  }

  const updated = results.filter(r => r.status === 'updated').length
  return NextResponse.json({ total: toUpdate.length, updated, results })
}
