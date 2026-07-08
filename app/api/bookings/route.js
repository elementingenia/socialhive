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

// Write a notification — fails silently if table doesn't exist yet
async function createNotification(member_id, event_id, type, message) {
  try {
    await supabaseAdmin.from('notifications').insert({ member_id, event_id, type, message })
  } catch (_) {}
}

// Seat-level FIFO promotion.
// When seats free up, walk the waitlist in booked_at order and promote
// seat-by-seat. If a waiter has more seats than available, partially promote:
// confirm what's available, reduce their waitlist row.
async function promoteWaitlist(event_id) {
  const { data: event } = await supabaseAdmin
    .from('events').select('max_seats, title').eq('id', event_id).single()
  const { data: confirmedRows } = await supabaseAdmin
    .from('bookings').select('seats').eq('event_id', event_id).eq('status', 'confirmed')

  let available = (event?.max_seats || 0) -
    (confirmedRows || []).reduce((s, b) => s + (b.seats || 1), 0)
  if (available <= 0) return

  const { data: waitlisted } = await supabaseAdmin
    .from('bookings').select('id, seats, member_id, event_id, booked_at, payment_status')
    .eq('event_id', event_id).eq('status', 'waitlist').order('booked_at')

  for (const waiter of (waitlisted || [])) {
    if (available <= 0) break
    const waiterSeats = waiter.seats || 1
    const toConfirm   = Math.min(waiterSeats, available)
    const remaining   = waiterSeats - toConfirm

    if (remaining === 0) {
      // Fully promote — update status in place
      await supabaseAdmin.from('bookings').update({ status: 'confirmed' }).eq('id', waiter.id)
    } else {
      // Partially promote — shrink waitlist row, insert new confirmed row
      await supabaseAdmin.from('bookings').update({ seats: remaining }).eq('id', waiter.id)
      await supabaseAdmin.from('bookings').insert({
        event_id:       waiter.event_id,
        member_id:      waiter.member_id,
        seats:          toConfirm,
        status:         'confirmed',
        booked_at:      new Date().toISOString(),
        payment_status: waiter.payment_status,
      })
    }

    const eventTitle = event?.title || 'the event'
    const stillWaiting = remaining > 0
      ? ` ${remaining} seat${remaining !== 1 ? 's' : ''} remain${remaining === 1 ? 's' : ''} on the waitlist.`
      : ''
    const msg = toConfirm === 1
      ? `Great news — 1 seat has been confirmed for ${eventTitle}!${stillWaiting}`
      : `Great news — ${toConfirm} seats have been confirmed for ${eventTitle}!${stillWaiting}`

    await createNotification(waiter.member_id, event_id, 'waitlist_promoted', msg)
    available -= toConfirm
  }
}

// POST — book seats. Single confirmation step for any waitlist outcome.
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
    .from('events').select('id, max_seats, hub_type, book_id, payment_required').eq('id', event_id).single()
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  // Paid events must start life as 'pending' (awaiting payment), not the
  // DB default of 'not_required' (which means "this event is free"). Without
  // this, every fresh booking on a paid event silently reads as un-set,
  // which downstream UIs then interpret inconsistently.
  const initialPaymentStatus = event.payment_required ? 'pending' : 'not_required'

  // Book Club: block joining a different book while a previously-issued kit
  // copy hasn't been returned. has_book is never auto-cleared (not by
  // cancellation, not by the return date passing — EC/admin resets it
  // manually), so this checks across ALL of the member's bookings, any
  // status, for the most recent one still marked has_book=true. Same book
  // (a repeat cycle) is allowed through.
  if (event.hub_type === 'bookclub' && event.book_id) {
    const { data: outstandingRows } = await supabaseAdmin
      .from('bookings')
      .select('id, book_given_at, events(book_id, title, books(title))')
      .eq('member_id', member.id)
      .eq('has_book', true)
      .order('book_given_at', { ascending: false })
      .limit(1)
    const outstanding = outstandingRows?.[0]
    if (outstanding?.events?.book_id && outstanding.events.book_id !== event.book_id) {
      const title = outstanding.events.books?.title || outstanding.events.title || 'a book'
      return NextResponse.json({
        error: `You still have "${title}" checked out — return it to your Event Coordinator before joining a different book.`,
        book_conflict: true,
      }, { status: 409 })
    }
  }

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

  // All seats confirmed — no dialog needed
  if (available >= requestedSeats) {
    const { error } = await supabaseAdmin.from('bookings').insert({
      event_id, member_id: member.id, seats: requestedSeats, status: 'confirmed', booked_at: bookedAt,
      payment_status: initialPaymentStatus,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ status: 'confirmed', seats: requestedSeats })
  }

  // Some or all seats must go to waitlist — ask for confirmation first
  const willConfirm  = available           // may be 0
  const willWaitlist = requestedSeats - available

  if (!accept_split) {
    return NextResponse.json({
      status:    'split_offer',
      confirmed: willConfirm,
      waitlisted: willWaitlist,
    })
  }

  // User confirmed — insert rows
  const rows = []
  if (willConfirm > 0) {
    rows.push({ event_id, member_id: member.id, seats: willConfirm,  status: 'confirmed', booked_at: bookedAt, payment_status: initialPaymentStatus })
  }
  rows.push({ event_id, member_id: member.id, seats: willWaitlist, status: 'waitlist',  booked_at: bookedAt, payment_status: initialPaymentStatus })

  const { error } = await supabaseAdmin.from('bookings').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    status:     'split_confirmed',
    confirmed:  willConfirm,
    waitlisted: willWaitlist,
  })
}

// PATCH — change seat count
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

  const { data: event } = await supabaseAdmin
    .from('events').select('max_seats, payment_required').eq('id', event_id).single()
  const { data: confirmedRows } = await supabaseAdmin
    .from('bookings').select('seats')
    .eq('event_id', event_id).eq('status', 'confirmed').neq('id', myConfirmed.id)

  const othersConfirmed = (confirmedRows || []).reduce((s, b) => s + (b.seats || 1), 0)
  const maxCanConfirm   = (event?.max_seats || 0) - othersConfirmed

  const newConfirmed  = Math.min(newSeats, maxCanConfirm)
  const newWaitlisted = newSeats - newConfirmed

  if (myWaitlist) {
    await supabaseAdmin.from('bookings').update({ status: 'cancelled' }).eq('id', myWaitlist.id)
  }

  const { error: updateErr } = await supabaseAdmin
    .from('bookings').update({ seats: newConfirmed }).eq('id', myConfirmed.id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  if (newConfirmed < oldConfirmed) {
    await promoteWaitlist(event_id)
  }

  if (newWaitlisted > 0) {
    const { error: insertErr } = await supabaseAdmin.from('bookings').insert({
      event_id, member_id: member.id, seats: newWaitlisted,
      status: 'waitlist', booked_at: new Date().toISOString(),
      payment_status: event?.payment_required ? 'pending' : 'not_required',
    })
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({
    status:    newWaitlisted > 0 ? 'split_change' : 'confirmed_change',
    confirmed: newConfirmed,
    waitlisted: newWaitlisted,
  })
}

// DELETE — cancel all active bookings for member+event, promote waitlist
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

  const hadConfirmed = myBookings.some(b => b.status === 'confirmed')
  if (hadConfirmed) await promoteWaitlist(event_id)

  const { data: ev } = await supabaseAdmin.from('events').select('title').eq('id', event_id).single()
  await createNotification(member.id, event_id, 'booking_cancelled', `Your booking for ${ev?.title || 'this event'} was cancelled.`)

  return NextResponse.json({ success: true })
}
