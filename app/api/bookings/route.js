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
    .from('members').select('id, name').eq('auth_id', user.id).single()
  return member
}

// POST — book seats, join waitlist, or create split booking
export async function POST(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const { event_id, accept_split } = body
  const requestedSeats = Math.min(4, Math.max(1, parseInt(body.seats) || 1))

  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data: event } = await supabaseAdmin
    .from('events').select('id, max_seats').eq('id', event_id).single()
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const { data: allBookings } = await supabaseAdmin
    .from('bookings')
    .select('id, member_id, status, seats')
    .eq('event_id', event_id)
    .neq('status', 'cancelled')

  const confirmedSeats = (allBookings || [])
    .filter(b => b.status === 'confirmed')
    .reduce((sum, b) => sum + (b.seats || 1), 0)

  const available = Math.max(0, event.max_seats - confirmedSeats)

  const myBookings  = (allBookings || []).filter(b => b.member_id === member.id)
  const myConfirmed = myBookings.find(b => b.status === 'confirmed')
  const myWaitlist  = myBookings.find(b => b.status === 'waitlist')

  if ((myConfirmed || myWaitlist) && !accept_split) {
    return NextResponse.json({ error: 'Already booked for this event' }, { status: 409 })
  }

  const bookedAt = new Date().toISOString()

  if (available === 0) {
    const { error } = await supabaseAdmin.from('bookings').insert({
      event_id, member_id: member.id, seats: requestedSeats, status: 'waitlist', booked_at: bookedAt,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ status: 'waitlist', seats: requestedSeats })
  }

  if (available >= requestedSeats) {
    const { error } = await supabaseAdmin.from('bookings').insert({
      event_id, member_id: member.id, seats: requestedSeats, status: 'confirmed', booked_at: bookedAt,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ status: 'confirmed', seats: requestedSeats })
  }

  if (!accept_split) {
    return NextResponse.json({
      status: 'split_offer',
      confirmed: available,
      waitlisted: requestedSeats - available,
    }, { status: 200 })
  }

  const splitAt = new Date().toISOString()
  const { error } = await supabaseAdmin.from('bookings').insert([
    { event_id, member_id: member.id, seats: available,                  status: 'confirmed', booked_at: splitAt },
    { event_id, member_id: member.id, seats: requestedSeats - available, status: 'waitlist',  booked_at: splitAt },
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    status: 'split_confirmed',
    confirmed: available,
    waitlisted: requestedSeats - available,
  })
}

// PATCH — change seat count; if user has split, cancels waitlist and adjusts confirmed
export async function PATCH(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const { event_id } = body
  const newSeats = Math.min(4, Math.max(1, parseInt(body.seats) || 1))

  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data: allMine } = await supabaseAdmin
    .from('bookings').select('id, status, seats')
    .eq('event_id', event_id).eq('member_id', member.id).neq('status', 'cancelled')

  const myConfirmed = (allMine || []).find(b => b.status === 'confirmed')
  const myWaitlist  = (allMine || []).find(b => b.status === 'waitlist')

  if (!myConfirmed) return NextResponse.json({ error: 'No confirmed booking found' }, { status: 404 })

  const oldSeats = myConfirmed.seats || 1

  // If user has a split booking: changing always removes the waitlist place
  // newSeats must be <= their current confirmed seats (can't increase via change with a waitlist)
  if (myWaitlist) {
    if (newSeats > oldSeats) {
      return NextResponse.json(
        { error: 'Cannot increase seats while on waitlist — cancel and rebook instead' },
        { status: 409 }
      )
    }
    // Cancel the waitlist record
    await supabaseAdmin.from('bookings').update({ status: 'cancelled' }).eq('id', myWaitlist.id)
    // Update confirmed to newSeats
    const { data: updated, error } = await supabaseAdmin
      .from('bookings').update({ seats: newSeats }).eq('id', myConfirmed.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Promote waitlisted others if confirmed seats reduced
    const freedSeats = oldSeats - newSeats
    if (freedSeats > 0) {
      await promoteWaitlist(event_id, freedSeats)
    }

    return NextResponse.json({ ...updated, waitlist_cancelled: true })
  }

  // No waitlist — standard change
  if (newSeats > oldSeats) {
    const { data: event } = await supabaseAdmin
      .from('events').select('max_seats').eq('id', event_id).single()
    const { data: confirmedRows } = await supabaseAdmin
      .from('bookings').select('seats')
      .eq('event_id', event_id).eq('status', 'confirmed').neq('id', myConfirmed.id)

    const confirmedSum = (confirmedRows || []).reduce((s, b) => s + (b.seats || 1), 0)
    const available = (event?.max_seats || 0) - confirmedSum

    if (newSeats > available) {
      return NextResponse.json(
        { error: 'Only ' + available + ' seat' + (available === 1 ? '' : 's') + ' available' },
        { status: 409 }
      )
    }
  }

  const { data: updated, error } = await supabaseAdmin
    .from('bookings').update({ seats: newSeats }).eq('id', myConfirmed.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (newSeats < oldSeats) {
    await promoteWaitlist(event_id, oldSeats - newSeats)
  }

  return NextResponse.json(updated)
}

async function promoteWaitlist(event_id, freedSeats) {
  const { data: event } = await supabaseAdmin
    .from('events').select('max_seats').eq('id', event_id).single()
  const { data: confirmedRows } = await supabaseAdmin
    .from('bookings').select('seats').eq('event_id', event_id).eq('status', 'confirmed')

  let available = (event?.max_seats || 0) -
    (confirmedRows || []).reduce((s, b) => s + (b.seats || 1), 0)

  const { data: waitlisted } = await supabaseAdmin
    .from('bookings').select('id, seats, member_id')
    .eq('event_id', event_id).eq('status', 'waitlist').order('booked_at')

  for (const waiter of (waitlisted || [])) {
    if (available <= 0) break
    if ((waiter.seats || 1) <= available) {
      await supabaseAdmin.from('bookings').update({ status: 'confirmed' }).eq('id', waiter.id)
      available -= (waiter.seats || 1)
    }
  }
}

// DELETE — cancel ALL active bookings for member+event and promote waitlist
export async function DELETE(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { event_id } = await req.json()
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data: myBookings } = await supabaseAdmin
    .from('bookings')
    .select('id, status, seats')
    .eq('event_id', event_id)
    .eq('member_id', member.id)
    .neq('status', 'cancelled')

  if (!myBookings?.length) {
    return NextResponse.json({ error: 'No active booking found' }, { status: 404 })
  }

  const bookingIds = myBookings.map(b => b.id)
  const { error: cancelError } = await supabaseAdmin
    .from('bookings').update({ status: 'cancelled' }).in('id', bookingIds)
  if (cancelError) return NextResponse.json({ error: cancelError.message }, { status: 500 })

  const freedSeats = myBookings
    .filter(b => b.status === 'confirmed')
    .reduce((sum, b) => sum + (b.seats || 1), 0)

  if (freedSeats > 0) {
    await promoteWaitlist(event_id, freedSeats)
  }

  return NextResponse.json({ success: true })
}
