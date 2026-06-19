import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export async function GET(req) {
  if (req.headers.get('x-admin-secret') !== 'tmp-diag-2026') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data } = await admin.from('movies').select('title, genre, rating_imdb, rating_rt').order('title').limit(30)
  const nullGenre = data?.filter(m => !m.genre).length
  const nullImdb  = data?.filter(m => !m.rating_imdb).length
  return NextResponse.json({ total: data?.length, nullGenre, nullImdb, sample: data?.slice(0, 10) })
}
