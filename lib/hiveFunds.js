// lib/hiveFunds.js
//
// Hive Funds ledger -- every money sum in one place (Iain, 2026-10-23,
// Element_Happenings_Hive_Funds_Transparency_Scope_Answered). Pure: no DB,
// no imports beyond lib/payments.js, unit-tested in tests/unit/hiveFunds.test.mjs.
//
// The model, in plain terms:
//   * One ledger per fund (hive_ledger). Lines are the starting balance,
//     money in between events, and money out (for an event, or between).
//   * Collected for an event is never typed in -- it comes from the
//     Paid/Unpaid records (bookings.amount_paid) via paymentSummary(), so it
//     always matches the attendee list. A separate plus/minus adjustment
//     with a note covers anything else (e.g. door cash).
//   * An event is "in progress" until finalised. Finalising freezes its
//     collected figure and moves its result into Funds held.
//   * Funds held     = starting balance + between-events lines + finalised events' results
//     Balance        = Funds held + collected (in progress) - spent (in progress)
//     Cash held      = Balance + refunds owed. Refunds owed are cash in the tin
//                      that belongs back to residents. They were never counted in
//                      Collected (paymentSummary caps each booking at what it owes
//                      and skips cancelled bookings), so they are NOT subtracted from
//                      the Balance -- they are the difference between the Hive's own
//                      money and the cash physically held.
//   * Only events dated on or after the starting balance's date count; money
//     from earlier events is already inside the declared starting balance.
//
// Built for Social Hive only; FUNDS is keyed so another hub can be added.

import { paymentSummary } from "./payments.js"

export const FUNDS = {
  social: { key: "social", label: "Social Hive", hubType: "social", ownerContext: { type: "hub", key: "social" } },
}

export const AUDIENCES = ["off", "managers", "all"]
export const AUDIENCE_LABELS = {
  off: "Hidden from everyone",
  managers: "Admins, Owners and Event Coordinators",
  all: "Every resident",
}

export function isValidAudience(a) {
  return AUDIENCES.includes(a)
}

// Work in whole cents so sums never drift (0.1 + 0.2).
const c = n => Math.round((Number(n) || 0) * 100)
const d = cents => cents / 100

export function roundMoney(n) {
  return d(c(n))
}

// Who can see the ledger at all, given the fund's audience switch.
// isManager = admin, this hub's Owner, or an EC of any of this hub's events.
export function canSeeFund(audience, { isAdmin, isOwner, isEC } = {}) {
  if (audience === "all") return true
  if (audience === "managers") return !!(isAdmin || isOwner || isEC)
  return false
}

// May this person add/edit outgoings or the adjustment on this event?
// Admin, the hub's Owner, or this event's own EC.
export function canEditEvent({ isAdmin, isOwner, isEventEC } = {}) {
  return !!(isAdmin || isOwner || isEventEC)
}

// Between-events lines and finalising: admin or the hub's Owner.
export function canManageFund({ isAdmin, isOwner } = {}) {
  return !!(isAdmin || isOwner)
}

// Refunds owed on one booking -- same rule as the coordinator panel's
// Refunds Due list (app/api/coordinator/route.js).
export function bookingRefundOwed(b) {
  const due = Number(b?.refund_due) || 0
  if (due <= 0 || b?.refund_paid_at || b?.payment_status === "refunded") return 0
  return due
}

// Live collected + refunds owed for one event from its bookings.
export function eventMoney(event, bookings) {
  const all = bookings || []
  const confirmed = all.filter(b => b.status === "confirmed")
  const summary = paymentSummary(confirmed, event, [])
  const collected = summary ? summary.collectedTotal : 0
  const refundsOwed = all.reduce((s, b) => s + c(bookingRefundOwed(b)), 0)
  return { collected: roundMoney(collected), refundsOwed: d(refundsOwed) }
}

const liveLines = lines => (lines || []).filter(l => !l.deleted_at)

// One event's breakdown. finance = its hive_event_finance row (or null).
// Collected uses the frozen snapshot once finalised.
export function eventFigures({ event, bookings, lines, finance }) {
  const outgoings = liveLines(lines)
    .filter(l => l.kind === "expense" && l.event_id === event.id)
    .sort((a, b) => String(a.entry_date).localeCompare(String(b.entry_date)) || String(a.created_at).localeCompare(String(b.created_at)))
  const outgoingsCents = outgoings.reduce((s, l) => s + c(l.amount), 0)
  const live = eventMoney(event, bookings)
  const finalised = !!finance?.finalised_at
  const collected = finalised && finance.collected_snapshot != null ? roundMoney(finance.collected_snapshot) : live.collected
  const adjustment = roundMoney(finance?.adjustment || 0)
  const resultCents = c(collected) + c(adjustment) - outgoingsCents
  return {
    eventId: event.id,
    outgoings,
    outgoingsTotal: d(outgoingsCents),
    collected,
    liveCollected: live.collected,
    adjustment,
    adjustmentNote: finance?.adjustment_note || "",
    result: d(resultCents),
    refundsOwed: live.refundsOwed,
    finalised,
    finalisedAt: finance?.finalised_at || null,
  }
}

export function openingLine(lines) {
  return liveLines(lines).find(l => l.kind === "opening") || null
}

// Does this event count towards the fund? Only events dated on or after the
// starting balance's date (earlier money is already in the starting balance).
export function eventCounts(event, opening) {
  if (!opening || !event?.event_date) return false
  return String(event.event_date) >= String(opening.entry_date)
}

// Between-events lines (income, or an expense with no event), excluding the
// starting balance.
export function betweenLines(lines) {
  return liveLines(lines).filter(l => !l.event_id && l.kind !== "opening")
}

const lineSign = l => (l.kind === "expense" ? -1 : 1)

// Funds held, optionally as it stood just before `cutoff` (an ISO time):
// between-events lines created before it and events finalised before it.
// Used for an event's "Hive funds before this event".
// items = [{ event, figures }] for every counting event.
export function fundsHeld(lines, items, cutoff = null) {
  const opening = openingLine(lines)
  let cents = opening ? c(opening.amount) : 0
  for (const l of betweenLines(lines)) {
    if (cutoff && !(String(l.created_at) < String(cutoff))) continue
    cents += lineSign(l) * c(l.amount)
  }
  for (const { figures } of items || []) {
    if (!figures.finalised) continue
    if (cutoff && !(String(figures.finalisedAt) < String(cutoff))) continue
    cents += c(figures.result)
  }
  return d(cents)
}

// The Home summary. items = [{ event, figures }] for every counting event.
export function fundSummary(lines, items) {
  const opening = openingLine(lines)
  const held = fundsHeld(lines, items)
  let collected = 0, spent = 0, refunds = 0, inProgress = 0
  for (const { figures } of items || []) {
    refunds += c(figures.refundsOwed)
    if (figures.finalised) continue
    inProgress += 1
    collected += c(figures.collected) + c(figures.adjustment)
    spent += c(figures.outgoingsTotal)
  }
  const balance = c(held) + collected - spent
  return {
    hasOpening: !!opening,
    opening: opening ? roundMoney(opening.amount) : 0,
    openingDate: opening?.entry_date || null,
    fundsHeld: held,
    inProgressCount: inProgress,
    collected: d(collected),
    spent: d(spent),
    refundsOwed: d(refunds),
    balance: d(balance),
    cashHeld: d(balance + refunds),
  }
}

// "Hive funds before this event" and "Carried forward".
// In progress: before = funds held now. Finalised: as it stood just before
// it was finalised, so a run of events reads as a running total.
export function eventCarry(lines, items, figures) {
  const before = figures.finalised ? fundsHeld(lines, items, figures.finalisedAt) : fundsHeld(lines, items)
  return { before, carriedForward: d(c(before) + c(figures.result)) }
}

// Starting balance from a cash count: the cash in the tin includes money
// already taken for events that haven't been finalised yet, and refunds
// still owed back. Both are counted from the booking records, so the
// starting balance must leave them out or they'd be counted twice.
export function openingFromCashCount(cashCounted, collectedSoFar, refundsOwed) {
  return d(c(cashCounted) - c(collectedSoFar) - c(refundsOwed))
}

// Validation for a money amount typed into a form. Returns a number or null.
export function parseAmount(v, { allowNegative = false, allowZero = false } = {}) {
  if (v === null || v === undefined || String(v).trim() === "") return null
  const n = Number(String(v).replace(/[$,\s]/g, ""))
  if (!Number.isFinite(n)) return null
  if (!allowNegative && n < 0) return null
  if (!allowZero && n === 0) return null
  if (Math.abs(n) > 1000000) return null
  return roundMoney(n)
}

// "$1,234.50" / "-$15.00"
export function fmtMoney(n) {
  const v = Number(n) || 0
  const s = Math.abs(v).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${v < 0 ? "-" : ""}$${s}`
}
