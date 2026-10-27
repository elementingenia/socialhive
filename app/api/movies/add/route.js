import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'
import { fetchStreamingOffers } from '@/lib/justwatch'
import { fillMissing } from '@/lib/movieRecords'


// Single OMDb call, used for both the Rotten Tomatoes score and the AU/US
// maturity classification (e.g. PG, M, MA15+) — was previously fetched for
// rating_rt only and the classification silently dropped, even though the
// movies.rating column exists and the UI already expects to display it.
async function getOmdbExtras(imdbId) {
  if (!imdbId) return { rating_rt: null, rating: null }
  try {
    const res = await fetch(
      `https://www.omdbapi.com/?i=${imdbId}&apikey=${process.env.OMDB_API_KEY || 'ed1ed939'}`
    )
    const data = await res.json()
    const rt = (data.Ratings || []).find(r => r.Source === 'Rotten Tomatoes')
    return {
      rating_rt: rt?.Value || null,
      rating: (data.Rated && data.Rated !== 'N/A') ? data.Rated : null,
    }
  } catch {
    return { rating_rt: null, rating: null }
  }
}

// Fields set whenever a film joins the Suggestions list. The 60-day clock
// (lib/suggestionList.js) runs from suggestion_clock_from, else added_at --
// so a DVD or ownership-only row added months ago would otherwise land
// already auto-retired and never show as NEW.
function suggestionStart(memberId) {
  return {
    is_viewing_suggestion: true,
    suggested_by: memberId,
    suggestion_clock_from: new Date().toISOString(),
    suggestion_retired_at: null,
  }
}

export async function POST(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: member } = await supabaseAdmin
    .from('members').select('id').eq('auth_id', user.id).single()
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 403 })

  const body = await req.json()
  const { tmdb_id, imdb_id, title, year, genre, plot, poster_url, runtime, director, actors, rating_imdb } = body

  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  // Look up any existing we_own=false row for this movie (by tmdb_id, or
  // title if no tmdb_id supplied). This row may be a genuine prior suggestion,
  // OR an "ownership-only" row created via Admin > Movies > Ownership (a
  // resident's personal DVD/digital copy recorded so it can price as Free —
  // those are deliberately NOT suggestions and don't appear in the Suggested
  // list, see is_viewing_suggestion). Both cases share the same tmdb_id/title
  // match, so we branch on is_viewing_suggestion rather than presence alone.
  // Same film = tmdb_id OR imdb_id (lib/movieRecords.js, 2026-10-27).
  const idFilter = [
    tmdb_id ? `tmdb_id.eq.${String(tmdb_id).replace(/[^0-9]/g, '')}` : null,
    imdb_id ? `imdb_id.eq.${String(imdb_id).replace(/[^a-z0-9]/gi, '')}` : null,
  ].filter(Boolean).join(',')
  let existingQuery = supabaseAdmin.from('movies').select('id, is_viewing_suggestion').eq('we_own', false)
  existingQuery = idFilter ? existingQuery.or(idFilter) : existingQuery.ilike('title', title)
  const { data: existingRows } = await existingQuery.order('is_viewing_suggestion', { ascending: false }).order('added_at').limit(1)
  const existing = existingRows?.[0] || null
  if (existing?.is_viewing_suggestion) {
    return NextResponse.json({ error: `"${title}" has already been suggested` }, { status: 409 })
  }

  // A DVD we already own can be suggested from here too (Iain, 2026-10-27:
  // the only reason to refuse a found film is that it's already on the
  // Suggestions list). Flag the owned row as a suggestion, same as
  // POST /api/dvd/suggest, rather than refusing or inserting a duplicate.
  // Match on TMDB id, then IMDb id, then title + year: some owned DVDs have
  // no tmdb_id (catalogued from spine photos), and missing them here would
  // create a duplicate row instead of suggesting the DVD we already have.
  const ownedSel = '*'
  let ownedDvd = null
  if (tmdb_id) {
    const { data } = await supabaseAdmin.from('movies').select(ownedSel)
      .eq('we_own', true).eq('tmdb_id', tmdb_id.toString()).limit(1)
    ownedDvd = data?.[0] || null
  }
  if (!ownedDvd && imdb_id) {
    const { data } = await supabaseAdmin.from('movies').select(ownedSel)
      .eq('we_own', true).eq('imdb_id', imdb_id).limit(1)
    ownedDvd = data?.[0] || null
  }
  if (!ownedDvd) {
    let q = supabaseAdmin.from('movies').select(ownedSel).eq('we_own', true).ilike('title', title)
    if (year) q = q.eq('year', year)
    const { data } = await q.limit(1)
    ownedDvd = data?.[0] || null
  }
  if (ownedDvd) {
    if (ownedDvd.is_viewing_suggestion) {
      return NextResponse.json({ error: `"${ownedDvd.title}" has already been suggested` }, { status: 409 })
    }
    const { data: movie, error } = await supabaseAdmin
      .from('movies')
      // Short TMDB/IMDb title over a DVD edition name, and fill in any film
      // ids/details the catalogued DVD is missing (Iain, 2026-10-27) -- the
      // missing tmdb_id is what let duplicates through before.
      .update({
        ...fillMissing(ownedDvd, { tmdb_id, imdb_id, year, genre, plot, poster_url, runtime, director, actors, rating_imdb }),
        ...(title ? { title } : {}),
        ...suggestionStart(member.id),
      })
      .eq('id', ownedDvd.id)
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ...movie, on_dvd: true })
  }

  const { rating_rt, rating: maturityRating } = await getOmdbExtras(imdb_id)

  // Streaming availability — non-fatal if JustWatch is down or the title
  // isn't found; the movie still gets suggested, just shows "not checked yet"
  // until an admin runs a refresh.
  let streaming_offers = null
  let streaming_checked_at = null
  try {
    streaming_offers = await fetchStreamingOffers({ title, tmdbId: tmdb_id, year })
    streaming_checked_at = new Date().toISOString()
  } catch {
    // leave both null — treated as "not checked yet" by computeFreeCost
  }

  const enrichedFields = {
    tmdb_id: tmdb_id?.toString() || null,
    imdb_id: imdb_id || null,
    title, year, genre, plot, poster_url, runtime, director, actors,
    rating_imdb: rating_imdb || null,
    rating_rt,
    rating: maturityRating,
    ...suggestionStart(member.id),
    streaming_offers,
    streaming_checked_at,
  }

  // Promote an existing ownership-only row rather than inserting a duplicate
  // movie for the same title — this keeps the ownership record (movie_ownership
  // is keyed to this row's id) correctly linked once it becomes a real
  // suggestion, and gives it the same full IMDB/TMDB/OMDB enrichment a normal
  // suggestion gets rather than whatever the simpler Ownership add flow captured.
  if (existing) {
    const { data: movie, error } = await supabaseAdmin
      .from('movies')
      .update(enrichedFields)
      .eq('id', existing.id)
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(movie)
  }

  const { data: movie, error } = await supabaseAdmin
    .from('movies')
    .insert({ ...enrichedFields, we_own: false })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(movie)
}
