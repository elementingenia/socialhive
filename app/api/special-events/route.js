import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'
import { notifyEventAttendees } from '@/lib/notifyEventAttendees'
import { notifyAllActiveMembers } from '@/lib/notifyAudience'
import { checkCancelPaymentGuard } from '@/lib/eventCancelGuard'
import { needsSpaceValidation, fetchLocation } from '@/lib/eventClash'
import { findAnyRoomConflict } from '@/lib/spaceBookings'
import { notifyRequestOnlySpace } from '@/lib/notifyRequestOnlySpace'
import { requireAdminOrAreaOwner, requireEventManage } from '@/lib/areaAuth'

// Special Events hub -- Iain, 2026-09-04: "Same design as Social. No Owner
// is needed." This route is social/route.js's exact shape, hub_type
// 'special' instead of 'social', plus the new allow_unassigned_seats /
// unassigned_seats_count fields (the "add seats without associating to a
// resident" feature). Deliberately NOT added to
// app/api/hub-settings/route.js's HUB_TYPE_TO_OWNER_KEY map, and 'special'
// will never have a space_owners row -- so requireAdminOrAreaOwner/
// requireEventManage below degrade to admin-only (create) and
// admin-or-this-event's-EC (manage) automatically, with zero new auth code.
// See supabase/migrations/094_special_events_hub.sql for the full rationale.

async function writeCoordinators(eventId, coordinatorIds, actorId) {
  await supabaseAdmin
    .from('event_coordinators')
    .update({ replaced_at: new Date().toISOString(), replaced_by: actorId })
    .eq('event_id', eventId)
    .is('replaced_at', null)

  if (coordinatorIds?.length) {
    const rows = coordinatorIds.map(mid => ({
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
    show_attendee_names, is_public, has_bus, bus_driver_id, bus_max_seats,
    location_type, location, location_id, has_dining, menu_type, menu_text, reservation_cutoff, payment_due_by, allow_nonresident_guests,
    require_attendee_names, allow_unassigned_seats, unassigned_seats_count,
  } = body

  const diningOn = !!has_dining
  const menuTypeValue = diningOn && ['text', 'file'].includes(menu_type) ? menu_type : null
  const unassignedOn = !!allow_unassigned_seats

  return {
    ...(isInsert ? { hub_type: 'special', archived: false } : {}),
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
    bus_max_seats:         (has_bus && bus_max_seats != null && bus_max_seats !== '') ? Number(bus_max_seats) : null,
    location_type:         location_type || 'onsite',
    location_id:           location_id || null,
    location:              location || null,
    has_dining:            diningOn,
    menu_type:             menuTypeValue,
    menu_text:             menuTypeValue === 'text' ? (menu_text || null) : null,
    // "Add seats without associating a seat to a resident" (Iain,
    // 2026-09-04): a raw headcount bump on the event itself, no booking
    // row, no member_id/contact_id. Only ever meaningful when the toggle is
    // on -- switching it off zeroes the count rather than leaving a stale
    // number an EC might forget is still being subtracted from capacity.
    allow_unassigned_seats: unassignedOn,
    unassigned_seats_count: unassignedOn ? Math.max(0, Number(unassigned_seats_count) || 0) : 0,
  }
}

async function validateSpace(payload, excludeEventId, viewerId, canManage) {
  if (payload.location_type !== 'onsite') return { location_id: null }

  const loc = await fetchLocation(supabaseAdmin, payload.location_id)
  if (!loc) return { error: 'Choose a venue for this on-site event', status: 400 }

  if (!needsSpaceValidation({ location_type: payload.location_type, bookable: loc.bookable }))
    return { location_id: loc.id, location: loc.name, request_only: !!loc.request_only }

  if (!payload.event_end_time) return { error: 'An end time is required for events in a common space', status: 400 }
  const conflict = await findAnyRoomConflict(supabaseAdmin, {
    location_id: loc.id, event_date: payload.event_date, event_time: payload.event_time,
    event_end_time: payload.event_end_time, exclude_event_id: excludeEventId, locationName: loc.name,
    viewerId, canManage,
  })
  if (conflict) return { error: conflict.message, status: 409 }
  return { location_id: loc.id, location: loc.name, request_only: !!loc.request_only }
}

export async function POST(req) {
  // Admin only -- 'special' has no Owner, per Iain's explicit "No Owner is
  // needed". requireAdminOrAreaOwner still degrades correctly with zero
  // space_owners rows for this context_key; kept for consistency with
  // every other hub's create route rather than a bespoke admin-only check.
  const { error: authErr, status: authStatus, member } = await requireAdminOrAreaOwner(req, 'hub', 'special')
  if (authErr) return NextResponse.json({ error: authErr }, { status: authStatus })

  const body = await req.json()
  if (!body.title?.trim() || !body.event_date)
    return NextResponse.json({ error: 'Title and date are required' }, { status: 400 })
  if (!body.coordinator_ids?.length)
    return NextResponse.json({ error: 'At least one Event Coordinator is required' }, { status: 400 })

  const payload = buildEventPayload(body, true)
  const space = await validateSpace(payload, undefined, member.id, !!member.is_admin)
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

  if (space.request_only) {
    await notifyRequestOnlySpace({
      actingMemberId: member.id, eventId: event.id, eventTitle: body.title.trim(),
      eventDate: body.event_date, locationName: space.location,
    })
  }

  const when = body.event_date ? new Date(body.event_date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) : ""
  await notifyAllActiveMembers(supabaseAdmin, event.id, "event_added",
    `New Special Event: ${body.title.trim()}${when ? ` — ${when}` : ""}`, { excludeMemberId: member.id })

  return NextResponse.json({ ok: true, id: event.id })
}

export async function PATCH(req) {
  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Admin OR this event's own EC (lib/areaAuth.js) -- never an Owner, since
  // 'special' has none and isAreaOwner() can never find a matching row.
  const { error: authErr, status: authStatus, member } = await requireEventManage(req, body.id)
  if (authErr) return NextResponse.json({ error: authErr }, { status: authStatus })

  if (body.action === 'cancel') {
    const { data: ev } = await supabaseAdmin
      .from('events').select('title, archived').eq('id', body.id).eq('hub_type', 'special').maybeSingle()
    if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    if (ev.archived) return NextResponse.json({ ok: true, already: true })
    const guardMsg = await checkCancelPaymentGuard(supabaseAdmin, body.id)
    if (guardMsg) return NextResponse.json({ error: guardMsg }, { status: 409 })
    const { error } = await supabaseAdmin.from('events').update({ archived: true }).eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await notifyEventAttendees(supabaseAdmin, body.id, 'event_cancelled',
      `${ev.title || 'A Special Event you booked'} has been cancelled.`)
    return NextResponse.json({ ok: true })
  }

  if (!body.title?.trim() || !body.event_date)
    return NextResponse.json({ error: 'Title and date are required' }, { status: 400 })
  if (!body.coordinator_ids?.length)
    return NextResponse.json({ error: 'At least one Event Coordinator is required' }, { status: 400 })

  const payload = buildEventPayload(body)
  const space = await validateSpace(payload, body.id, member.id, !!member.is_admin)
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
