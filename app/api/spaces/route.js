import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'
import { notify } from '@/lib/notify'
import { isOverlapError, overlapMessage, toInstant, sydneyOffsetMinutes } from '@/lib/spaces'
import { sydneyTodayStr } from '@/lib/date'
import {
  listAvailableLocations, checkSpaceAvailability, validateSpaceBooking,
  toSpaceBookingWindow, BOOKING_REASON_MAX, validateIngeniaConfirmation,
  promoteSpaceBookingToEvent, updateSpaceEvent,
} from '@/lib/spaceBookings'
import { notifyEventAttendees } from '@/lib/notifyEventAttendees'
import { resolveMemberName } from '@/lib/memberName'

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
  //
  // ?exclude_booking_id= (Iain, 2026-08-17, editing a booking): when the
  // resident is re-checking availability for a booking they're editing, its
  // own existing row must not show up as blocking itself.
  const event_date = searchParams.get('event_date')
  const event_time = searchParams.get('event_time')
  const event_end_time = searchParams.get('event_end_time')
  const excludeBookingId = searchParams.get('exclude_booking_id')
  if (event_date && event_time && event_end_time) {
    const window = toSpaceBookingWindow(event_date, event_time, event_end_time)
    if (!window) return NextResponse.json({ error: 'Invalid date or time' }, { status: 400 })
    try {
      const locations = await listAvailableLocations(supabaseAdmin, {
        event_date, event_time, event_end_time, starts_at: window.starts_at, ends_at: window.ends_at,
        exclude_booking_id: excludeBookingId || undefined,
        viewerId: member.id, canManage: !!member.is_admin,
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
    // Optional Sydney-local date range (Iain, 2026-08-04: "Date needs to be
    // a range From and To"). events.event_date is already a plain Sydney
    // date so it filters directly; space_bookings.starts_at is a real
    // instant, so the Sydney day boundaries are converted to instants with
    // the same DST-aware helpers lib/spaces.js already uses elsewhere,
    // rather than a loose UTC buffer that could over/under-match near
    // midnight on a DST-change day.
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')

    let bookingsQ = supabaseAdmin
      .from('space_bookings')
      .select('id, location_id, starts_at, ends_at, title, purpose, status, booked_by, booked_by_name_at_time, created_at, locations(name)')
      .is('event_id', null) // admin view is for PERSONAL/hold/maintenance rows; event-backed rows come from `events` below instead
    if (locationFilter) bookingsQ = bookingsQ.eq('location_id', locationFilter)
    if (dateFrom) bookingsQ = bookingsQ.gte('starts_at', toInstant(dateFrom, '00:00', sydneyOffsetMinutes(dateFrom)).toISOString())
    if (dateTo) bookingsQ = bookingsQ.lte('starts_at', toInstant(dateTo, '23:59', sydneyOffsetMinutes(dateTo)).toISOString())
    const { data: bookings, error: bookingsErr } = await bookingsQ.order('starts_at', { ascending: true })
    if (bookingsErr) return NextResponse.json({ error: bookingsErr.message }, { status: 500 })

    let eventsQ = supabaseAdmin
      .from('events')
      .select('id, title, hub_type, event_date, event_time, event_end_time, location_id, archived, locations(name)')
      .not('location_id', 'is', null)
      .eq('archived', false)
    if (locationFilter) eventsQ = eventsQ.eq('location_id', locationFilter)
    if (dateFrom) eventsQ = eventsQ.gte('event_date', dateFrom)
    if (dateTo) eventsQ = eventsQ.lte('event_date', dateTo)
    const { data: events, error: eventsErr } = await eventsQ.order('event_date', { ascending: true })
    if (eventsErr) return NextResponse.json({ error: eventsErr.message }, { status: 500 })

    return NextResponse.json({ bookings: bookings || [], events: events || [] })
  }

  // Mode 2: my bookings
  //
  // Iain, 2026-08-17 (live-fire find): this had no expiry filter at all --
  // a booking from over a week ago was still showing in "My Space Bookings"
  // with an active Cancel button. ends_at is always set for a personal
  // booking (unlike events, which can lack an end time -- see eventClash.js),
  // so filtering on it here is safe. A finished booking simply drops off the
  // list once its window has passed, same as the app's other "past" cutoffs.
  //
  // Iain, 2026-08-22 (second live review): "My Space Bookings" was ONLY ever
  // private (purpose='private') space_bookings rows -- the moment a booking
  // was promoted via "Allow others to join" it vanished from here entirely,
  // and joining someone ELSE'S shared space event was never reflected here
  // at all. Iain's rule, matching every other hub's own "My Bookings" (Show
  // Time Home etc): a resident should see EVERY space booking they hold, own
  // gathering or someone else's, private or shared, in one place. This mode
  // now also returns `event_bookings` -- the caller's own active bookings on
  // any hub_type='space' event, private-vs-shared told apart client-side by
  // shape (a space_bookings row vs an event_bookings entry), not by this
  // still-private-only `bookings` array changing meaning.
  if (searchParams.get('mine') === '1') {
    const { data, error } = await supabaseAdmin
      .from('space_bookings')
      .select('id, location_id, starts_at, ends_at, title, purpose, status, created_at, ingenia_confirmed, ingenia_confirmed_by, locations(name, request_only)')
      .eq('booked_by', member.id)
      .eq('purpose', 'private')
      .gte('ends_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const todayStr = sydneyTodayStr()
    const { data: myEventBookings, error: mebErr } = await supabaseAdmin
      .from('bookings')
      .select('id, status, seats, event_id, events!inner(id, title, event_date, event_time, event_end_time, description, location, location_type, max_seats, max_seats_per_booking, allow_nonresident_guests, require_attendee_names, location_id, archived, hub_type, locations(name), event_coordinators(member_id, replaced_at, members!event_coordinators_member_id_fkey(name, username)), has_bus, bus_driver:members!bus_driver_id(name, username))')
      .eq('member_id', member.id)
      .neq('status', 'cancelled')
      .eq('events.hub_type', 'space')
      .eq('events.archived', false)
      .gte('events.event_date', todayStr)
    if (mebErr) return NextResponse.json({ error: mebErr.message }, { status: 500 })

    // Fetch every OTHER attendee's booking on these same events too, purely
    // to compute "X/Y booked" the same way SharedSpaceEventRow does
    // elsewhere -- a second, narrow query rather than a self-referential
    // `bookings -> events -> bookings` embed, which Supabase can't resolve
    // unambiguously (the outer table and the nested one are both `bookings`).
    const eventIds = [...new Set((myEventBookings || []).map(b => b.event_id))]
    let bookingsByEvent = {}
    if (eventIds.length) {
      const { data: allBookings, error: allErr } = await supabaseAdmin
        .from('bookings')
        .select('id, event_id, status, seats')
        .in('event_id', eventIds)
      if (allErr) return NextResponse.json({ error: allErr.message }, { status: 500 })
      for (const b of (allBookings || [])) {
        (bookingsByEvent[b.event_id] ||= []).push({ id: b.id, status: b.status, seats: b.seats })
      }
    }

    const event_bookings = (myEventBookings || []).map(b => {
      const coords = (b.events.event_coordinators || []).filter(c => !c.replaced_at)
      return {
        id: b.id, status: b.status, seats: b.seats,
        isCoordinator: coords.some(c => c.member_id === member.id),
        event: {
          id: b.events.id, title: b.events.title, event_date: b.events.event_date, event_time: b.events.event_time,
          event_end_time: b.events.event_end_time, description: b.events.description,
          location: b.events.location, location_type: b.events.location_type,
          max_seats: b.events.max_seats, max_seats_per_booking: b.events.max_seats_per_booking,
          allow_nonresident_guests: b.events.allow_nonresident_guests, require_attendee_names: b.events.require_attendee_names,
          location_id: b.events.location_id, locations: b.events.locations,
          has_bus: b.events.has_bus, bus_driver: b.events.bus_driver,
          coordinators: coords.map(c => c.members).filter(Boolean),
          bookings: bookingsByEvent[b.event_id] || [],
        },
      }
    }).sort((a, c) => `${a.event.event_date}T${a.event.event_time || '00:00'}`.localeCompare(`${c.event.event_date}T${c.event.event_time || '00:00'}`))

    return NextResponse.json({ bookings: data || [], event_bookings })
  }

  // Mode 3: calendar range -- also doubles as the Location-First Booking
  // schedule read when ?location_id= is passed (Social_Hive_Location_First_
  // Booking_Scope_v2.md, item 5/technical shape: reuse this mode rather than
  // a new endpoint, since it already has the closest shape and had no
  // existing frontend consumer to preserve compatibility with).
  //
  // Iain, 2026-08-17 (scope v2 item 5): personal bookings are NO LONGER
  // anonymised here. Who booked it and why now follow the exact same
  // Display Name / Real Name rule as every Attendees list (resolveMemberName,
  // lib/memberName.js) -- this supersedes the 2026-08-01 "reason stripped
  // unless own/admin" behaviour.
  const calendar_from = searchParams.get('calendar_from')
  const calendar_to = searchParams.get('calendar_to')
  if (calendar_from && calendar_to) {
    const locationFilter = searchParams.get('location_id')

    let q = supabaseAdmin
      .from('space_bookings')
      .select('id, location_id, starts_at, ends_at, title, purpose, booked_by, locations(name), member:members!booked_by(id, name, display_name, hide_name)')
      .eq('status', 'confirmed')
      .is('event_id', null) // event-backed rows already appear on the Calendar as their event; don't double-list them
      .gte('starts_at', calendar_from)
      .lt('starts_at', calendar_to)
      .order('starts_at', { ascending: true })
    if (locationFilter) q = q.eq('location_id', locationFilter)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const bookings = (data || []).map((b) => {
      const isOwn = b.booked_by === member.id
      return {
        id: b.id, location_id: b.location_id, location_name: b.locations?.name || null,
        starts_at: b.starts_at, ends_at: b.ends_at, purpose: b.purpose,
        isOwn,
        title: b.title || null,
        booked_by_name: resolveMemberName(b.member, {
          viewerId: member.id, canManage: !!member.is_admin, selfLabel: 'You', fallback: 'a resident',
        }),
      }
    })

    // When scoped to one location, fold in EVERY hub's event booked there
    // (Show Time screenings etc, via events.location_id -- confirmed in
    // scope v2 to already exist app-wide) so the room's own schedule is
    // complete, matching admin's SpaceBookingsTab shape but resident-facing.
    //
    // Without a location filter, this is the Book a Space hub's OWN
    // Scheduled tab (Iain, 2026-08-22: "The Scheduled Page will include
    // all resident bookings, as the user can see their own bookings on
    // the home page") -- every resident's shared space, not just the
    // caller's. Scoped to hub_type='space' only, unlike the location-
    // scoped branch above: this is Book a Space's own list, not a
    // room-availability view, so a Show Time screening that happens to
    // use the same room has no business appearing here.
    let events = []
    if (locationFilter) {
      const { data: evData, error: evErr } = await supabaseAdmin
        .from('events')
        .select('id, title, hub_type, event_date, event_time, event_end_time, location_id')
        .eq('location_id', locationFilter)
        .eq('archived', false)
        .gte('event_date', calendar_from.slice(0, 10))
        .lte('event_date', calendar_to.slice(0, 10))
        .order('event_date', { ascending: true })
      if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 })
      events = evData || []
    } else {
      // Widened 2026-08-23 (Iain: /spaces/scheduled needs to "conform to
      // the system standard" -- the same full card every other hub's
      // Scheduled list uses: description, location, coordinator, bus,
      // and an attendees list) -- was previously the bare Home-tile-preview
      // field set. member/hide_name/display_name are pulled per booking so
      // attendee names can be resolved server-side below, respecting the
      // same masking convention as every other hub (canManage = admin or
      // this event's own coordinator).
      const { data: evData, error: evErr } = await supabaseAdmin
        .from('events')
        .select(`
          id, title, event_date, event_time, event_end_time, description,
          location, location_type, max_seats, has_bus, reservation_cutoff,
          location_id, locations(name),
          bus_driver:members!bus_driver_id(id, name, username, display_name, hide_name),
          event_coordinators(member_id, replaced_at, members!event_coordinators_member_id_fkey(id, name, username, display_name, hide_name)),
          bookings(id, status, seats, member_id, members(id, name, username, display_name, hide_name))
        `)
        .eq('hub_type', 'space')
        .eq('archived', false)
        .gte('event_date', calendar_from.slice(0, 10))
        .lte('event_date', calendar_to.slice(0, 10))
        .order('event_date', { ascending: true })
        .order('event_time', { ascending: true })
      if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 })

      events = (evData || []).map(ev => {
        const activeCoordinators = (ev.event_coordinators || []).filter(c => !c.replaced_at)
        const isCoordinator = activeCoordinators.some(c => c.member_id === member.id)
        const canManage = !!member.is_admin || isCoordinator
        const bookings = (ev.bookings || []).map(b => ({
          id: b.id, status: b.status, seats: b.seats, member_id: b.member_id,
          isOwn: b.member_id === member.id,
          display_name: resolveMemberName(b.members, {
            viewerId: member.id, canManage, selfLabel: 'You',
          }),
        }))
        return { ...ev, isCoordinator, bookings }
      })
    }

    return NextResponse.json({ bookings, events })
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

  const { location_id, event_date, event_time, event_end_time, reason, ingenia_confirmed, ingenia_confirmed_by } = await req.json()

  const validationError = validateSpaceBooking({ location_id, event_date, event_time, event_end_time, reason })
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  const { data: location, error: locError } = await supabaseAdmin
    .from('locations').select('id, name, bookable, booking_status, closed_from, closed_to, closed_reason, archived, request_only')
    .eq('id', location_id).maybeSingle()
  if (locError) return NextResponse.json({ error: locError.message }, { status: 500 })
  if (!location || location.archived) return NextResponse.json({ error: 'That space no longer exists' }, { status: 404 })

  // "Request Only" (Iain, 2026-08-04): personal use, so EVERY booker --
  // admin or not -- must self-declare Ingenia's sign-off before the
  // booking is even accepted. No admin exemption here (that only applies
  // to event creation, which is inherently community-based -- see
  // lib/notifyRequestOnlySpace.js).
  const ingeniaError = validateIngeniaConfirmation({
    requestOnly: location.request_only,
    ingeniaConfirmed: ingenia_confirmed, ingeniaConfirmedBy: ingenia_confirmed_by,
  })
  if (ingeniaError) return NextResponse.json({ error: ingeniaError }, { status: 400 })

  const window = toSpaceBookingWindow(event_date, event_time, event_end_time)
  if (!window) return NextResponse.json({ error: 'Invalid date or time' }, { status: 400 })

  const check = await checkSpaceAvailability(supabaseAdmin, {
    location, event_date, event_time, event_end_time, starts_at: window.starts_at, ends_at: window.ends_at,
    viewerId: member.id, canManage: !!member.is_admin,
  })
  if (!check.available) return NextResponse.json({ error: check.reason }, { status: 409 })

  const { data: created, error: insertError } = await supabaseAdmin
    .from('space_bookings')
    .insert({
      location_id, event_id: null, starts_at: window.starts_at, ends_at: window.ends_at,
      purpose: 'private', title: reason.trim(), status: 'confirmed',
      booked_by: member.id, booked_by_name_at_time: member.name,
      // The validation above already guarantees this is populated whenever
      // location.request_only is true, for every booker regardless of role.
      ingenia_confirmed: location.request_only ? !!ingenia_confirmed : false,
      ingenia_confirmed_by: location.request_only && ingenia_confirmed ? (ingenia_confirmed_by || '').trim() : null,
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

// ── PATCH ────────────────────────────────────────────────────────────────
// Edit an existing personal space booking (Iain, 2026-08-17: "My Space
// bookings need to be editable" -- previously Cancel was the only option,
// so changing a date/time/location meant cancelling and re-booking from
// scratch, losing the original if the new slot turned out unavailable).
//
// Owner only, same as the self-cancel path -- no admin-edits-anyone's-
// booking case here (Admin's own overrule/cancel/challenge view already
// covers admin intervention via DELETE's admin path). Re-validates and
// re-checks availability from scratch exactly like POST, with the booking's
// own row excluded from the conflict check via exclude_booking_id so it
// doesn't block itself when the window doesn't change (or only partially
// changes). A cancelled booking can't be edited back to life -- re-book
// instead, same as the rest of the app treats a cancelled row as terminal.
export async function PATCH(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()

  // ── "Allow others to join" -- promote a private booking to a shared event ──
  // Scope: Book_a_Space_Scope_v2.md / Book_a_Space_Technical_Design.md
  // (Iain, 2026-08-22). Any resident, no space_owners gate -- see
  // lib/areaAuth.js's requireResidentOrAdmin for why this hub is
  // deliberately narrower-but-open rather than reusing the Owner model
  // every other hub uses. Confirmed flippable after creation, not just at
  // booking time ("Yes can be flipped after the fact").
  if (body.action === 'promote_to_event') {
    const { id, title, max_seats, max_seats_per_booking, allow_nonresident_guests, require_attendee_names } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    try {
      const result = await promoteSpaceBookingToEvent(
        supabaseAdmin, id, member.id, !!member.is_admin,
        { title, max_seats, max_seats_per_booking, allow_nonresident_guests, require_attendee_names },
      )
      if (result.error) return NextResponse.json({ error: result.error }, { status: result.status })
      return NextResponse.json(result)
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  // ── Edit an already-shared space event ────────────────────────────────
  // Iain, 2026-08-23: "I cannot EDIT a space once booked, only cancel it...
  // there needs to be an Edit Pill than [that] enable[s] the creator/owner
  // of the booking to modify the details (which would trigger an alert to
  // any who have booked a seat in the event if invitees was open)."
  if (body.action === 'update_space_event') {
    const { id, title, max_seats, max_seats_per_booking, allow_nonresident_guests, require_attendee_names } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    try {
      const result = await updateSpaceEvent(
        supabaseAdmin, id, member.id, !!member.is_admin,
        { title, max_seats, max_seats_per_booking, allow_nonresident_guests, require_attendee_names },
      )
      if (result.error) return NextResponse.json({ error: result.error }, { status: result.status })
      if (result.changed) {
        await notifyEventAttendees(supabaseAdmin, id, 'event_updated',
          `${title.trim()} has been updated — check the details.`,
          { excludeMemberId: member.id })
      }
      return NextResponse.json(result)
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  const {
    id, location_id, event_date, event_time, event_end_time, reason,
    ingenia_confirmed, ingenia_confirmed_by,
  } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('space_bookings').select('id, booked_by, status, purpose')
    .eq('id', id).maybeSingle()
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (existing.purpose !== 'private') return NextResponse.json({ error: 'Only personal space bookings can be edited here' }, { status: 400 })
  if (existing.booked_by !== member.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (existing.status === 'cancelled') return NextResponse.json({ error: 'This booking has been cancelled -- make a new booking instead' }, { status: 409 })

  const validationError = validateSpaceBooking({ location_id, event_date, event_time, event_end_time, reason })
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  const { data: location, error: locError } = await supabaseAdmin
    .from('locations').select('id, name, bookable, booking_status, closed_from, closed_to, closed_reason, archived, request_only')
    .eq('id', location_id).maybeSingle()
  if (locError) return NextResponse.json({ error: locError.message }, { status: 500 })
  if (!location || location.archived) return NextResponse.json({ error: 'That space no longer exists' }, { status: 404 })

  const ingeniaError = validateIngeniaConfirmation({
    requestOnly: location.request_only,
    ingeniaConfirmed: ingenia_confirmed, ingeniaConfirmedBy: ingenia_confirmed_by,
  })
  if (ingeniaError) return NextResponse.json({ error: ingeniaError }, { status: 400 })

  const window = toSpaceBookingWindow(event_date, event_time, event_end_time)
  if (!window) return NextResponse.json({ error: 'Invalid date or time' }, { status: 400 })

  const check = await checkSpaceAvailability(supabaseAdmin, {
    location, event_date, event_time, event_end_time, starts_at: window.starts_at, ends_at: window.ends_at,
    exclude_booking_id: id, viewerId: member.id, canManage: !!member.is_admin,
  })
  if (!check.available) return NextResponse.json({ error: check.reason }, { status: 409 })

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('space_bookings')
    .update({
      location_id, starts_at: window.starts_at, ends_at: window.ends_at, title: reason.trim(),
      ingenia_confirmed: location.request_only ? !!ingenia_confirmed : false,
      ingenia_confirmed_by: location.request_only && ingenia_confirmed ? (ingenia_confirmed_by || '').trim() : null,
    })
    .eq('id', id)
    .select().single()

  if (updateError) {
    if (isOverlapError(updateError)) {
      return NextResponse.json({ error: overlapMessage(location.name) }, { status: 409 })
    }
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json(updated)
}
