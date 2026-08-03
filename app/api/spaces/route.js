import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'
import { notify } from '@/lib/notify'
import { isOverlapError, overlapMessage } from '@/lib/spaces'
import {
  listAvailableLocations, checkSpaceAvailability, validateSpaceBooking,
  toSpaceBookingWindow, BOOKING_REASON_MAX,
} from '@/lib/spaceBookings'

// Personal Space Booking. Scope: Social_Hive_Personal_Space_Booking_Scope.md
// (decisions locked 2026-08-01). Any resident can book a common-area space
// for their own use, independent of any hub or club, subject to the same
// space-use rules as a standard event.
//
// force-dynamic + the shared no-store supabaseAdmin keep every GET reading
// LIVE data -- see lib/supabaseAdmin.js for why that matters (the calendar/
// cron staleness bug class).
export const dynamic = "force-dynamic"

async function getMember(token) {
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: member } = await supabaseAdmin
    .from('members').select('id, name, is_admin').eq('auth_id', user.id).single()
  return member
}

// ── GET ──────────────────────────────────────────────────────────────────
// Three modes, dispatched by query params (same one-file-many-modes shape
// screenings/route.js and social/route.js already use):
//
//   ?event_date=&event_time=&event_end_time=
//     -> { locations: [{id, name, available, reason}] } -- the positive
//        filter behind the booking form's date/time-FIRST flow.
//
//   ?mine=1
//     -> the caller's own space bookings (any status), for a "My Space
//        Bookings" list with cancel.
//
//   ?calendar_from=&calendar_to=
//     -> every CONFIRMED space booking in that date range, for the Calendar
//        display. Reason (`title`) and who booked it are stripped for any
//        row the caller doesn't own and isn't admin on -- the slot itself
//        stays visible (Iain, 2026-08-01: filtering by availability answers
//        the "can residents see what's booked" question), the private
//        reason does not, matching the app's existing attendee-privacy
//        convention (booking_cancelled/attendee-list masking elsewhere).
//
//   ?admin=1  (admin only)
//     -> every space booking, all statuses, full detail -- Admin's overrule/
//        cancel/challenge view (Iain, 2026-08-01).
export async function GET(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)

  // Mode 1: availability filter
  const event_date = searchParams.get('event_date')
  const event_time = searchParams.get('event_time')
  const event_end_time = searchParams.get('event_end_time')
  if (event_date && event_time && event_end_time) {
    const window = toSpaceBookingWindow(event_date, event_time, event_end_time)
    if (!window) return NextResponse.json({ error: 'Invalid date or time' }, { status: 400 })
    try {
      const locations = await listAvailableLocations(supabaseAdmin, {
        event_date, event_time, event_end_time, starts_at: window.starts_at, ends_at: window.ends_at,
      })
      return NextResponse.json({ locations })
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  // Mode 4: admin list -- every personal space booking AND every event that
  // has claimed a room, combined, so Admin can see total room usage in one
  // place rather than needing to check each hub separately (Iain, 2026-08-04:
  // "an admin space to see all space bookings, both events and resident
  // personal space bookings"). Optional ?location_id= narrows both halves to
  // one room. Event rows are read-only here -- cancelling/editing an event's
  // room stays in that event's own hub, this view is for visibility only.
  if (searchParams.get('admin') === '1') {
    if (!member.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    const locationFilter = searchParams.get('location_id')

    let bookingsQ = supabaseAdmin
      .from('space_bookings')
      .select('id, location_id, starts_at, ends_at, title, purpose, status, booked_by, booked_by_name_at_time, created_at, locations(name)')
      .is('event_id', null) // admin view is for PERSONAL/hold/maintenance rows; event-backed rows come from `events` below instead
    if (locationFilter) bookingsQ = bookingsQ.eq('location_id', locationFilter)
    const { data: bookings, error: bookingsErr } = await bookingsQ.order('starts_at', { ascending: true })
    if (bookingsErr) return NextResponse.json({ error: bookingsErr.message }, { status: 500 })

    let eventsQ = supabaseAdmin
      .from('events')
      .select('id, title, hub_type, event_date, event_time, event_end_time, location_id, archived, locations(name)')
      .not('location_id', 'is', null)
      .eq('archived', false)
    if (locationFilter) eventsQ = eventsQ.eq('location_id', locationFilter)
    const { data: events, error: eventsErr } = await eventsQ.order('event_date', { ascending: true })
    if (eventsErr) return NextResponse.json({ error: eventsErr.message }, { status: 500 })

    return NextResponse.json({ bookings: bookings || [], events: events || [] })
  }

  // Mode 2: my bookings
  if (searchParams.get('mine') === '1') {
    const { data, error } = await supabaseAdmin
      .from('space_bookings')
      .select('id, location_id, starts_at, ends_at, title, purpose, status, created_at, locations(name)')
      .eq('booked_by', member.id)
      .eq('purpose', 'private')
      .order('starts_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ bookings: data || [] })
  }

  // Mode 3: calendar range
  const calendar_from = searchParams.get('calendar_from')
  const calendar_to = searchParams.get('calendar_to')
  if (calendar_from && calendar_to) {
    const { data, error } = await supabaseAdmin
      .from('space_bookings')
      .select('id, location_id, starts_at, ends_at, title, purpose, booked_by, locations(name)')
      .eq('status', 'confirmed')
      .is('event_id', null) // event-backed rows already appear on the Calendar as their event; don't double-list them
      .gte('starts_at', calendar_from)
      .lt('starts_at', calendar_to)
      .order('starts_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const bookings = (data || []).map((b) => {
      const isOwn = b.booked_by === member.id
      const canSeeReason = isOwn || member.is_admin
      return {
        id: b.id, location_id: b.location_id, location_name: b.locations?.name || null,
        starts_at: b.starts_at, ends_at: b.ends_at, purpose: b.purpose,
        isOwn,
        title: canSeeReason ? b.title : null, // the private reason -- never shown to another resident
      }
    })
    return NextResponse.json({ bookings })
  }

  return NextResponse.json({ error: 'event_date/event_time/event_end_time, mine=1, calendar_from/calendar_to, or admin=1 required' }, { status: 400 })
}

// ── POST ─────────────────────────────────────────────────────────────────
// Create a booking. NEVER trusts the client's already-filtered location list
// -- re-validates and re-checks availability from scratch, exactly the same
// way every event-creation route in this app re-checks on submit rather than
// trusting whatever the picker showed.
export async function POST(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { location_id, event_date, event_time, event_end_time, reason } = await req.json()

  const validationError = validateSpaceBooking({ location_id, event_date, event_time, event_end_time, reason })
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  const { data: location, error: locError } = await supabaseAdmin
    .from('locations').select('id, name, bookable, booking_status, closed_from, closed_to, closed_reason, archived')
    .eq('id', location_id).maybeSingle()
  if (locError) return NextResponse.json({ error: locError.message }, { status: 500 })
  if (!location || location.archived) return NextResponse.json({ error: 'That space no longer exists' }, { status: 404 })

  const window = toSpaceBookingWindow(event_date, event_time, event_end_time)
  if (!window) return NextResponse.json({ error: 'Invalid date or time' }, { status: 400 })

  const check = await checkSpaceAvailability(supabaseAdmin, {
    location, event_date, event_time, event_end_time, starts_at: window.starts_at, ends_at: window.ends_at,
  })
  if (!check.available) return NextResponse.json({ error: check.reason }, { status: 409 })

  const { data: created, error: insertError } = await supabaseAdmin
    .from('space_bookings')
    .insert({
      location_id, event_id: null, starts_at: window.starts_at, ends_at: window.ends_at,
      purpose: 'private', title: reason.trim(), status: 'confirmed',
      booked_by: member.id, booked_by_name_at_time: member.name,
    })
    .select().single()

  if (insertError) {
    // Belt-and-braces: the pre-check above already ran, but a concurrent
    // request could theoretically win the race between check and insert.
    // The database EXCLUDE constraint is the actual guarantee here (migration
    // 072) -- this just turns its raw error into the same friendly wording
    // every other space-booking surface uses, rather than a Postgres error
    // reaching the resident.
    if (isOverlapError(insertError)) {
      return NextResponse.json({ error: overlapMessage(location.name) }, { status: 409 })
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json(created)
}

// ── DELETE ───────────────────────────────────────────────────────────────
// Cancel a booking. Own booking -> no notification (self-action, same
// convention as bookings/route.js's self-cancel). Admin cancelling someone
// else's -> notify the resident (Iain, 2026-08-01: "Admin needs an admin
// view so they can overrule, cancel or challenge a booking of any space").
export async function DELETE(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id, admin_reason } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: booking, error: fetchError } = await supabaseAdmin
    .from('space_bookings').select('id, booked_by, title, status, location_id, locations(name)')
    .eq('id', id).maybeSingle()
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.status === 'cancelled') return NextResponse.json({ ok: true, already: true })

  const isOwn = booking.booked_by === member.id
  if (!isOwn && !member.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error: updateError } = await supabaseAdmin
    .from('space_bookings').update({ status: 'cancelled' }).eq('id', id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  if (!isOwn) {
    const locName = booking.locations?.name || 'A space'
    const reasonSuffix = admin_reason ? ` (${admin_reason})` : ''
    await notify(
      booking.booked_by, null, 'space_booking_cancelled',
      `Your booking for ${locName} has been cancelled by an admin${reasonSuffix}.`,
      '/home', member.id,
    )
  }

  return NextResponse.json({ ok: true })
}
