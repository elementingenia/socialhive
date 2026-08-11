import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'
import { promoteWaitlist } from '@/lib/promoteWaitlist'
import { notify } from '@/lib/notify'
import { bookingsClosed } from '@/lib/booking'
import { validateParty, validateBring, resolveBringCategoryIds } from '@/lib/attendees'
import { fetchTakenResidentIds } from '@/lib/takenResidents'
import { syncAttendees } from '@/lib/syncAttendees'
import { maxSeatsPerBooking, planSeatModification } from '@/lib/modifyBooking'
import { amountOwing } from '@/lib/payments'


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

  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data: event } = await supabaseAdmin
    .from('events').select('id, max_seats, max_seats_per_booking, hub_type, book_id, payment_required, reservation_cutoff, allow_nonresident_guests, require_attendee_names, bring_category_ids, bring_required, club_id, clubs!club_id(bring_enabled)').eq('id', event_id).single()
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  // Cap reads the event's own max_seats_per_booking (falls back to 4) --
  // previously hardcoded, see lib/modifyBooking.js (2026-08-08).
  const requestedSeats = Math.min(maxSeatsPerBooking(event), Math.max(1, parseInt(body.seats) || 1))

  // Reservation cut-off (workstream B). Once past, no new bookings/waitlist
  // joins -- authoritative gate; the UI's "Bookings Closed" state mirrors it.
  // Reducing/cancelling is still allowed (handled by PATCH/DELETE).
  if (bookingsClosed(event)) {
    return NextResponse.json({ error: 'Bookings for this event have closed.', bookings_closed: true }, { status: 409 })
  }

  // Multi-attendee: every extra seat must be named (workstream A). Validated
  // here authoritatively; the same check runs client-side to gate the button.
  const { memberIds: takenMemberIds, contactIds: takenContactIds } = await fetchTakenResidentIds(event_id, { excludeOwnerId: member.id })
  const party = validateParty({
    seats: requestedSeats,
    attendees: body.attendees,
    allowGuests: !!event.allow_nonresident_guests,
    ownerId: member.id,
    takenMemberIds, takenContactIds,
    required: !!event.require_attendee_names,
  })
  if (!party.ok) return NextResponse.json({ error: party.error }, { status: 400 })

  // "Attendees bring something" is now per-EVENT, not implied by the club's
  // capability flag (Iain, 2026-08-07): applicable only when this event has
  // at least one category actually chosen; mandatory-vs-optional is the
  // event's own bring_required column. A club having the feature on doesn't
  // make every one of its events require it.
  const bringApplicable = Array.isArray(event.bring_category_ids) && event.bring_category_ids.length > 0
  let allowedCategoryIds = event.bring_category_ids
  if (bringApplicable && event.club_id) {
    const { data: currentCats } = await supabaseAdmin
      .from('club_bring_categories').select('id').eq('club_id', event.club_id)
    allowedCategoryIds = resolveBringCategoryIds({ allowedCategoryIds: event.bring_category_ids, currentCategoryIds: (currentCats || []).map(c => c.id) })
  }
  const bringRequired = bringApplicable && !!event.bring_required
  const bring = validateBring({
    required: bringRequired,
    bringCategoryId: body.bring_category_id,
    allowedCategoryIds,
  })
  if (!bring.ok) return NextResponse.json({ error: bring.error }, { status: 400 })
  // Applicable-but-optional still needs to persist a voluntary pick, not
  // just a mandatory one -- bringRequired alone would silently drop it.
  const bringFields = bringApplicable
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
    // amount/note (2026-08-11): a resident can say how much they actually
    // paid and add a note ("paid $40, will bring the rest Saturday") when
    // self-reporting -- same shape as the EC's own record-a-payment flow
    // (app/api/coordinator/route.js's set_payment), just on the other side
    // of the transaction. Both optional -- blank amount defaults to the
    // full amount owed, same as before this field existed.
    const { amount: rawAmount, note } = body
    const { data: booking } = await supabaseAdmin
      .from('bookings').select('id, payment_status, seats, payment_notes, amount_paid')
      .eq('event_id', event_id).eq('member_id', member.id).eq('status', 'confirmed')
      .maybeSingle()

    if (!booking) return NextResponse.json({ error: 'No confirmed booking found' }, { status: 404 })
    // 'partial' is allowed here too (2026-08-11 follow-up) -- a resident who
    // paid part of what's owed needs a way to tell their EC they've now
    // paid the rest (or an additional amount). This was previously
    // blocked outright: mark_payment_submitted only accepted 'pending',
    // so a partial payer had NO self-service way to report the balance --
    // found by Iain asking directly how Scampi would do this, not by a
    // bug report.
    if (!['pending', 'partial'].includes(booking.payment_status)) {
      return NextResponse.json({ error: 'Payment is not awaiting submission' }, { status: 400 })
    }

    const { data: event } = await supabaseAdmin
      .from('events').select('title, cost').eq('id', event_id).single()
    const owed = amountOwing(event, booking.seats)
    // amount_paid is the EC-CONFIRMED ledger, not a claim (2026-08-12
    // follow-up, Iain -- Spring Ball 1): self-report used to write the
    // resident's claimed new total straight into amount_paid, so by the
    // time the EC opened the toggle to review it, the balance already
    // read $0 of $0 -- the claim had silently "banked" itself before
    // anyone confirmed it actually arrived. Now: self-report logs the
    // CLAIMED amount to payment_notes (for the EC to see) and flips the
    // status to 'submitted', but never touches amount_paid -- that stays
    // exactly what it was until an EC genuinely confirms it via
    // set_payment, at which point the normal balance/increment logic in
    // coordinator/route.js applies it for real. Blank amount still
    // defaults to the outstanding balance, purely for what's shown in
    // the note/notification -- not written to the booking.
    const existingPaid = Number(booking.amount_paid) || 0
    const increment = (rawAmount !== undefined && rawAmount !== null && rawAmount !== '')
      ? Math.max(0, parseFloat(rawAmount) || 0) : Math.max(0, owed - existingPaid)
    const claimedTotal = existingPaid + increment

    const patch = {
      payment_status: 'submitted', updated_at: new Date().toISOString(),
      // Independent of payment_status (migration 076) -- lets an EC's
      // later Paid -> Unpaid toggle restore 'submitted' instead of
      // blindly wiping to 'pending', which would silently discard the
      // resident's own self-report (Iain, 2026-08-04).
      payment_submitted_at: new Date().toISOString(),
    }
    if (note) {
      // Logs the amount CLAIMED this transaction, not a running total --
      // matches the EC-side ledger entry shape in coordinator/route.js,
      // and is purely informational until an EC confirms it.
      patch.payment_notes = [...(booking.payment_notes || []),
        { amount: increment, note, recorded_by: member.id, recorded_at: new Date().toISOString() }]
    }
    const { error: markErr } = await supabaseAdmin.from('bookings').update(patch).eq('id', booking.id)
    if (markErr) return NextResponse.json({ error: markErr.message }, { status: 500 })

    // Notify this event's active coordinators + all admins so someone
    // knows to check and confirm -- mirrors resolveEC's authority set in
    // app/api/coordinator/route.js.
    const { data: ecRows } = await supabaseAdmin
      .from('event_coordinators').select('member_id').eq('event_id', event_id).is('replaced_at', null)
    const { data: admins } = await supabaseAdmin.from('members').select('id').eq('is_admin', true)
    const notifyIds = new Set([...(ecRows || []).map(r => r.member_id), ...(admins || []).map(a => a.id)])

    const owedStr = `$${owed.toFixed(2)}`
    const paidStr = `$${claimedTotal.toFixed(2)}`
    const amountPhrase = claimedTotal < owed ? `${paidStr} of ${owedStr}` : paidStr
    let msg = `${member.name || 'A resident'} marked payment (${amountPhrase}) as submitted for ${event?.title || 'this event'} — please confirm.`
    if (note) msg += ` Note: ${note}`
    for (const id of notifyIds) {
      // actorId guard (Iain, 2026-07-24): if the resident marking their own
      // payment as submitted is also an admin or this event's coordinator --
      // easy to hit, since Iain is both -- they'd otherwise get a "please
      // confirm" notification about their own action. notify()'s central
      // actorId param exists for exactly this (added 2026-07-21), this call
      // site just never passed it -- the general self-notification fix
      // landed on other call sites but missed this one, written earlier
      // (2026-07-12) and not revisited since.
      await notify(id, event_id, 'payment_submitted', msg, undefined, member.id)
    }

    return NextResponse.json({ ok: true })
  }

  const { data: allMine } = await supabaseAdmin
    .from('bookings').select('id, status, seats')
    .eq('event_id', event_id).eq('member_id', member.id).neq('status', 'cancelled')

  const myConfirmed = (allMine || []).find(b => b.status === 'confirmed')
  const myWaitlist  = (allMine || []).find(b => b.status === 'waitlist')

  if (!myConfirmed) return NextResponse.json({ error: 'No confirmed booking found' }, { status: 404 })

  const oldConfirmed = myConfirmed.seats || 1

  const { data: event } = await supabaseAdmin
    .from('events').select('max_seats, max_seats_per_booking, payment_required, reservation_cutoff, allow_nonresident_guests, require_attendee_names, bring_category_ids, bring_required, club_id, clubs!club_id(bring_enabled)').eq('id', event_id).single()
  const { data: confirmedRows } = await supabaseAdmin
    .from('bookings').select('seats')
    .eq('event_id', event_id).eq('status', 'confirmed').neq('id', myConfirmed.id)

  const othersConfirmed = (confirmedRows || []).reduce((s, b) => s + (b.seats || 1), 0)

  // Shared with the admin/EC "modify_booking" action (lib/modifyBooking.js,
  // 2026-08-08) -- reservation cut-off still blocks growth (shrinking stays
  // allowed), and a booking that's already split onto the waitlist can no
  // longer grow at all (cancel + rebook instead).
  const plan = planSeatModification({
    event, requestedSeats: body.seats,
    oldConfirmed, oldWaitlisted: myWaitlist?.seats || 0,
    othersConfirmed, closed: bookingsClosed(event),
  })
  if (!plan.ok) {
    return NextResponse.json({ error: plan.error, ...(plan.code === 'bookings_closed' ? { bookings_closed: true } : {}) }, { status: 409 })
  }
  const newSeats = plan.seats

  // Re-validate the named party against the new seat count (workstream A).
  const { memberIds: takenMemberIds, contactIds: takenContactIds } = await fetchTakenResidentIds(event_id, { excludeOwnerId: member.id })
  const party = validateParty({
    seats: newSeats,
    attendees: body.attendees,
    allowGuests: !!event?.allow_nonresident_guests,
    ownerId: member.id,
    takenMemberIds, takenContactIds,
    required: !!event?.require_attendee_names,
  })
  if (!party.ok) return NextResponse.json({ error: party.error }, { status: 400 })

  const bringApplicable = Array.isArray(event?.bring_category_ids) && event.bring_category_ids.length > 0
  let patchAllowedCategoryIds = event?.bring_category_ids
  if (bringApplicable && event?.club_id) {
    const { data: currentCats } = await supabaseAdmin
      .from('club_bring_categories').select('id').eq('club_id', event.club_id)
    patchAllowedCategoryIds = resolveBringCategoryIds({ allowedCategoryIds: event?.bring_category_ids, currentCategoryIds: (currentCats || []).map(c => c.id) })
  }
  const bringRequired = bringApplicable && !!event?.bring_required
  const bring = validateBring({
    required: bringRequired,
    bringCategoryId: body.bring_category_id,
    allowedCategoryIds: patchAllowedCategoryIds,
  })
  if (!bring.ok) return NextResponse.json({ error: bring.error }, { status: 400 })

  const newConfirmed  = plan.newConfirmed
  const newWaitlisted = plan.newWaitlisted

  if (myWaitlist) {
    await supabaseAdmin.from('bookings').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', myWaitlist.id)
  }

  const { error: updateErr } = await supabaseAdmin
    .from('bookings').update({ seats: newConfirmed, updated_at: new Date().toISOString(),
      ...(bringApplicable ? { bring_category_id: body.bring_category_id || null, bring_note: body.bring_note || null } : {}) }).eq('id', myConfirmed.id)
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
    .from('bookings').select('id, status, seats, payment_status, amount_paid')
    .eq('event_id', event_id).eq('member_id', member.id).neq('status', 'cancelled')

  if (!myBookings?.length) {
    return NextResponse.json({ error: 'No active booking found' }, { status: 404 })
  }

  // A 'submitted' claim is unresolved by definition -- the EC hasn't confirmed
  // or rejected it yet (2026-08-12, Iain -- closing the gap found on Spring
  // Ball 2: a cancel wiped an outstanding payment claim with no trace, because
  // amount_paid only reflects EC-confirmed money and cancelling doesn't look
  // at payment_notes/payment_submitted_at at all). Block self-cancel here too,
  // not just the EC path -- the same silent-loss risk exists either side:
  // cancelling before the claim is resolved means if the money genuinely
  // changed hands, there is nothing left in the system to prove it or refund
  // it. Ask the resident to wait for their EC to review it first.
  if (myBookings.some(b => b.payment_status === 'submitted')) {
    return NextResponse.json({
      error: "You've reported a payment for this booking that your Event Coordinator hasn't confirmed yet. Please wait for them to review it before cancelling."
    }, { status: 409 })
  }

  // Same refund-ledger population as the EC-cancel path (app/api/coordinator
  // /route.js's cancel_booking, 2026-08-11) -- a self-cancel on a paid or
  // partially-paid booking owes that money back just as much as an
  // EC-initiated one does. Applied per-row since a split confirmed+waitlist
  // booking can have payment on the confirmed row only.
  const now = new Date().toISOString()
  for (const b of myBookings) {
    const alreadyPaid = parseFloat(b.amount_paid) || 0
    const patch = { status: 'cancelled', updated_at: now }
    if ((b.payment_status === 'confirmed' || b.payment_status === 'partial') && alreadyPaid > 0) {
      patch.refund_due = alreadyPaid
      patch.refund_paid_at = null
    }
    await supabaseAdmin.from('bookings').update(patch).eq('id', b.id)
  }

  await supabaseAdmin.from('booking_attendees').delete().eq('event_id', event_id).eq('owner_id', member.id)

  const hadConfirmed = myBookings.some(b => b.status === 'confirmed')
  if (hadConfirmed) await promoteWaitlist(event_id)

  // No notification here: this endpoint is SELF-cancel only, so the member who
  // would receive it is the one who just performed the action (Iain, 2026-07-21).

  return NextResponse.json({ success: true })
}
