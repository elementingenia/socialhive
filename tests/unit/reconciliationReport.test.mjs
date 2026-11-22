// Unit tests for lib/reconciliationReport.js + the ledger helpers it uses
// in lib/payments.js (2026-11-19, state-of-play reconciliation report).
//
//   npm run test:unit

import { buildReconciliationGroups, reconciliationSummaryLines, noteLine, money } from '../../lib/reconciliationReport.js'
import { reconciliationFigures, refundOwed, paymentSummary } from '../../lib/payments.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

const ev = { payment_required: true, cost: 20 }
const nameFor = (b) => b.name

const paid     = { id: 'p', name: 'Bea',  status: 'confirmed', payment_status: 'confirmed', seats: 2, amount_paid: 40, member_id: 'm1' }
const legacy   = { id: 'l', name: 'Al',   status: 'confirmed', payment_status: 'confirmed', seats: 1, amount_paid: null }
const partial  = { id: 'q', name: 'Cat',  status: 'confirmed', payment_status: 'partial',   seats: 2, amount_paid: 15, member_id: 'm3' }
const unpaid   = { id: 'u', name: 'Dan',  status: 'confirmed', payment_status: 'pending',   seats: 1, amount_paid: 0 }
const refunded = { id: 'r0', name: 'Old', status: 'confirmed', payment_status: 'refunded',  seats: 1, amount_paid: 20 }
const refund   = { id: 'r', name: 'Eve',  status: 'cancelled', payment_status: 'partial',   seats: 2, amount_paid: 10, refund_due: 10 }

// ── reconciliationFigures ─────────────────────────────────────────────────
let f = reconciliationFigures(paid, ev)
ok(f.due === 40 && f.paid === 40 && f.owing === 0, 'paid in full: 40/40/0')
f = reconciliationFigures(legacy, ev)
ok(f.due === 20 && f.paid === 20 && f.owing === 0, 'legacy confirmed with null amount_paid counts as paid in full')
f = reconciliationFigures(partial, ev)
ok(f.due === 40 && f.paid === 15 && f.owing === 25, 'partial: 40 due, 15 paid, 25 owing')
f = reconciliationFigures({ ...paid, amount_paid: 50 }, ev)
ok(f.owing === 0, 'overpayment never shows negative owing')

// ── refundOwed: ledger figure, not cost x seats ───────────────────────────
ok(refundOwed(refund, ev) === 10, 'refund owed uses refund_due (10), not cost x seats (40)')
ok(refundOwed({ seats: 2, refund_due: null }, ev) === 40, 'no ledger figure falls back to cost x seats')

// ── paymentSummary agrees with the per-row figures ────────────────────────
const confirmed = [paid, legacy, partial, unpaid, refunded]
const s = paymentSummary(confirmed, ev, [refund])
ok(s.expectedTotal === 120, `expected 120 (got ${s.expectedTotal})`)
ok(s.collectedTotal === 75, `collected 75 (got ${s.collectedTotal})`)
ok(s.outstandingTotal === 45, `outstanding 45 (got ${s.outstandingTotal})`)
ok(s.refundsDueTotal === 10, `refunds due 10 from the ledger (got ${s.refundsDueTotal})`)

// ── groups ────────────────────────────────────────────────────────────────
const notesByBooking = {
  q: [
    { amount: 15, note: 'Cash', recorded_at: '2026-11-12T01:00:00Z', recorded_by: 'ec1', by_name: 'Jane' },
    { amount: 5, note: "I've paid", recorded_at: '2026-11-13T01:00:00Z', recorded_by: 'm3', by_name: 'Cat' },
  ],
}
const groups = buildReconciliationGroups({ confirmed: [...confirmed, { id: 'w', name: 'Wait', status: 'waitlist' }].filter(b => b.status === 'confirmed'), refundPending: [refund], event: ev, nameFor, notesByBooking })
ok(groups.map(g => g.heading).join('|') === 'Paid|Unpaid|Partial|Refunds owed', 'group order Paid, Unpaid, Partial, Refunds owed')
const [gPaid, gUnpaid, gPartial, gRefund] = groups
ok(gPaid.rows.map(r => r.name).join(',') === 'Al,Bea', 'paid rows A-Z, refunded booking excluded')
ok(gPaid.totals.due === 60 && gPaid.totals.paid === 60 && gPaid.totals.owing === 0, 'paid totals 60/60/0')
ok(gUnpaid.rows.length === 1 && gUnpaid.totals.owing === 20, 'unpaid total owing 20')
ok(gPartial.rows[0].owing === 25 && gPartial.totals.paid === 15, 'partial row 25 owing, total paid 15')
ok(gPartial.rows[0].notes.length === 2, 'partial row carries both notes')
ok(gPartial.rows[0].notes[0].includes('recorded by Jane') && gPartial.rows[0].notes[0].includes('$15.00'), 'coordinator note reads "recorded by"')
ok(gPartial.rows[0].notes[1].includes('reported by Cat'), "resident's own note reads \"reported by\"")
ok(gRefund.rows[0].refund === 10 && gRefund.rows[0].paid === 10, 'refund row 10 paid, 10 owed')
ok(gPartial.columns.map(c => c.label).join(',') === 'Name,Seats,Due,Paid,Owing', 'payment columns Name/Seats/Due/Paid/Owing')
ok(gUnpaid.rows[0].notes.length === 0, 'no notes, no lines')

// free bus-driver seat skipped
const busEv = { ...ev, has_bus: true, bus_driver_id: 'drv', bus_driver_free: true }
const drv = { id: 'd', name: 'Driver', status: 'confirmed', payment_status: 'pending', seats: 1, member_id: 'drv' }
const g2 = buildReconciliationGroups({ confirmed: [drv], refundPending: [], event: busEv, nameFor })
ok(g2.every(g => g.rows.length === 0), 'free bus-driver seat not listed')

// ── summary lines + helpers ───────────────────────────────────────────────
const lines = reconciliationSummaryLines(s)
ok(lines.map(l => l.label).join(',') === 'Expected,Collected,Outstanding,Refunds owed', 'summary lines incl. refunds owed')
ok(reconciliationSummaryLines(null).length === 0, 'no summary, no lines')
ok(money(7.5) === '$7.50', 'money formats 2dp')
ok(noteLine({ note: 'x' }) === 'x', 'note with only text')
ok(noteLine({ amount: 0, note: 'Adjusted', recorded_at: '2026-11-12T01:00:00Z' }).startsWith('12 Nov · Adjusted'), 'zero amount omitted, Sydney date')

console.log(`reconciliationReport: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
