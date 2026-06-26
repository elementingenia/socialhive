import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  // Retire existing active coordinators
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

export async function POST(req) {
  const member = await getAdminMember(req)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    title, event_date, event_time, description, welcome_message,
    max_seats, max_seats_per_booking, cost, payment_required,
    show_attendee_names, is_public, has_bus, bus_driver_id, coordinator_ids,
  } = body

  if (!title?.trim() || !event_date) {
    return NextResponse.json({ error: 'Title and date are required' }, { status: 400 })
  }

  const { data: event, error } = await supabaseAdmin
    .from('events')
    .insert({
      hub_type: 'social',
      title: title.trim(),
      event_date,
      event_time:           event_time   || null,
      description:          description  || null,
      welcome_message:      welcome_message || null,
      max_seats:            Number(max_seats)            || 20,
      max_seats_per_booking: Number(max_seats_per_booking) || 2,
      cost:                 payment_required ? (Number(cost) || 0) : 0,
      payment_required:     !!payment_required,
      show_attendee_names:  show_attendee_names !== false,
      is_public:            is_public !== false,
      has_bus:              !!has_bus,
      bus_driver_id:        (has_bus && bus_driver_id) ? bus_driver_id : null,
      archived:             false,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeCoordinators(event.id, coordinator_ids, member.id)

  return NextResponse.json({ ok: true, id: event.id })
}

export async function PATCH(req) {
  const member = await getAdminMember(req)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    id, title, event_date, event_time, description, welcome_message,
    max_seats, max_seats_per_booking, cost, payment_required,
    show_attendee_names, is_public, has_bus, bus_driver_id, coordinator_ids,
  } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (!title?.trim() || !event_date) {
    return NextResponse.json({ error: 'Title and date are required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('events')
    .update({
      title:                title.trim(),
      event_date,
      event_time:           event_time  || null,
      description:          description || null,
      welcome_message:      welcome_message || null,
      max_seats:            Number(max_seats)             || 20,
      max_seats_per_booking: Number(max_seats_per_booking) || 2,
      cost:                 payment_required ? (Number(cost) || 0) : 0,
      payment_required:     !!payment_required,
      show_attendee_names:  show_attendee_names !== false,
      is_public:            is_public !== false,
      has_bus:              !!has_bus,
      bus_driver_id:        (has_bus && bus_driver_id) ? bus_driver_id : null,
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeCoordinators(id, coordinator_ids, member.id)

  return NextResponse.json({ ok: true })
}
