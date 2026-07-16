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

// A resident has self-flagged that they paid (idea 2 of the EC payment
// model, 2026-07-12), but the EC has not yet confirmed it. This does NOT
// count as paid -- isPaid() stays strict to 'confirmed' -- it's purely a
// visibility signal so the EC knows to check and confirm rather than
// chase a payment that's already in flight. Per Iain: the booking badge
// stays "Booked" throughout; UI should surface this as secondary text,
// not a new badge state.
export function isSubmitted(booking) {
  return booking?.payment_status === "submitted"
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

// Canonical booking status word + colour pair. Per Iain (2026-07-08): a
// confirmed-seat booking on a paid event reads "Booked" until an EC marks
// it paid, then "Confirmed" — the SAME two words everywhere, not a
// screen-specific paraphrase. Before this, Home said "Unpaid", the Social
// event card said "Pending"/"Going", the coordinator view said
// "booked"/"confirmed" lowercase mid-sentence, and the Scheduled tab
// (bookings/page.js) didn't distinguish at all — always "Confirmed"
// regardless of payment, because it never called into the earlier
// isAwaitingPayment fix. Every screen must render through this function,
// not hand-roll its own label/colour ternary.
const STATUS_STYLE = {
  waitlisted: { bg: "#f1f5f9", color: "#64748b" },
  booked:     { bg: "#fef3c7", color: "#92400e" }, // awaiting payment
  confirmed:  { bg: "#dcfce7", color: "#166534" },
}

export function bookingStatusBadge(booking, event) {
  if (booking?.status === "waitlist") {
    return { label: "Waitlisted", ...STATUS_STYLE.waitlisted }
  }
  if (isAwaitingPayment(booking, event)) {
    return { label: "Booked", ...STATUS_STYLE.booked }
  }
  return { label: "Confirmed", ...STATUS_STYLE.confirmed }
}

// Per-event payment reconciliation summary (2026-07-12) -- expected vs
// collected vs outstanding, computed live from existing confirmed bookings
// rather than a separate ledger. Only meaningful for payment_required
// events; returns null otherwise so callers can skip rendering entirely.
//
// refundPendingBookings (2026-07-14): cancelled bookings that were paid
// before being cancelled, still awaiting a refund. Previously these were
// silently excluded from the summary entirely (isRefunded(b) skips actual
// refunded rows, but a *pending* refund isn't "refunded" yet -- it's a
// cancelled+still-confirmed-payment row, which this function never saw
// because callers only ever passed it active bookings). Iain hit this
// directly on Bastille Day: a refund was due and nothing in the summary
// showed it. Passing the refund-pending list in explicitly surfaces it as
// its own total instead of it just not existing anywhere.
export function paymentSummary(confirmedBookings, event, refundPendingBookings) {
  if (!event?.payment_required || !event?.cost) return null
  const cost = parseFloat(event.cost)
  let expectedSeats = 0, collectedSeats = 0, unpaidCount = 0, submittedCount = 0
  for (const b of (confirmedBookings || [])) {
    if (isRefunded(b)) continue
    const seats = b.seats || 1
    expectedSeats += seats
    if (isPaid(b)) collectedSeats += seats
    else {
      unpaidCount += 1
      if (isSubmitted(b)) submittedCount += 1
    }
  }
  let refundsDueSeats = 0
  for (const b of (refundPendingBookings || [])) {
    refundsDueSeats += (b.seats || 1)
  }
  return {
    expectedTotal:   parseFloat((cost * expectedSeats).toFixed(2)),
    collectedTotal:  parseFloat((cost * collectedSeats).toFixed(2)),
    outstandingTotal: parseFloat((cost * (expectedSeats - collectedSeats)).toFixed(2)),
    unpaidCount,
    submittedCount,
    refundsDueTotal: parseFloat((cost * refundsDueSeats).toFixed(2)),
    refundsDueCount: (refundPendingBookings || []).length,
  }
}

// Reconciliation staleness (2026-07-14): the "Reconciled DD Mon YYYY by
// Name" stamp (migration 037) is deliberately re-runnable, never a lock
// (see 037's own migration comment) -- but the stamp alone can't tell an EC
// whether anything has actually happened since they last looked. Compares
// payments_reconciled_at against the most recent booking activity
// (bookings.updated_at, migration 040 -- falls back to booked_at for any
// row from before that column existed) across EVERY booking on the event,
// active or cancelled, since a cancellation-with-refund-due is exactly the
// kind of change that needs to surface here. Returns false if the event
// has never been reconciled at all (nothing to compare against yet -- that
// is a different, unreconciled state, not a "stale" one).
export function reconciliationIsStale(event, allBookings) {
  if (!event?.payments_reconciled_at) return false
  const reconciledAt = new Date(event.payments_reconciled_at).getTime()
  for (const b of (allBookings || [])) {
    const touched = new Date(b.updated_at || b.booked_at).getTime()
    if (touched > reconciledAt) return true
  }
  return false
}

// Automatic payment-reminder gate (workstream C, 2026-07-16). True when a
// confirmed booking on a paid event with a payment_due_by is unpaid, the due
// date has arrived/passed, and it hasn't already been auto-reminded. Pure
// logic so app/api/cron/payment-due-check can stay thin and this stays
// unit-testable. Decision #3: this only drives a reminder (a flag) -- it never
// releases the seat.
export function paymentReminderDue(event, booking, todayStr = new Date().toISOString().slice(0, 10)) {
  if (!event?.payment_required || !event?.payment_due_by || !booking) return false
  if (booking?.status && booking.status !== "confirmed") return false
  if (isPaid(booking) || isRefunded(booking)) return false
  if (booking?.payment_reminded_at) return false
  return todayStr >= event.payment_due_by
}
