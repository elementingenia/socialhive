import { NextResponse } from 'next/server'

export async function GET(request) {
  const q = new URL(request.url).searchParams.get('q')
  if (!q?.trim()) return NextResponse.json([])
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(q)}&language=en-US&include_adult=false`,
      { cache: 'no-store' }
    )
    const data = await res.json()
    const results = (data.results || []).slice(0, 8).map(m => ({
      tmdb_id: String(m.id),
      title:   m.title,
      year:    m.release_date?.split('-')[0] || null,
      poster_url: m.poster_path ? `https://image.tmdb.org/t/p/w185${m.poster_path}` : null,
    }))
    return NextResponse.json(results)
  } catch {
    return NextResponse.json([])
  }
}
