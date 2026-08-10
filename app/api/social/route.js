import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'
import { notifyEventAttendees } from '@/lib/notifyEventAttendees'
import { notifyAllActiveMembers } from '@/lib/notifyAudience'
import { checkCancelPaymentGuard } from '@/lib/eventCancelGuard'
import { needsSpaceValidation, fetchLocation } from '@/lib/eventClash'
import { findAnyRoomConflict } from '@/lib/spaceBookings'
import { notifyRequestOnlySpace } from '@/lib/notifyRequestOnlySpace'
import { requireAdminOrAreaOwner, requireEventManage } from '@/lib/areaAuth'



async function writeCoordinators(eventId, coordinatorIds, actorId) {
  await supabaseAdmin
    .from('event_coordinators')
    .update({ replaced_at: new Date().toISOString(), replaced_by: actorId })
    .eq('event_id', eventId)
    .is('replaced_at', null)

  if (coordinatorIds?.length) {
    const rows = coordinatorIds.slice(0, 3).map(mid => ({
      event_id: eventId,
      member_id: mid,
      assigned_by: actorId,
    }))
    await supabaseAdmin.from('event_coordinators').insert(rows)
  }
}

function buildEventPayload(body, isInsert = false) {
  const {
    title, event_date, event_time, event_end_time, description, welcome_message,
    max_seats, max_seats_per_booking, cost, payment_required,
    show_attendee_names, is_public, has_bus, bus_driver_id,
    location_type, location, location_id, has_dining, menu_type, menu_text, reservation_cutoff, payment_due_by, allow_nonresident_guests,
    require_attendee_names,
  } = body

  const diningOn = !!has_dining
  const menuTypeValue = diningOn && ['text', 'file'].includes(menu_type) ? menu_type : null

  return {
    ...(isInsert ? { hub_type: 'social', archived: false } : {}),
    title:                title.trim(),
    event_date,
    event_time:            event_time        || null,
    event_end_time:        event_end_time    || null,
    description:           description       || null,
    welcome_message:       welcome_message   || null,
    max_seats:             Number(max_seats)              || 20,
    max_seats_per_booking: Number(max_seats_per_booking)  || 2,
    cost:                  payment_required ? (Number(cost) || 0) : 0,
    payment_required:      !!payment_required,
    reservation_cutoff:    reservation_cutoff || null,
    payment_due_by:        payment_required ? (payment_due_by || null) : null,
    allow_nonresident_guests: !!allow_nonresident_guests,
    require_attendee_names:  !!require_attendee_names,
    show_attendee_names:   show_attendee_names !== false,
    is_public:             is_public !== false,
    has_bus:               !!has_bus,
    bus_driver_id:         (has_bus && bus_driver_id) ? bus_driver_id : null,
    location_type:         location_type || 'onsite',
    // For onsite events both of these are overwritten by validateSpace() from
    // the locations row — location_id is authoritative, location is its display
    // copy. For offsite, `location` is deliberate free text and location_id null.
    location_id:           location_id || null,
    location:              location || null,
    has_dining:            diningOn,
    menu_type:             menuTypeValue,
    // Only overwrite menu_text for the 'text' path — switching to 'file' (or off)
    // leaves any previously-uploaded menu_url alone; the file upload endpoint
    // owns clearing/replacing that column.
    menu_text:             menuTypeValue === 'text' ? (menu_text || null) : null,
  }
}

// Event Clash / Space Booking (2026-07-23; reworked 2026-07-31).
// The ID is the truth and the NAME is derived from it — the reverse of the
// original design, which looked the id up from the name on every save and so
// wrote location_id = NULL the first time an event was edited after its room was
// renamed. Returns { location_id, location } to stamp onto the row, or
// { error, status }. An empty object means "not applicable" (off-site).
async function validateSpace(payload, excludeEventId) {
  if (payload.location_type !== 'onsite') return { location_id: null }

  const loc = await fetchLocation(supabaseAdmin, payload.location_id)
  if (!loc) return { error: 'Choose a venue for this on-site event', status: 400 }

  // events.location is only a display copy now; always take it from the row so
  // it can never disagree with the room it points at.
  if (!needsSpaceValidation({ location_type: payload.location_type, bookable: loc.bookable }))
    return { location_id: loc.id, location: loc.name, request_only: !!loc.request_only }

  if (!payload.event_end_time) return { error: 'An end time is required for events in a common space', status: 400 }
  const conflict = await findAnyRoomConflict(supabaseAdmin, {
    location_id: loc.id, event_date: payload.event_date, event_time: payload.event_time,
    event_end_time: payload.event_end_time, exclude_event_id: excludeEventId, locationName: loc.name,
  })
  if (conflict) return { error: conflict.message, status: 409 }
  return { location_id: loc.id, location: loc.name, request_only: !!loc.request_only }
}

export async function POST(req) {
  // Admin, or Social's Owner (area-wide -- Iain, 2026-08-10; see lib/areaAuth.js).
  const { error: authErr, status: authStatus, member } = await requireAdminOrAreaOwner(req, 'hub', 'social')
  if (authErr) return NextResponse.json({ error: authErr }, { status: authStatus })

  const body = await req.json()
  if (!body.title?.trim() || !body.event_date)
    return NextResponse.json({ error: 'Title and date are required' }, { status: 400 })
  if (!body.coordinator_ids?.length)
    return NextResponse.json({ error: 'At least one Event Coordinator is required' }, { status: 400 })

  const payload = buildEventPayload(body, true)
  const space = await validateSpace(payload)
  if (space.error) return NextResponse.json({ error: space.error }, { status: space.status })
  payload.location_id = space.location_id || null
  if (space.location) payload.location = space.location

  const { data: event, error } = await supabaseAdmin
    .from('events')
    .insert(payload)
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeCoordinators(event.id, body.coordinator_ids, member.id)

  // "Request Only" (Iain, 2026-08-04): Admin is trusted to have already
  // talked to Ingenia, but gets a reminder to actually go validate it.
  if (space.request_only) {
    await notifyRequestOnlySpace({
      actingMemberId: member.id, eventId: event.id, eventTitle: body.title.trim(),
      eventDate: body.event_date, locationName: space.location,
    })
  }

  // Social is community-wide: every active member is told about a new event
  // (Iain 2026-07-18). Amendments still notify only attendees (see PATCH).
  const when = body.event_date ? new Date(body.event_date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) : ""
  await notifyAllActiveMembers(supabaseAdmin, event.id, "event_added",
    `New Social event: ${body.title.trim()}${when ? ` — ${when}` : ""}`, { excludeMemberId: member.id })

  return NextResponse.json({ ok: true, id: event.id })
}

export async function PATCH(req) {
  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Admin, Social's Owner (area-wide), or this event's own EC (Iain,
  // 2026-08-10; see lib/areaAuth.js) -- covers both the edit path below and
  // the cancel action, which previously required admin only.
  const { error: authErr, status: authStatus, member } = await requireEventManage(req, body.id)
  if (authErr) return NextResponse.json({ error: authErr }, { status: authStatus })

  // Cancel Event -- same soft-archive-and-notify pattern as Movies
  // (app/api/screenings/route.js DELETE) and Clubs & Groups (app/api/series.js
  // PATCH cancel_occurrence). Deliberately never a hard delete: it would
  // cascade away booking/payment history. A dedicated action, bypassing the
  // full edit validation below, since a cancel request carries only {id, action}.
  if (body.action === 'cancel') {
    const { data: ev } = await supabaseAdmin
      .from('events').select('title, archived').eq('id', body.id).eq('hub_type', 'social').maybeSingle()
    if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    if (ev.archived) return NextResponse.json({ ok: true, already: true }) // idempotent
    const guardMsg = await checkCancelPaymentGuard(supabaseAdmin, body.id)
    if (guardMsg) return NextResponse.json({ error: guardMsg }, { status: 409 })
    const { error } = await supabaseAdmin.from('events').update({ archived: true }).eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await notifyEventAttendees(supabaseAdmin, body.id, 'event_cancelled',
      `${ev.title || 'A Social event you booked'} has been cancelled.`)
    return NextResponse.json({ ok: true })
  }

  if (!body.title?.trim() || !body.event_date)
    return NextResponse.json({ error: 'Title and date are required' }, { status: 400 })
  if (!body.coordinator_ids?.length)
    return NextResponse.json({ error: 'At least one Event Coordinator is required' }, { status: 400 })

  const payload = buildEventPayload(body)
  const space = await validateSpace(payload, body.id)
  if (space.error) return NextResponse.json({ error: space.error }, { status: space.status })
  payload.location_id = space.location_id || null
  if (space.location) payload.location = space.location

  const { data: before } = await supabaseAdmin
    .from('events').select('event_date, event_time, location, location_id').eq('id', body.id).single()

  const { error } = await supabaseAdmin
    .from('events')
    .update(payload)
    .eq('id', body.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeCoordinators(body.id, body.coordinator_ids, member.id)

  // "Request Only" (Iain, 2026-08-04): only nudge when the room actually
  // changed onto a Request Only venue -- not on every unrelated edit.
  if (space.request_only && before?.location_id !== payload.location_id) {
    await notifyRequestOnlySpace({
      actingMemberId: member.id, eventId: body.id, eventTitle: body.title.trim(),
      eventDate: body.event_date, locationName: space.location,
    })
  }

  const dateChanged = before && (
    before.event_date !== body.event_date ||
    before.event_time !== (body.event_time || null) ||
    before.location !== (body.location || null)
  )
  if (dateChanged) {
    await notifyEventAttendees(supabaseAdmin, body.id, 'event_updated',
      `${body.title} has been updated — check the new date, time or location.`,
      { excludeMemberId: member.id })
  }

  return NextResponse.json({ ok: true })
}
