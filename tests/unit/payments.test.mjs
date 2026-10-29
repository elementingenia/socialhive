// Unit tests for lib/payments.js paymentReminderDue() — the automatic
// payment-reminder gate (workstream C, feedback round 2026-07-16). Pure logic,
// no DB; guards the single condition the daily payment-due cron fires on.
//
//   npm run test:unit

import {
  freeSeatsFor, payableSeats, isAwaitingPayment, sumUnpaidSeats,
  paymentReminderDue, isPartial, isPaid, amountOwing, derivePaymentStatus,
  bookingStatusBadge, paymentSummary, isRefundPending, isRefundIssued, refundsOutstandingTotal,
  remainingBalance, wholeDollar, balancePhrase, paymentReminderPhrase,
} from '../../lib/payments.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

const paidEvent = { payment_required: true, cost: 25, payment_due_by: '2026-07-20' }
const today = '2026-07-20'
const confirmedUnpaid = { status: 'confirmed', payment_status: 'pending', payment_reminded_at: null }

// fires
ok(paymentReminderDue(paidEvent, confirmedUnpaid, today) === true, 'due today, confirmed, unpaid, not reminded => fire')
ok(paymentReminderDue(paidEvent, confirmedUnpaid, '2026-07-25') === true, 'overdue => fire')

// does not fire
ok(paymentReminderDue(paidEvent, confirmedUnpaid, '2026-07-19') === false, 'before due date => no fire')
ok(paymentReminderDue(paidEvent, { ...confirmedUnpaid, payment_status: 'confirmed' }, today) === false, 'already paid => no fire')
ok(paymentReminderDue(paidEvent, { ...confirmedUnpaid, payment_status: 'refunded' }, today) === false, 'refunded => no fire')
ok(paymentReminderDue(paidEvent, { ...confirmedUnpaid, payment_reminded_at: '2026-07-20T09:00:00Z' }, today) === false, 'already reminded => no fire (once-only)')
ok(paymentReminderDue(paidEvent, { ...confirmedUnpaid, status: 'waitlist' }, today) === false, 'waitlisted => no fire')
ok(paymentReminderDue({ ...paidEvent, payment_due_by: null }, confirmedUnpaid, today) === false, 'no due date set => no fire')
ok(paymentReminderDue({ ...paidEvent, payment_required: false }, confirmedUnpaid, today) === false, 'free event => no fire')
ok(paymentReminderDue(null, confirmedUnpaid, today) === false, 'null event => no fire, no crash')
ok(paymentReminderDue(paidEvent, null, today) === false, 'null booking => no fire, no crash')

// submitted-but-not-confirmed still owes (isSubmitted !== paid) — should still fire
ok(paymentReminderDue(paidEvent, { ...confirmedUnpaid, payment_status: 'submitted' }, today) === true, 'self-submitted but not EC-confirmed => still fire')

// A partial payment is unpaid for reminder purposes too (2026-08-11, Iain's
// explicit call -- no leniency just because some money came in).
ok(paymentReminderDue(paidEvent, { ...confirmedUnpaid, payment_status: 'partial' }, today) === true, 'partial payment => still fire, same as fully unpaid')

console.log(`\nlib/payments.js paymentReminderDue: ${pass} passed, ${fail} failed`)

// ── derivePaymentStatus (2026-08-11) ─────────────────────────────────────────
let pass2 = 0, fail2 = 0
const ok2 = (cond, msg) => { cond ? pass2++ : (fail2++, console.log('  ✗', msg)) }

ok2(derivePaymentStatus(0, 50) === 'pending', '$0 of $50 => pending')
ok2(derivePaymentStatus(30, 50) === 'partial', '$30 of $50 => partial (short)')
ok2(derivePaymentStatus(50, 50) === 'confirmed', 'exact amount => confirmed')
ok2(derivePaymentStatus(70, 50) === 'confirmed', 'overpayment => still confirmed, never a distinct status')
ok2(derivePaymentStatus(-10, 50) === 'pending', 'negative treated as nothing received => pending')
ok2(derivePaymentStatus(30, 0) === 'not_required', 'nothing owed => not_required, defensive')
ok2(derivePaymentStatus(30, null) === 'not_required', 'null owed => not_required, defensive')

// ── amountOwing (2026-08-11) ─────────────────────────────────────────────────
ok2(amountOwing({ cost: 25 }, 2) === 50, '$25/seat x 2 seats = $50')
ok2(amountOwing({ cost: 25 }, undefined) === 25, 'seats defaults to 1')
ok2(amountOwing({ cost: null }, 2) === 0, 'no cost set => 0')
ok2(amountOwing(null, 2) === 0, 'null event => 0, no crash')

// ── isPartial / isPaid (2026-08-11) ──────────────────────────────────────────
ok2(isPartial({ payment_status: 'partial' }) === true, 'partial status detected')
ok2(isPartial({ payment_status: 'confirmed' }) === false, 'confirmed is not partial')
ok2(isPaid({ payment_status: 'partial' }) === false, 'partial never counts as paid -- isPaid stays strict')

// ── isPartial(booking, event): survives a 'submitted' claim on top of an
// already-partial booking (2026-08-12, Spring Ball 1) ────────────────────────
const partialEventFor30 = { payment_required: true, cost: 40 }
ok2(isPartial({ payment_status: 'submitted', amount_paid: 25, seats: 1 }, partialEventFor30) === true,
  'submitted claim on top of a $25/$40 partial booking still reads as partial when event is supplied')
ok2(isPartial({ payment_status: 'submitted', amount_paid: 0, seats: 1 }, partialEventFor30) === false,
  'a fresh submitted claim with $0 on file (no prior partial payment) is NOT partial')
ok2(isPartial({ payment_status: 'submitted', amount_paid: 40, seats: 1 }, partialEventFor30) === false,
  'submitted claim that already fully covers the amount owed is not partial (would be Confirmed once an EC accepts it)')
ok2(isPartial({ payment_status: 'submitted', amount_paid: 25, seats: 1 }) === false,
  'without an event argument, falls back to the old literal-status-only check (backward compatible)')

// ── bookingStatusBadge: "Partial" is the one addition to the closed set ─────
const paidEventBadge = { payment_required: true, cost: 25 }
ok2(bookingStatusBadge({ status: 'confirmed', payment_status: 'partial' }, paidEventBadge).label === 'Partial', 'partial booking => "Partial" badge')
ok2(bookingStatusBadge({ status: 'confirmed', payment_status: 'confirmed' }, paidEventBadge).label === 'Confirmed', 'overpaid-but-confirmed booking => "Confirmed", never "Overpaid"')
ok2(bookingStatusBadge({ status: 'confirmed', payment_status: 'pending' }, paidEventBadge).label === 'Booked', 'fully unpaid => "Booked"')
ok2(bookingStatusBadge({ status: 'waitlist' }, paidEventBadge).label === 'Waitlisted', 'waitlisted takes priority over payment state')

// ── refund ledger: isRefundPending / isRefundIssued / refundsOutstandingTotal ─
ok2(isRefundPending({ refund_due: 10, refund_paid_at: null }) === true, 'refund_due > 0, not yet paid out => pending')
ok2(isRefundPending({ refund_due: 0, refund_paid_at: null }) === false, 'no refund owed => not pending')
ok2(isRefundPending({ refund_due: 10, refund_paid_at: '2026-08-01T00:00:00Z' }) === false, 'already paid out => not pending')
ok2(isRefundIssued({ refund_paid_at: '2026-08-01T00:00:00Z' }) === true, 'refund_paid_at set => issued')
ok2(isRefundIssued({ payment_status: 'refunded' }) === true, 'legacy payment_status=refunded marker still recognised as issued (backward compat)')
ok2(isRefundIssued({ refund_due: 10, refund_paid_at: null }) === false, 'pending refund is not yet issued')

const refundBookings = [
  { refund_due: 10, refund_paid_at: null },      // outstanding
  { refund_due: 15, refund_paid_at: null },      // outstanding
  { refund_due: 20, refund_paid_at: '2026-08-01T00:00:00Z' }, // already paid out, excluded
  { refund_due: 0, refund_paid_at: null },       // nothing owed, excluded
]
ok2(refundsOutstandingTotal(refundBookings) === 25, 'sums only unpaid-out refunds: 10 + 15 = 25, excludes the issued and zero rows')
ok2(refundsOutstandingTotal([]) === 0, 'empty list => 0')
ok2(refundsOutstandingTotal(undefined) === 0, 'undefined => 0, no crash')

// ── paymentSummary: partial + amount-based collected/outstanding (2026-08-11) ─
const summaryEvent = { payment_required: true, cost: 50 }
const summaryBookings = [
  { seats: 1, payment_status: 'confirmed', amount_paid: 50 },   // fully paid
  { seats: 1, payment_status: 'partial',   amount_paid: 30 },   // $30 of $50
  { seats: 1, payment_status: 'pending',   amount_paid: 0 },    // nothing paid
  { seats: 1, payment_status: 'confirmed', amount_paid: 70 },   // overpaid $20 (excess excluded from collectedTotal)
]
const s = paymentSummary(summaryBookings, summaryEvent, [])
ok2(s.expectedTotal === 200, 'expected: 4 seats x $50 = $200')
// collected: 50 (full) + 30 (partial) + 0 (pending) + 50 (overpaid capped at owed) = 130
ok2(s.collectedTotal === 130, `collected caps the overpaid row at what was owed, not the extra $20 -- got ${s.collectedTotal}`)
// outstanding: 0 + 20 (50-30) + 50 (50-0) + 0 = 70
ok2(s.outstandingTotal === 70, `outstanding reflects actual shortfall per booking -- got ${s.outstandingTotal}`)
ok2(s.partialCount === 1, 'exactly one partial booking')
ok2(s.partialTotal === 30, 'partialTotal is the amount actually received on partial bookings')
ok2(s.unpaidCount === 2, 'unpaid count = partial + pending (overpaid one is fully paid, excluded)')
ok2(paymentSummary([], { payment_required: false, cost: 50 }, []) === null, 'payment not required => null, nothing to render')

// -- remainingBalance / wholeDollar / balancePhrase (2026-08-11 follow-up,
//    Iain -- Spring Ball: a Partial booking's screens were re-showing the
//    FULL amount owed as "Unpaid $X" even though some money was already
//    in, instead of the actual balance still owing). --------------------
const balEvent = { cost: 40 }
ok2(remainingBalance({ amount_paid: 30 }, balEvent, 1) === 10, '$30 paid of $40 owed => $10 balance')
ok2(remainingBalance({ amount_paid: 0 }, balEvent, 1) === 40, 'nothing paid => balance is the full amount owed')
ok2(remainingBalance({ amount_paid: 40 }, balEvent, 1) === 0, 'fully paid => $0 balance')
ok2(remainingBalance({ amount_paid: 55 }, balEvent, 1) === 0, 'overpaid => balance floors at $0, never negative')
ok2(remainingBalance(null, balEvent, 1) === 40, 'no booking (fresh) => balance is the full amount owed, no crash')
ok2(remainingBalance({ amount_paid: 30 }, balEvent, 2) === 50, '2 seats: $30 paid of $80 owed => $50 balance')

ok2(wholeDollar(10.4) === '$10', 'rounds down to whole dollars, no cents shown')
ok2(wholeDollar(10.6) === '$11', 'rounds up to whole dollars')
ok2(wholeDollar(undefined) === '$0', 'undefined => $0, no crash')
ok2(wholeDollar('30') === '$30', 'accepts a numeric string (as sent from a form input)')

ok2(balancePhrase({ amount_paid: 30 }, balEvent, 1) === '$10 of $40', 'balance phrase: $10 still owing of $40 total')
ok2(balancePhrase({ amount_paid: 0 }, balEvent, 1) === '$40 of $40', 'nothing paid yet: balance equals the full amount owed')

// -- paymentReminderPhrase (2026-08-12 follow-up, Iain -- Spring Ball 2:
//    a reminder used to always restate the FULL amount as still owing,
//    even when some of it was already paid). -------------------------
ok2(paymentReminderPhrase({ amount_paid: 0 }, balEvent, 1) === '$40 payment', 'nothing paid yet: plain amount, no balance language')
ok2(paymentReminderPhrase({ amount_paid: 30 }, balEvent, 1) === '$10 balance to complete the $40 payment', '$30 of $40 already in: balance-aware phrase')
ok2(paymentReminderPhrase({ amount_paid: 40 }, balEvent, 1) === '$40 payment', 'fully paid: falls back to plain amount (should not be reminded anyway)')

// -- Driver doesn't pay (migration 145, Iain 2026-10-29) -----------------
const drvEvent = { payment_required: true, cost: 40, has_bus: true, bus_driver_id: 'd', bus_driver_free: true }
const drvSolo  = { member_id: 'd', seats: 1, status: 'confirmed', payment_status: 'pending', amount_paid: 0 }
const drvParty = { member_id: 'd', seats: 3, status: 'confirmed', payment_status: 'pending', amount_paid: 0 }
const other    = { member_id: 'x', seats: 2, status: 'confirmed', payment_status: 'pending', amount_paid: 0 }
ok2(freeSeatsFor(drvSolo, drvEvent) === 1, 'driver gets one free seat')
ok2(freeSeatsFor(other, drvEvent) === 0, 'non-driver gets no free seat')
ok2(freeSeatsFor(drvSolo, { ...drvEvent, bus_driver_free: false }) === 0, 'toggle off: driver pays')
ok2(freeSeatsFor(drvSolo, { ...drvEvent, has_bus: false }) === 0, 'bus off: no free seat')
ok2(payableSeats(drvParty, drvEvent) === 2, 'driver party of 3: 2 seats pay')
ok2(payableSeats(drvSolo, drvEvent) === 0, 'driver alone: nothing to pay')
ok2(remainingBalance(drvParty, drvEvent, 3) === 80, 'driver party balance excludes driver seat')
ok2(remainingBalance(drvSolo, drvEvent, 1) === 0, 'solo driver owes nothing')
ok2(isAwaitingPayment(drvSolo, drvEvent) === false, 'solo free driver is not awaiting payment')
ok2(isAwaitingPayment(drvParty, drvEvent) === true, 'driver with paying party still awaits payment')
ok2(bookingStatusBadge(drvSolo, drvEvent).label === 'Confirmed', 'solo free driver badge reads Confirmed')
ok2(sumUnpaidSeats([drvSolo, other], drvEvent) === 2, 'unpaid seats skip the free driver seat')
{
  const sum = paymentSummary([drvParty, other], drvEvent, [])
  ok2(sum.expectedTotal === 160 && sum.outstandingTotal === 160, 'summary: 2 driver-party seats + 2 others = $160')
  const solo = paymentSummary([drvSolo], drvEvent, [])
  ok2(solo.expectedTotal === 0 && solo.unpaidCount === 0, 'summary: solo free driver expects nothing')
}
ok2(paymentReminderDue({ ...drvEvent, payment_due_by: '2026-01-01' }, drvSolo, '2026-02-01') === false, 'no reminder for a solo free driver')
ok2(amountOwing(drvEvent, 0) === 0, 'amountOwing: 0 seats owes 0')
ok2(amountOwing(drvEvent, undefined) === 40, 'amountOwing: missing seats defaults to 1')

console.log(`lib/payments.js (partial payments + refund ledger): ${pass2} passed, ${fail2} failed`)

const totalFail = fail + fail2
process.exit(totalFail ? 1 : 0)
