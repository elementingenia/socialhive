import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function getMember(token) {
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: member } = await supabaseAdmin
    .from('members').select('id, is_admin').eq('auth_id', user.id).single()
  return member
}

// POST — book seats (or join waitlist)
export async function POST(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const { event_id } = body
  const seats = Math.min(4, Math.max(1, parseInt(body.seats) || 1))

  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data: event } = await supabaseAdmin
    .from('events').select('id, max_seats').eq('id', event_id).single()
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const { data: existing } = await supabaseAdmin
    .from('bookings').select('id, status, seats')
    .eq('event_id', event_id).eq('member_id', member.id).maybeSingle()

  if (existing && existing.status !== 'cancelled') {
    return NextResponse.json({ error: 'Already booked' }, { status: 409 })
  }

  const { data: confirmedRows } = await supabaseAdmin
    .from('bookings').select('seats').eq('event_id', event_id).eq('status', 'confirmed')

  const confirmedSum = (confirmedRows || []).reduce((s, b) => s + (b.seats || 1), 0)
  const available = event.max_seats - confirmedSum
  const status = available >= seats ? 'confirmed' : 'waitlist'

  let booking
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('bookings')
      .update({ status, seats, booked_at: new Date().toISOString() })
      .eq('id', existing.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    booking = data
  } else {
    const { data, error } = await supabaseAdmin
      .from('bookings').insert({ event_id, member_id: member.id, status, seats })
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    booking = data
  }

  return NextResponse.json(booking)
}

// PATCH — change seat count on existing booking
export async function PATCH(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const { event_id } = body
  const newSeats = Math.min(4, Math.max(1, parseInt(body.seats) || 1))

  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data: booking } = await supabaseAdmin
    .from('bookings').select('id, status, seats')
    .eq('event_id', event_id).eq('member_id', member.id).maybeSingle()

  if (!booking || booking.status === 'cancelled') {
    return NextResponse.json({ error: 'No active booking found' }, { status: 404 })
  }

  const oldSeats = booking.seats || 1

  // If increasing seats, verify availability (excluding this booking)
  if (newSeats > oldSeats && booking.status === 'confirmed') {
    const { data: event } = await supabaseAdmin
      .from('events').select('max_seats').eq('id', event_id).single()
    const { data: confirmedRows } = await supabaseAdmin
      .from('bookings').select('seats')
      .eq('event_id', event_id).eq('status', 'confirmed').neq('id', booking.id)

    const confirmedSum = (confirmedRows || []).reduce((s, b) => s + (b.seats || 1), 0)
    const available = (event?.max_seats || 0) - confirmedSum

    if (newSeats > available) {
      return NextResponse.json(
        { error: `Only ${available} seat${available === 1 ? '' : 's'} available` },
        { status: 409 }
      )
    }
  }

  const { data: updated, error } = await supabaseAdmin
    .from('bookings').update({ seats: newSeats }).eq('id', booking.id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If reducing confirmed seats, try to promote waitlisted bookings
  if (newSeats < oldSeats && booking.status === 'confirmed') {
    const { data: event } = await supabaseAdmin
      .from('events').select('max_seats').eq('id', event_id).single()
    const { data: confirmedRows } = await supabaseAdmin
      .from('bookings').select('seats').eq('event_id', event_id).eq('status', 'confirmed')

    let available = (event?.max_seats || 0) -
      (confirmedRows || []).reduce((s, b) => s + (b.seats || 1), 0)

    const { data: waitlisted } = await supabaseAdmin
      .from('bookings').select('id, seats')
      .eq('event_id', event_id).eq('status', 'waitlist').order('booked_at')

    for (const waiter of (waitlisted || [])) {
      if (available >= (waiter.seats || 1)) {
        await supabaseAdmin.from('bookings').update({ status: 'confirmed' }).eq('id', waiter.id)
        available -= (waiter.seats || 1)
      }
    }
  }

  return NextResponse.json(updated)
}

// DELETE — cancel booking and promote waitlist (seat-aware FIFO)
export async function DELETE(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { event_id } = await req.json()
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data: booking } = await supabaseAdmin
    .from('bookings').select('id, member_id, status, seats')
    .eq('event_id', event_id).eq('member_id', member.id).maybeSingle()

  if (!booking) return NextResponse.json({ error: 'No booking found' }, { status: 404 })
  if (booking.status === 'cancelled') return NextResponse.json({ error: 'Already cancelled' }, { status: 409 })

  const wasConfirmed = booking.status === 'confirmed'

  await supabaseAdmin.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id)

  if (wasConfirmed) {
    const { data: confirmedRows } = await supabaseAdmin
      .from('bookings').select('seats').eq('event_id', event_id).eq('status', 'confirmed')
    const { data: event } = await supabaseAdmin
      .from('events').select('max_seats').eq('id', event_id).single()

    let available = (event?.max_seats || 0) -
      (confirmedRows || []).reduce((s, b) => s + (b.seats || 1), 0)

    const { data: waitlisted } = await supabaseAdmin
      .from('bookings').select('id, seats')
      .eq('event_id', event_id).eq('status', 'waitlist').order('booked_at')

    for (const waiter of (waitlisted || [])) {
      if (available >= (waiter.seats || 1)) {
        await supabaseAdmin.from('bookings').update({ status: 'confirmed' }).eq('id', waiter.id)
        available -= (waiter.seats || 1)
      }
    }
  }

  return NextResponse.json({ success: true })
}
