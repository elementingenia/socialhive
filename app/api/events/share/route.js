import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'

// GET /api/events/share?id=<event id>
//
// Anonymous-safe single-event lookup, for a visitor following a shared
// ?event=<id> deep link (Event_Deep_Linking_and_Calendar_Scope_v2, decision
// 4). Deliberately NOT gated on `is_public` the way /api/events (the public
// /cal browse list) is -- is_public controls whether an event shows up in
// the general public calendar's browse list, which is an unrelated, existing
// opt-in feature (Iain, 2026-08-04). A deep link is a direct pointer to ONE
// event a resident chose to share; per decision 1/2/3 of this scope, "you do
// not need a booking to be able to copy the link" and this holds for every
// hub, private Book a Space bookings included (see app/api/spaces/share for
// that table's own equivalent). Gating this on is_public would make most
// shared links dead on arrival, which is exactly what this feature is meant
// to avoid.
//
// force-dynamic + no-store supabaseAdmin -- same reasoning as /api/events
// (lib/supabaseAdmin.js): a deep link must never resolve against a stale
// cached snapshot.
export const dynamic = "force-dynamic"

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: event, error } = await supabaseAdmin
    .from('events')
    .select(`
      id, hub_type, title, event_date, event_time, cost, description, archived,
      location_type, location, club_id,
      club:clubs!club_id ( id, name, slug, colour, single_signup ),
      welcome_message, image_url, image_focal_x, image_focal_y, movie_id, book_id, booking_required,
      movie:movies!movie_id ( id, title, poster_url, rating_imdb, plot, genre, runtime, imdb_id, tmdb_id ),
      book:books!book_id ( id, title, cover_url, rating, rating_link, summary, author )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Dead/expired link states (decision 5 / build sequence step 4b): not
  // found at all, or archived. A past event is deliberately still viewable
  // here -- unlike screenings' own "upcoming" list, a shared link to
  // something that already happened is a legitimate "what was this again"
  // lookup, not a dead link.
  if (!event || event.archived) {
    return NextResponse.json({ available: false, reason: !event ? 'not_found' : 'archived' })
  }

  return NextResponse.json({ available: true, event })
}
