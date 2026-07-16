import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyEventAttendees } from '@/lib/notifyEventAttendees'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function getAdminMember(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return null
  const { data } = await supabaseAdmin
    .from('members').select('id, is_admin').eq('auth_id', user.id).single()
  return data?.is_admin ? data : null
}

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
    title, event_date, event_time, description, welcome_message,
    max_seats, max_seats_per_booking, cost, payment_required,
    show_attendee_names, is_public, has_bus, bus_driver_id,
    location_type, location, has_dining, menu_type, menu_text, reservation_cutoff,
  } = body

  const diningOn = !!has_dining
  const menuTypeValue = diningOn && ['text', 'file'].includes(menu_type) ? menu_type : null

  return {
    ...(isInsert ? { hub_type: 'social', archived: false } : {}),
    title:                title.trim(),
    event_date,
    event_time:            event_time        || null,
    description:           description       || null,
    welcome_message:       welcome_message   || null,
    max_seats:             Number(max_seats)              || 20,
    max_seats_per_booking: Number(max_seats_per_booking)  || 2,
    cost:                  payment_required ? (Number(cost) || 0) : 0,
    payment_required:      !!payment_required,
    reservation_cutoff:    reservation_cutoff || null,
    show_attendee_names:   show_attendee_names !== false,
    is_public:             is_public !== false,
    has_bus:               !!has_bus,
    bus_driver_id:         (has_bus && bus_driver_id) ? bus_driver_id : null,
    location_type:         location_type || 'onsite',
    location:              location || null,
    has_dining:            diningOn,
    menu_type:             menuTypeValue,
    // Only overwrite menu_text for the 'text' path — switching to 'file' (or off)
    // leaves any previously-uploaded menu_url alone; the file upload endpoint
    // owns clearing/replacing that column.
    menu_text:             menuTypeValue === 'text' ? (menu_text || null) : null,
  }
}

export async function POST(req) {
  const member = await getAdminMember(req)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  if (!body.title?.trim() || !body.event_date)
    return NextResponse.json({ error: 'Title and date are required' }, { status: 400 })
  if (!body.coordinator_ids?.length)
    return NextResponse.json({ error: 'At least one Event Coordinator is required' }, { status: 400 })

  const { data: event, error } = await supabaseAdmin
    .from('events')
    .insert(buildEventPayload(body, true))
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeCoordinators(event.id, body.coordinator_ids, member.id)
  return NextResponse.json({ ok: true, id: event.id })
}

export async function PATCH(req) {
  const member = await getAdminMember(req)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (!body.title?.trim() || !body.event_date)
    return NextResponse.json({ error: 'Title and date are required' }, { status: 400 })
  if (!body.coordinator_ids?.length)
    return NextResponse.json({ error: 'At least one Event Coordinator is required' }, { status: 400 })

  const { data: before } = await supabaseAdmin
    .from('events').select('event_date, event_time, location').eq('id', body.id).single()

  const { error } = await supabaseAdmin
    .from('events')
    .update(buildEventPayload(body))
    .eq('id', body.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeCoordinators(body.id, body.coordinator_ids, member.id)

  const dateChanged = before && (
    before.event_date !== body.event_date ||
    before.event_time !== (body.event_time || null) ||
    before.location !== (body.location || null)
  )
  if (dateChanged) {
    await notifyEventAttendees(supabaseAdmin, body.id, 'event_updated',
      `${body.title} has been updated — check the new date, time or location.`)
  }

  return NextResponse.json({ ok: true })
}
