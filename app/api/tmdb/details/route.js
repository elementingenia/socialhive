import { NextResponse } from 'next/server'

export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const KEY = process.env.TMDB_API_KEY
  try {
    const [details, credits, external] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${KEY}&language=en-US`).then(r => r.json()),
      fetch(`https://api.themoviedb.org/3/movie/${id}/credits?api_key=${KEY}`).then(r => r.json()),
      fetch(`https://api.themoviedb.org/3/movie/${id}/external_ids?api_key=${KEY}`).then(r => r.json()),
    ])
    return NextResponse.json({
      tmdb_id: String(id),
      imdb_id: external.imdb_id || null,
      title: details.title,
      year: details.release_date?.split('-')[0] || null,
      genre: details.genres?.slice(0, 3).map(g => g.name).join(', ') || null,
      plot: details.overview || null,
      poster_url: details.poster_path ? `https://image.tmdb.org/t/p/w300${details.poster_path}` : null,
      runtime: details.runtime ? `${details.runtime} min` : null,
      director: credits.crew?.find(c => c.job === 'Director')?.name || null,
      actors: credits.cast?.slice(0, 4).map(c => c.name).join(', ') || null,
    })
  } catch (err) {
    return NextResponse.json({ error: 'TMDB fetch failed' }, { status: 500 })
  }
}
