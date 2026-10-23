// Unit tests for lib/hiveFunds.js — Hive Funds ledger sums (2026-10-23).
//   npm run test:unit

import {
  canSeeFund, canEditEvent, canManageFund, eventMoney, eventFigures, fundsHeld,
  fundSummary, eventCarry, openingFromCashCount, parseAmount, fmtMoney, eventCounts,
  bookingRefundOwed, isValidAudience,
} from '../../lib/hiveFunds.js'

let pass = 0, fail = 0
const ok = (cond, m) => { cond ? pass++ : (fail++, console.log('  ✗', m)) }
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

// ── Visibility ────────────────────────────────────────────────────────────
ok(!canSeeFund('off', { isAdmin: true }), 'off hides from admins')
ok(canSeeFund('managers', { isAdmin: true }), 'managers: admin sees')
ok(canSeeFund('managers', { isOwner: true }), 'managers: owner sees')
ok(canSeeFund('managers', { isEC: true }), 'managers: EC sees')
ok(!canSeeFund('managers', {}), 'managers: resident does not')
ok(canSeeFund('all', {}), 'all: resident sees')
ok(!canSeeFund('bogus', { isAdmin: true }), 'unknown audience hides')
ok(isValidAudience('all') && !isValidAudience('everyone'), 'audience validation')
ok(canEditEvent({ isEventEC: true }) && !canEditEvent({}), 'event EC can edit, resident cannot')
ok(canManageFund({ isOwner: true }) && !canManageFund({ isEventEC: true }), 'EC cannot manage fund')

// ── Collected / refunds from bookings ─────────────────────────────────────
const ev = { id: 'e1', event_date: '2026-11-10', payment_required: true, cost: '20' }
const bookings = [
  { status: 'confirmed', seats: 2, payment_status: 'confirmed', amount_paid: 40 },
  { status: 'confirmed', seats: 1, payment_status: 'partial', amount_paid: 10 },
  { status: 'confirmed', seats: 1, payment_status: 'confirmed', amount_paid: 30, refund_due: 10 }, // overpaid
  { status: 'confirmed', seats: 1, payment_status: 'pending', amount_paid: 0 },
  { status: 'cancelled', seats: 1, payment_status: 'confirmed', amount_paid: 20, refund_due: 20 },
  { status: 'cancelled', seats: 1, payment_status: 'confirmed', amount_paid: 20, refund_due: 20, refund_paid_at: '2026-11-01' },
  { status: 'waitlist', seats: 1, payment_status: 'pending', amount_paid: 0 },
]
eq(eventMoney(ev, bookings), { collected: 70, refundsOwed: 30 }, 'collected capped at owed; refunds owed excludes paid refunds')
eq(eventMoney({ ...ev, payment_required: false }, bookings).collected, 0, 'free event collects nothing')
eq(bookingRefundOwed({ refund_due: 5, payment_status: 'refunded' }), 0, 'legacy refunded counts as paid')

// ── Event figures ─────────────────────────────────────────────────────────
const lines = [
  { id: 'o', kind: 'opening', amount: 420, entry_date: '2026-11-01', created_at: '2026-11-01T00:00:00Z' },
  { id: 'x1', kind: 'expense', amount: 250, event_id: 'e1', entry_date: '2026-11-05', created_at: '2026-11-05T00:00:00Z' },
  { id: 'x2', kind: 'expense', amount: 60, event_id: 'e1', entry_date: '2026-11-04', created_at: '2026-11-04T00:00:00Z' },
  { id: 'x3', kind: 'expense', amount: 999, event_id: 'e1', entry_date: '2026-11-04', created_at: '2026-11-04T00:00:00Z', deleted_at: '2026-11-04T01:00:00Z' },
]
const f1 = eventFigures({ event: ev, bookings, lines, finance: { adjustment: 40, adjustment_note: 'Door cash' } })
eq(f1.outgoingsTotal, 310, 'outgoings sum, deleted line excluded')
eq(f1.outgoings.map(l => l.id), ['x2', 'x1'], 'outgoings sorted by date')
eq(f1.result, 70 + 40 - 310, 'result = collected + adjustment - outgoings')
ok(!f1.finalised, 'not finalised')

const f1final = eventFigures({ event: ev, bookings, lines, finance: { adjustment: 40, finalised_at: '2026-11-20T00:00:00Z', collected_snapshot: 360 } })
eq(f1final.collected, 360, 'finalised uses the snapshot, not live')
eq(f1final.liveCollected, 70, 'live figure still reported')
eq(f1final.result, 90, 'worked example: 360 + 40 - 310 = 90')

// ── Fund summary ──────────────────────────────────────────────────────────
const between = [
  ...lines,
  { id: 'b1', kind: 'expense', amount: 89, entry_date: '2026-11-21', created_at: '2026-11-21T00:00:00Z' },
  { id: 'b2', kind: 'income', amount: 200, entry_date: '2026-11-22', created_at: '2026-11-22T00:00:00Z' },
]
const ev2 = { id: 'e2', event_date: '2026-12-15', payment_required: true, cost: '25' }
const b2 = [{ status: 'confirmed', seats: 4, payment_status: 'confirmed', amount_paid: 100 }]
const lines2 = [...between, { id: 'x4', kind: 'expense', amount: 30, event_id: 'e2', entry_date: '2026-11-25', created_at: '2026-11-25T00:00:00Z' }]
const items = [
  { event: ev, figures: eventFigures({ event: ev, bookings: [], lines: lines2, finance: { adjustment: 40, finalised_at: '2026-11-20T00:00:00Z', collected_snapshot: 360 } }) },
  { event: ev2, figures: eventFigures({ event: ev2, bookings: b2, lines: lines2, finance: null }) },
]
const s = fundSummary(lines2, items)
eq(s.fundsHeld, 420 + 90 - 89 + 200, 'funds held = opening + finalised result + between lines')
eq(s.collected, 100, 'collected only from in-progress events')
eq(s.spent, 30, 'spent only from in-progress events')
eq(s.balance, 621 + 100 - 30, 'balance = held + collected - spent')
eq(s.inProgressCount, 1, 'one in progress')
eq(s.refundsOwed, 0, 'no refunds')

// Refunds owed: not subtracted from balance, added to cash held
const ev3 = { id: 'e3', event_date: '2026-12-20', payment_required: true, cost: '20' }
const items3 = [{ event: ev3, figures: eventFigures({ event: ev3, bookings: [{ status: 'cancelled', seats: 1, payment_status: 'confirmed', amount_paid: 20, refund_due: 20 }], lines: [], finance: null }) }]
const s3 = fundSummary([lines[0]], items3)
eq(s3.balance, 420, 'refund owed does not change the Hive balance')
eq(s3.cashHeld, 440, 'cash held includes refunds owed')

// No opening
eq(fundSummary([], []).hasOpening, false, 'no opening reported')

// ── Carry forward ─────────────────────────────────────────────────────────
const carry1 = eventCarry(lines2, items, items[0].figures)
eq(carry1, { before: 420, carriedForward: 510 }, 'finalised event: before = held just before finalising')
const carry2 = eventCarry(lines2, items, items[1].figures)
eq(carry2.before, 621, 'in-progress event: before = funds held now')
eq(carry2.carriedForward, 621 + 70, 'in-progress carry = held + result')
eq(fundsHeld(lines2, items, '2026-11-21T12:00:00Z'), 420 + 90 - 89, 'as-of cutoff excludes later lines')

// ── Counting window ───────────────────────────────────────────────────────
ok(eventCounts({ event_date: '2026-11-01' }, lines[0]), 'event on opening date counts')
ok(!eventCounts({ event_date: '2026-10-31' }, lines[0]), 'earlier event excluded')
ok(!eventCounts({ event_date: '2026-11-05' }, null), 'nothing counts without opening')

// ── Starting balance from cash count ──────────────────────────────────────
eq(openingFromCashCount(650, 200, 30), 420, 'cash 650 - collected 200 - refunds 30')
eq(openingFromCashCount(0.3, 0.1, 0.1), 0.1, 'no float drift')

// ── Parsing / formatting ──────────────────────────────────────────────────
eq(parseAmount('$1,234.567'), 1234.57, 'parse strips $ and commas, rounds')
eq(parseAmount('-5'), null, 'negative rejected by default')
eq(parseAmount('-5', { allowNegative: true }), -5, 'negative allowed for adjustment')
eq(parseAmount('0'), null, 'zero rejected by default')
eq(parseAmount('0', { allowZero: true }), 0, 'zero allowed when asked')
eq(parseAmount('abc'), null, 'junk rejected')
eq(parseAmount(''), null, 'empty rejected')
eq(fmtMoney(1234.5), '$1,234.50', 'format')
eq(fmtMoney(-15), '-$15.00', 'negative format')

console.log(`hiveFunds: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
