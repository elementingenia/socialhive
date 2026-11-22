// lib/reconciliationReport.js
//
// Builds the Payment Reconciliation PDF's content (2026-11-19, Iain): a
// state-of-play report a coordinator can run any time -- every confirmed
// attendee grouped Paid / Unpaid / Partial, each with Due / Paid / Owing,
// a totals row per group, refunds owed last, and each booking's payment
// notes (who recorded what, when) as a small line under the person.
//
// One builder for every hub (Show Time, Social, Special Events, Groups &
// Clubs). Each used to build its own rows and they had drifted: Show Time
// priced refunds at cost x seats instead of the refund actually owed, and
// Clubs printed "You" for the coordinator's own row.
//
// Pure: no DB, no React. Waitlisted bookings are deliberately left out --
// nothing is due from them yet (Iain, 2026-11-19).

import {
  reconciliationFigures, refundOwed, payableSeats,
  isPaid, isPartial, isRefunded,
} from "./payments.js"

export function money(n) {
  return `$${(Number(n) || 0).toFixed(2)}`
}

// One payment-note line, e.g.
//   "12 Nov · $20.00 · Paid cash at the door — recorded by Jane Smith"
// A note the resident logged themselves (recorded_by is the booking's own
// member) reads "reported by", since it's their claim, not a confirmed
// payment. by_name comes resolved from /api/coordinator/payment-notes.
export function noteLine(n, bookingMemberId) {
  const parts = []
  if (n?.recorded_at) {
    parts.push(new Date(n.recorded_at).toLocaleDateString("en-AU", {
      timeZone: "Australia/Sydney", day: "numeric", month: "short",
    }))
  }
  if (n?.amount != null && Number(n.amount) > 0) parts.push(money(n.amount))
  if (n?.note) parts.push(String(n.note))
  let line = parts.join(" · ")
  if (n?.by_name) {
    const verb = bookingMemberId && n.recorded_by === bookingMemberId ? "reported by" : "recorded by"
    line += `${line ? " — " : ""}${verb} ${n.by_name}`
  }
  return line
}

const PAY_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "seats", label: "Seats", align: "right" },
  { key: "due", label: "Due", align: "right", money: true },
  { key: "paid", label: "Paid", align: "right", money: true },
  { key: "owing", label: "Owing", align: "right", money: true },
]
const REFUND_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "seats", label: "Seats", align: "right" },
  { key: "paid", label: "Paid", align: "right", money: true },
  { key: "refund", label: "Refund owed", align: "right", money: true },
]

function totalsFor(rows, columns) {
  const t = { name: "Total" }
  for (const c of columns) {
    if (c.money || c.key === "seats") t[c.key] = rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0)
  }
  return t
}

/**
 * @param {object} p
 * @param {Array} p.confirmed       confirmed bookings for the event
 * @param {Array} p.refundPending   bookings with a refund still owed
 * @param {object} p.event          needs cost, payment_required, and the bus
 *                                  fields payableSeats() reads
 * @param {(b)=>string} p.nameFor   real-name resolver (report is for managers)
 * @param {object} [p.notesByBooking] { [booking_id]: [{amount, note,
 *                                  recorded_at, recorded_by, by_name}] }
 * @returns {Array} groups in print order: Paid, Unpaid, Partial, Refunds owed
 *                    (Iain's original ordering, 2026-09-15)
 */
export function buildReconciliationGroups({ confirmed, refundPending, event, nameFor, notesByBooking = {} }) {
  const memberIdOf = (b) => b.member_id || b.members?.id || b.member?.id || null
  const notesFor = (b) => (notesByBooking[b.id] || [])
    .map(n => noteLine(n, memberIdOf(b)))
    .filter(Boolean)

  const paid = [], partial = [], unpaid = []
  for (const b of (confirmed || [])) {
    if (isRefunded(b)) continue
    if (payableSeats(b, event) === 0) continue // free bus-driver seat: nothing due
    const f = reconciliationFigures(b, event)
    const row = { name: nameFor(b), seats: payableSeats(b, event), due: f.due, paid: f.paid, owing: f.owing, notes: notesFor(b) }
    if (isPaid(b)) paid.push(row)
    else if (isPartial(b, event) || f.paid > 0) partial.push(row)
    else unpaid.push(row)
  }
  const refunds = (refundPending || []).map(b => ({
    name: nameFor(b),
    seats: b.seats || 1,
    paid: parseFloat(b.amount_paid) || 0,
    refund: refundOwed(b, event),
    notes: notesFor(b),
  }))

  const byName = (a, b) => String(a.name).localeCompare(String(b.name))
  ;[paid, partial, unpaid, refunds].forEach(list => list.sort(byName))

  return [
    { heading: "Paid", columns: PAY_COLUMNS, rows: paid, totals: totalsFor(paid, PAY_COLUMNS) },
    { heading: "Unpaid", columns: PAY_COLUMNS, rows: unpaid, totals: totalsFor(unpaid, PAY_COLUMNS) },
    { heading: "Partial", columns: PAY_COLUMNS, rows: partial, totals: totalsFor(partial, PAY_COLUMNS) },
    { heading: "Refunds owed", columns: REFUND_COLUMNS, rows: refunds, totals: totalsFor(refunds, REFUND_COLUMNS) },
  ]
}

// The top-of-report summary, from paymentSummary()'s result. Colours are
// literal hex: the report is a fresh document with no app CSS variables.
export function reconciliationSummaryLines(summary) {
  if (!summary) return []
  return [
    { label: "Expected", value: money(summary.expectedTotal) },
    { label: "Collected", value: money(summary.collectedTotal), colour: "#166534" },
    { label: "Outstanding", value: money(summary.outstandingTotal), colour: summary.outstandingTotal > 0 ? "#92400e" : undefined },
    ...(summary.refundsDueCount > 0 ? [{ label: "Refunds owed", value: money(summary.refundsDueTotal), colour: "#92400e" }] : []),
  ]
}

// Fetch payment notes fresh at export time, so the report reflects the
// moment it's run. Failure is non-fatal: the report still prints, just
// without the note lines.
export async function fetchPaymentNotes(authedFetch, eventId) {
  try {
    const res = await authedFetch(`/api/coordinator/payment-notes?event_id=${encodeURIComponent(eventId)}`)
    if (!res.ok) return {}
    const d = await res.json()
    return d?.notes || {}
  } catch {
    return {}
  }
}
