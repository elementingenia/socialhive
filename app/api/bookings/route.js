import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'
import { promoteWaitlist } from '@/lib/promoteWaitlist'
import { notify } from '@/lib/notify'
import { bookingsClosed } from '@/lib/booking'
import { validateParty, validateBring } from '@/lib/attendees'
import { syncAttendees } from '@/lib/syncAttendees'


async function getMember(token) {
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: member } = await supabaseAdmin
    .from('members').select('id, name').eq('auth_id', user.id).single()
  return member
}

// Seat-level FIFO waitlist promotion now lives in lib/promoteWaitlist.js,
// shared with app/api/coordinator/route.js (2026-07-12) so the self-cancel
// and EC-cancel paths can't drift apart the way they had been.

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
    .from('events').select('id, max_seats, hub_type, book_id, payment_required, reservation_cutoff, allow_nonresident_guests, bring_category_ids, club_id, clubs!club_id(bring_enabled)').eq('id', event_id).single()
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  // Reservation cut-off (workstream B). Once past, no new bookings/waitlist
  // joins -- authoritative gate; the UI's "Bookings Closed" state mirrors it.
  // Reducing/cancelling is still allowed (handled by PATCH/DELETE).
  if (bookingsClosed(event)) {
    return NextResponse.json({ error: 'Bookings for this event have closed.', bookings_closed: true }, { status: 409 })
  }

  // Multi-attendee: every extra seat must be named (workstream A). Validated
  // here authoritatively; the same check runs client-side to gate the button.
  const party = validateParty({
    seats: requestedSeats,
    attendees: body.attendees,
    allowGuests: !!event.allow_nonresident_guests,
    ownerId: member.id,
  })
  if (!party.ok) return NextResponse.json({ error: party.error }, { status: 400 })

  // "Attendees bring something": mandatory for the booker, optional for guests.
  const bringRequired = !!event.clubs?.bring_enabled
  const bring = validateBring({
    required: bringRequired,
    bringCategoryId: body.bring_category_id,
    allowedCategoryIds: event.bring_category_ids,
  })
  if (!bring.ok) return NextResponse.json({ error: bring.error }, { status: 400 })
  const bringFields = bringRequired
    ? { bring_category_id: body.bring_category_id || null, bring_note: body.bring_note || null }
    : {}

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
      payment_status: initialPaymentStatus, ...bringFields,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await syncAttendees(event_id, { ownerId: member.id }, party.attendees)
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
    rows.push({ event_id, member_id: member.id, seats: willConfirm,  status: 'confirmed', booked_at: bookedAt, payment_status: initialPaymentStatus, ...bringFields })
  }
  rows.push({ event_id, member_id: member.id, seats: willWaitlist, status: 'waitlist',  booked_at: bookedAt, payment_status: initialPaymentStatus, ...bringFields })

  const { error } = await supabaseAdmin.from('bookings').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await syncAttendees(event_id, { ownerId: member.id }, party.attendees)

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
  const { event_id, action } = body

  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  // Self-service: resident flags their own booking as paid, pending EC
  // confirmation (idea 2 of the EC payment model, 2026-07-12). Does not
  // touch seats -- separate branch, returns early.
  if (action === 'mark_payment_submitted') {
    const { data: booking } = await supabaseAdmin
      .from('bookings').select('id, payment_status, seats')
      .eq('event_id', event_id).eq('member_id', member.id).eq('status', 'confirmed')
      .maybeSingle()

    if (!booking) return NextResponse.json({ error: 'No confirmed booking found' }, { status: 404 })
    if (booking.payment_status !== 'pending') {
      return NextResponse.json({ error: 'Payment is not awaiting submission' }, { status: 400 })
    }

    const { error: markErr } = await supabaseAdmin
      .from('bookings').update({ payment_status: 'submitted', updated_at: new Date().toISOString() }).eq('id', booking.id)
    if (markErr) return NextResponse.json({ error: markErr.message }, { status: 500 })

    const { data: event } = await supabaseAdmin
      .from('events').select('title, cost').eq('id', event_id).single()
    const owed = event?.cost ? (parseFloat(event.cost) * (booking.seats || 1)).toFixed(2) : null

    // Notify this event's active coordinators + all admins so someone
    // knows to check and confirm -- mirrors resolveEC's authority set in
    // app/api/coordinator/route.js.
    const { data: ecRows } = await supabaseAdmin
      .from('event_coordinators').select('member_id').eq('event_id', event_id).is('replaced_at', null)
    const { data: admins } = await supabaseAdmin.from('members').select('id').eq('is_admin', true)
    const notifyIds = new Set([...(ecRows || []).map(r => r.member_id), ...(admins || []).map(a => a.id)])

    const msg = `${member.name || 'A resident'} marked payment${owed ? ` ($${owed})` : ''} as submitted for ${event?.title || 'this event'} — please confirm.`
    for (const id of notifyIds) {
      await notify(id, event_id, 'payment_submitted', msg)
    }

    return NextResponse.json({ ok: true })
  }

  const newSeats = Math.min(4, Math.max(1, parseInt(body.seats) || 1))

  const { data: allMine } = await supabaseAdmin
    .from('bookings').select('id, status, seats')
    .eq('event_id', event_id).eq('member_id', member.id).neq('status', 'cancelled')

  const myConfirmed = (allMine || []).find(b => b.status === 'confirmed')
  const myWaitlist  = (allMine || []).find(b => b.status === 'waitlist')

  if (!myConfirmed) return NextResponse.json({ error: 'No confirmed booking found' }, { status: 404 })

  const oldConfirmed = myConfirmed.seats || 1

  const { data: event } = await supabaseAdmin
    .from('events').select('max_seats, payment_required, reservation_cutoff, allow_nonresident_guests, bring_category_ids, club_id, clubs!club_id(bring_enabled)').eq('id', event_id).single()
  const { data: confirmedRows } = await supabaseAdmin
    .from('bookings').select('seats')
    .eq('event_id', event_id).eq('status', 'confirmed').neq('id', myConfirmed.id)

  const othersConfirmed = (confirmedRows || []).reduce((s, b) => s + (b.seats || 1), 0)
  const maxCanConfirm   = (event?.max_seats || 0) - othersConfirmed

  // Reservation cut-off (workstream B): can't grow a booking once closed,
  // but shrinking it (freeing seats) stays allowed.
  const currentTotal = oldConfirmed + (myWaitlist?.seats || 0)
  if (newSeats > currentTotal && bookingsClosed(event)) {
    return NextResponse.json({ error: 'Bookings for this event have closed — you can no longer add seats.', bookings_closed: true }, { status: 409 })
  }

  // Re-validate the named party against the new seat count (workstream A).
  const party = validateParty({
    seats: newSeats,
    attendees: body.attendees,
    allowGuests: !!event?.allow_nonresident_guests,
    ownerId: member.id,
  })
  if (!party.ok) return NextResponse.json({ error: party.error }, { status: 400 })

  const bringRequired = !!event?.clubs?.bring_enabled
  const bring = validateBring({
    required: bringRequired,
    bringCategoryId: body.bring_category_id,
    allowedCategoryIds: event?.bring_category_ids,
  })
  if (!bring.ok) return NextResponse.json({ error: bring.error }, { status: 400 })

  const newConfirmed  = Math.min(newSeats, maxCanConfirm)
  const newWaitlisted = newSeats - newConfirmed

  if (myWaitlist) {
    await supabaseAdmin.from('bookings').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', myWaitlist.id)
  }

  const { error: updateErr } = await supabaseAdmin
    .from('bookings').update({ seats: newConfirmed, updated_at: new Date().toISOString(),
      ...(bringRequired ? { bring_category_id: body.bring_category_id || null, bring_note: body.bring_note || null } : {}) }).eq('id', myConfirmed.id)
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

  await syncAttendees(event_id, { ownerId: member.id }, party.attendees)

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

  await supabaseAdmin.from('bookings').update({ status: 'cancelled', updated_at: new Date().toISOString() }).in('id', myBookings.map(b => b.id))

  await supabaseAdmin.from('booking_attendees').delete().eq('event_id', event_id).eq('owner_id', member.id)

  const hadConfirmed = myBookings.some(b => b.status === 'confirmed')
  if (hadConfirmed) await promoteWaitlist(event_id)

  // No notification here: this endpoint is SELF-cancel only, so the member who
  // would receive it is the one who just performed the action (Iain, 2026-07-21).

  return NextResponse.json({ success: true })
}
