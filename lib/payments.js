// lib/payments.js
// Single source of truth for booking payment-status semantics across hubs.
//
// bookings.payment_status is one of:
//   'not_required' — the event doesn't require payment (payment_required=false)
//   'pending'      — payment required, not yet received (default for a fresh
//                    booking on a paid event)
//   'confirmed'    — payment received
//   'refunded'     — booking was cancelled/refunded after payment was received
//
// Convention — do not invert this: a booking counts as PAID only when
// payment_status is exactly 'confirmed'. Everything else ('pending',
// 'not_required', null/undefined, or any unexpected value) must read as
// unpaid. This is the inverse of what several call sites independently did
// before 2026-07-07 ("paid unless literally pending"), which silently
// displayed "Paid" for bookings nobody had actually paid — see
// session-summaries/session_summary_2026-07-07.md for the full incident.
// Every screen that needs to know whether a booking is paid should call
// into this file rather than re-deriving the check inline.

export function isPaid(booking) {
  return booking?.payment_status === "confirmed"
}

export function isRefunded(booking) {
  return booking?.payment_status === "refunded"
}

// True when a confirmed-seat booking is on a paid event and hasn't been
// marked paid yet. Use this for "Unpaid" / "Pending Payment" badges —
// never re-derive it as `payment_status === 'pending'`, which misses
// 'not_required' rows created before payment_status was set explicitly
// (see api/bookings/route.js) and any other non-'confirmed' value.
export function isAwaitingPayment(booking, event) {
  if (!event?.payment_required) return false
  if (booking?.status && booking.status !== "confirmed") return false
  return !isPaid(booking)
}

// Total seats, across a list of confirmed bookings, that are unpaid.
// Excludes refunded bookings — a refunded booking is closed out, not
// "still owing".
export function sumUnpaidSeats(confirmedBookings, event) {
  if (!event?.payment_required) return 0
  return (confirmedBookings || [])
    .filter(b => !isPaid(b) && !isRefunded(b))
    .reduce((sum, b) => sum + (b.seats || 1), 0)
}

// "$70.00" for 2 seats at $35/seat — null if the event has no cost set.
export function seatsCost(event, seats) {
  const cost = event?.cost ? parseFloat(event.cost) : null
  if (!cost) return null
  return `$${(cost * (seats || 1)).toFixed(2)}`
}
