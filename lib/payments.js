// lib/payments.js
import { sydneyTodayStr } from './date.js'
// Single source of truth for booking payment-status semantics across hubs.
//
// bookings.payment_status is one of:
//   'not_required' — the event doesn't require payment (payment_required=false)
//   'pending'      — payment required, not yet received (default for a fresh
//                    booking on a paid event)
//   'submitted'    — resident self-reported paying, EC hasn't confirmed yet
//   'partial'      — EC (or resident self-report) has recorded SOME money
//                    against this booking, but less than the full amount
//                    owed (added 2026-08-11, see Partial_Payment_Scope_
//                    Document_v2). Treated identically to 'pending'/
//                    'submitted' for capacity/waitlist and payment-reminder
//                    purposes (Iain's explicit call) -- a partial payment
//                    does not protect the seat any more than no payment.
//   'confirmed'    — amount_paid >= the full amount owed (an overpayment is
//                    still 'confirmed' -- the excess becomes a refund_due
//                    entry, see below, not a distinct status).
//   'refunded'     — legacy marker from before the refund_due/refund_paid_at
//                    ledger existed. Left valid for backward compatibility
//                    with rows that already carry it; no code path writes
//                    it going forward -- see isRefundIssued().
//
// Convention — do not invert this: a booking counts as PAID only when
// payment_status is exactly 'confirmed'. Everything else ('pending',
// 'partial', 'not_required', null/undefined, or any unexpected value) must
// read as unpaid. This is the inverse of what several call sites
// independently did before 2026-07-07 ("paid unless literally pending"),
// which silently displayed "Paid" for bookings nobody had actually paid —
// see session-summaries/session_summary_2026-07-07.md for the full incident.
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

// Some money has been recorded against this booking, but not the full
// amount owed (2026-08-11). See the module comment above for why this is
// its own status rather than folded into 'pending'.
//
// Second, optional `event` param (2026-08-12, Iain -- Spring Ball 1): a
// self-report on top of an already-partial booking flips payment_status
// to 'submitted' for the new unconfirmed claim, but the EC-confirmed
// amount_paid underneath doesn't stop being partial money just because a
// claim is now sitting on top of it. Without this, every partial-styled
// bit of UI (the EC toggle's blue track, the "Partial" badge, the balance
// line) went blind the moment status moved to 'submitted' and fell back
// to plain Unpaid/Booked -- losing the one thing an EC most needs to see:
// there's already money in. Callers that can't supply `event` (a handful
// of lightweight/derived booking objects with no amount_paid on them)
// keep the old literal-status-only behaviour -- passing event is opt-in,
// never a behaviour change for a caller that omits it.
export function isPartial(booking, event) {
  if (booking?.payment_status === "partial") return true
  if (booking?.payment_status === "submitted" && event) {
    const paid = Number(booking?.amount_paid) || 0
    if (paid <= 0) return false
    const owed = amountOwing(event, booking?.seats || 1)
    return owed > 0 && paid < owed
  }
  return false
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

// The full amount owed for a booking's seats -- event.cost * seats. Single
// place this multiplication happens (2026-08-11) so the EC-recorded-amount
// flow, the resident self-report flow, and paymentSummary can't drift on
// how "owed" is computed.
export function amountOwing(event, seats) {
  const cost = event?.cost ? parseFloat(event.cost) : 0
  return cost * (seats || 1)
}

// Pure derivation of the resulting payment_status from an amount actually
// received vs the amount owed (2026-08-11). Used by both the EC-recorded
// amount (coordinator route's set_payment) and the resident self-report
// (bookings route's mark_payment_submitted uses 'submitted' directly and
// does not call this -- self-report is a distinct status regardless of
// amount, see the module comment). An overpayment (paid > owed) is still
// 'confirmed', never a special status -- the excess is tracked separately
// as a refund_due amount, not as a payment_status value.
export function derivePaymentStatus(amountPaid, owed) {
  const paid = Number(amountPaid) || 0
  if (!owed || owed <= 0) return "not_required"
  if (paid <= 0) return "pending"
  if (paid < owed) return "partial"
  return "confirmed"
}

// "$70.00" for 2 seats at $35/seat — null if the event has no cost set.
export function seatsCost(event, seats) {
  const cost = event?.cost ? parseFloat(event.cost) : null
  if (!cost) return null
  return `$${(cost * (seats || 1)).toFixed(2)}`
}

// Balance-based display (2026-08-11 follow-up, Iain: "we only need to show
// whole dollars as there is never partial dollars involved" -- display
// only, the DB column stays NUMERIC(10,2) and every comparison above still
// uses full precision).
//
// remainingBalance: how much is still owed on a booking given what's
// already on file -- owed minus amount_paid, never negative. This is what
// a partial booking's self-report / EC-record amount input now defaults
// to (instead of the full amount owed), and what a "Partial" status's
// on-screen text shows instead of re-showing the full total as if nothing
// had been paid yet (the bug Iain caught on Spring Ball: "Unpaid $40" when
// $30 was already in). For a booking with nothing paid yet, this equals
// the full amount owed, so callers can use it unconditionally.
export function remainingBalance(booking, event, seats) {
  const owed = amountOwing(event, seats)
  const paid = Number(booking?.amount_paid) || 0
  return Math.max(0, owed - paid)
}

export function wholeDollar(amount) {
  return `$${Math.round(Number(amount) || 0)}`
}

// "$10 of $40" -- balance still owed, of the full amount owed. Used
// wherever a booking's remaining balance needs to be shown rather than
// the full total.
export function balancePhrase(booking, event, seats) {
  const owed = amountOwing(event, seats)
  const balance = remainingBalance(booking, event, seats)
  return `${wholeDollar(balance)} of ${wholeDollar(owed)}`
}

// Reminder-message phrase (2026-08-12 follow-up, Iain): a payment
// reminder used to always say "$40 is still owing" even when $30 of
// that $40 was already in -- restating the FULL amount as if nothing
// had been paid. Balance-aware: "$10 balance to complete the $40
// payment" when something's already on file, otherwise just the plain
// amount when nothing has been paid at all (nothing to "complete" yet).
export function paymentReminderPhrase(booking, event, seats) {
  const owed = amountOwing(event, seats)
  const balance = remainingBalance(booking, event, seats)
  // Both ends are the "nothing meaningful to report as a balance" cases --
  // nothing paid yet (balance === owed) or already fully paid (balance <= 0,
  // defensive -- a fully-paid booking shouldn't be reminded at all).
  if (balance <= 0 || balance >= owed) return `${wholeDollar(owed)} payment`
  return `${wholeDollar(balance)} balance to complete the ${wholeDollar(owed)} payment`
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
//
// "Partial" added 2026-08-11 (Iain, approved explicitly -- see the scope
// doc) as the ONE addition to this previously-closed set of three words.
// It only ever means SHORT -- an overpayment is still "Confirmed" (see
// derivePaymentStatus above), so this set never needs an "Overpaid" word.
const STATUS_STYLE = {
  waitlisted: { bg: "#f1f5f9", color: "#64748b" },
  booked:     { bg: "#fef3c7", color: "#92400e" }, // awaiting payment
  partial:    { bg: "#e0f2fe", color: "#075985" }, // some money in, not enough
  confirmed:  { bg: "#dcfce7", color: "#166534" },
}

export function bookingStatusBadge(booking, event) {
  if (booking?.status === "waitlist") {
    return { label: "Waitlisted", ...STATUS_STYLE.waitlisted }
  }
  if (isPartial(booking, event)) {
    return { label: "Partial", ...STATUS_STYLE.partial }
  }
  if (isAwaitingPayment(booking, event)) {
    return { label: "Booked", ...STATUS_STYLE.booked }
  }
  return { label: "Confirmed", ...STATUS_STYLE.confirmed }
}

// Refund ledger (2026-08-11) -- ONE mechanism for money owed back to a
// resident, whichever of the two ways it arose: an overpayment on a still-
// active confirmed booking, or cancelling a booking that had already been
// paid (in full or partially). refund_paid_at is the date-stamped
// acknowledge-it-was-handed-over flag Iain asked for; refund_due > 0 with
// refund_paid_at still null is a real, reconciles-to-zero "outstanding"
// state. This replaces the old payment_status 'refunded'/'pending' flip,
// which had no amount and no date -- isRefundIssued() below still
// recognises that old marker so a pre-migration row displays correctly,
// but no code writes payment_status = 'refunded' going forward.
export function isRefundIssued(booking) {
  return !!booking?.refund_paid_at || booking?.payment_status === "refunded"
}

export function isRefundPending(booking) {
  return (parseFloat(booking?.refund_due) || 0) > 0 && !isRefundIssued(booking)
}

// Sum of every refund not yet acknowledged as paid out, across whatever
// booking set the caller passes in (one event's bookings, or every booking
// community-wide) -- a genuine "should trend to zero" figure, since both
// refund sources write to the same refund_due/refund_paid_at fields.
export function refundsOutstandingTotal(bookings) {
  return parseFloat((bookings || [])
    .filter(isRefundPending)
    .reduce((sum, b) => sum + (parseFloat(b.refund_due) || 0), 0)
    .toFixed(2))
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
//
// collected/outstanding now compute off amount_paid rather than treating
// every non-refunded booking as either "fully owed" or "fully paid"
// (2026-08-11) -- a partial payment used to vanish into the "unpaid,
// counts as fully outstanding" bucket with no visibility into how much of
// it had actually been collected. An overpayment's excess is deliberately
// EXCLUDED from collectedTotal here (capped at `owed`) -- that money is
// accounted for separately via refund_due, not double-counted as event
// revenue.
export function paymentSummary(confirmedBookings, event, refundPendingBookings) {
  if (!event?.payment_required || !event?.cost) return null
  const cost = parseFloat(event.cost)
  let expectedSeats = 0, collectedTotal = 0, outstandingTotal = 0
  let unpaidCount = 0, submittedCount = 0, partialCount = 0, partialTotal = 0
  for (const b of (confirmedBookings || [])) {
    if (isRefunded(b)) continue
    const seats = b.seats || 1
    const owed = cost * seats
    expectedSeats += seats
    const paid = b.amount_paid != null ? parseFloat(b.amount_paid) || 0 : (isPaid(b) ? owed : 0)
    collectedTotal += Math.min(paid, owed)
    outstandingTotal += Math.max(0, owed - paid)
    if (!isPaid(b)) {
      unpaidCount += 1
      if (isSubmitted(b)) submittedCount += 1
      if (isPartial(b)) { partialCount += 1; partialTotal += paid }
    }
  }
  let refundsDueSeats = 0
  for (const b of (refundPendingBookings || [])) {
    refundsDueSeats += (b.seats || 1)
  }
  return {
    expectedTotal:   parseFloat((cost * expectedSeats).toFixed(2)),
    collectedTotal:  parseFloat(collectedTotal.toFixed(2)),
    outstandingTotal: parseFloat(outstandingTotal.toFixed(2)),
    unpaidCount,
    submittedCount,
    partialCount,
    partialTotal: parseFloat(partialTotal.toFixed(2)),
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
// releases the seat. A 'partial' booking is unpaid for this purpose too
// (2026-08-11, Iain's explicit call) -- isPaid() stays strict to
// 'confirmed', so this already covers it with no extra logic.
export function paymentReminderDue(event, booking, todayStr = sydneyTodayStr()) {
  if (!event?.payment_required || !event?.payment_due_by || !booking) return false
  if (booking?.status && booking.status !== "confirmed") return false
  if (isPaid(booking) || isRefunded(booking)) return false
  if (booking?.payment_reminded_at) return false
  return todayStr >= event.payment_due_by
}
