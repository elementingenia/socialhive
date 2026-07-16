// Unit tests for lib/payments.js paymentReminderDue() — the automatic
// payment-reminder gate (workstream C, feedback round 2026-07-16). Pure logic,
// no DB; guards the single condition the daily payment-due cron fires on.
//
//   npm run test:unit

import { paymentReminderDue } from '../../lib/payments.js'

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

console.log(`\nlib/payments.js paymentReminderDue: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
