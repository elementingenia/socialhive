import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'

// GET /api/spaces/share?id=<space_booking id>
//
// Anonymous-safe single-booking lookup for a shared ?sb=<id> deep link to a
// PRIVATE Book a Space booking. Event_Deep_Linking_and_Calendar_Scope_v2,
// decision 2: private/non-shared bookings are included for both Copy Link
// and Add to Calendar, same as shared/joinable space events -- "No carve-
// out." Shared/joinable space bookings are promoted into real `events` rows
// (hub_type='space') and already go through /api/events/share instead; this
// route only ever serves the private, standalone space_bookings rows that
// have no events-table row behind them at all (space_bookings.event_id IS
// NULL -- see components/MySpaceBookings.js's own comment on why those two
// cases are handled separately throughout this app).
//
// Deliberately minimal fields -- no `booked_by`/`notes` -- this is a bare,
// read-only view for whoever the booking's owner chooses to share the link
// with, not a way to look someone else's private reservation up by guessing
// an id (the id is a UUID, not sequential/guessable, matching the rest of
// this table's own access model).
export const dynamic = "force-dynamic"

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: booking, error } = await supabaseAdmin
    .from('space_bookings')
    .select('id, title, purpose, starts_at, ends_at, status, event_id, locations(name)')
    .eq('id', id)
    .is('event_id', null) // shared/joinable bookings are real events -- see above
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!booking || booking.status === 'cancelled') {
    return NextResponse.json({ available: false, reason: !booking ? 'not_found' : 'cancelled' })
  }

  return NextResponse.json({
    available: true,
    booking: {
      id: booking.id,
      title: booking.title || 'Space booking',
      starts_at: booking.starts_at,
      ends_at: booking.ends_at,
      location: booking.locations?.name || null,
    },
  })
}
