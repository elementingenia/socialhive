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
    .from('bookings').select('id, member_id, status, seats')
    .eq('event_id', event_id).neq('status', 'cancelled')

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

// PATCH — change seat count
// newSeats is always the DESIRED TOTAL (confirmed + waitlist combined)
// API maximises confirmed seats up to capacity; overflow goes to waitlist at back of queue
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

  const oldConfirmed = myConfirmed.seats || 1

  // ── Shared: calculate confirmed capacity available to this user ───────────────
  const { data: event } = await supabaseAdmin
    .from('events').select('max_seats').eq('id', event_id).single()
  const { data: confirmedRows } = await supabaseAdmin
    .from('bookings').select('seats')
    .eq('event_id', event_id).eq('status', 'confirmed').neq('id', myConfirmed.id)

  const othersConfirmed = (confirmedRows || []).reduce((s, b) => s + (b.seats || 1), 0)
  const maxCanConfirm   = (event?.max_seats || 0) - othersConfirmed  // max seats user can hold as confirmed

  // newSeats = total desired (confirmed + waitlist)
  const newConfirmed  = Math.min(newSeats, maxCanConfirm)
  const newWaitlisted = newSeats - newConfirmed

  // ── Cancel existing waitlist (always — we'll re-insert if still needed) ───────
  if (myWaitlist) {
    await supabaseAdmin.from('bookings').update({ status: 'cancelled' }).eq('id', myWaitlist.id)
  }

  // ── Update confirmed seats ────────────────────────────────────────────────────
  const { error: updateErr } = await supabaseAdmin
    .from('bookings').update({ seats: newConfirmed }).eq('id', myConfirmed.id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Promote other waitlisted users if confirmed seats were freed
  if (newConfirmed < oldConfirmed) {
    await promoteWaitlist(event_id, oldConfirmed - newConfirmed)
  }

  // ── Re-insert waitlist if still needed (booked_at = now → back of queue) ──────
  if (newWaitlisted > 0) {
    const { error: insertErr } = await supabaseAdmin.from('bookings').insert({
      event_id, member_id: member.id, seats: newWaitlisted,
      status: 'waitlist', booked_at: new Date().toISOString(),
    })
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({
    status: newWaitlisted > 0 ? 'split_change' : 'confirmed_change',
    confirmed: newConfirmed,
    waitlisted: newWaitlisted,
  })
}

async function promoteWaitlist(event_id, freedSeats) {
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
    .from('bookings').select('id, status, seats')
    .eq('event_id', event_id).eq('member_id', member.id).neq('status', 'cancelled')

  if (!myBookings?.length) {
    return NextResponse.json({ error: 'No active booking found' }, { status: 404 })
  }

  await supabaseAdmin.from('bookings').update({ status: 'cancelled' }).in('id', myBookings.map(b => b.id))

  const freedSeats = myBookings
    .filter(b => b.status === 'confirmed')
    .reduce((sum, b) => sum + (b.seats || 1), 0)

  if (freedSeats > 0) await promoteWaitlist(event_id, freedSeats)

  return NextResponse.json({ success: true })
}
