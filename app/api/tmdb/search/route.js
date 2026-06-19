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
    return NextResponse.json(data.results?.slice(0, 8) || [])
  } catch {
    return NextResponse.json([])
  }
}
