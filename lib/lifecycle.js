// lib/lifecycle.js — resident lifecycle rules (foundation rebuild, Slice F).
//
// Pure functions, no database. Every rule here came out of Iain's corrections on
// 2026-07-30 and the reasoning is recorded because it is not self-evident:
//
//   1. TWO states only — 'active' and 'inactive'. There is deliberately no
//      "temporarily away" state. Residents being away is routine in a community
//      like this and the app has no reason to track it, so `inactive` always
//      means "no longer resides here".
//
//   2. The 30 days is an UNDO WINDOW FOR ADMIN ERROR, not a grace period for the
//      resident. That single sentence is what makes `purge_after` run from the
//      DATE OF THE ADMIN'S ACTION and never from `left_on`. Get this backwards
//      and recording a move-out that happened two months ago purges the person
//      immediately — destroying the safeguard in exactly the case it exists for.
//
//   3. Reactivating clears the pending purge entirely. Deactivating again starts
//      a fresh full 30 days; it does not resume the old countdown.
//
//   4. Purge is a real DELETE, not an archive flag. History stays readable
//      through the *_name_at_time snapshots added in migration 069 — which is
//      why those cannot be retrofitted after the fact.

export const ACTIVE = 'active'
export const INACTIVE = 'inactive'
export const UNDO_WINDOW_DAYS = 30

const toDate = (d) => {
  if (d instanceof Date) return new Date(d.getTime())
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return new Date(d.slice(0, 10) + 'T00:00:00Z')
  return null
}
const iso = (d) => (d ? d.toISOString().slice(0, 10) : null)

export function addDays (date, n) {
  const d = toDate(date)
  if (!d) return null
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

/**
 * Deactivate a person: they no longer live here.
 *
 * @param leftOn   the real-world date they left (may be backdated by the admin)
 * @param actionOn the date the admin is performing this action ("today")
 * Returns the exact column values to write.
 */
export function deactivate ({ leftOn, actionOn } = {}) {
  const action = toDate(actionOn) || toDate(new Date())
  const left = toDate(leftOn) || action
  return {
    status: INACTIVE,
    left_on: iso(left),
    // FROM THE ACTION, NOT FROM left_on. See note 2 above.
    purge_after: iso(addDays(action, UNDO_WINDOW_DAYS))
  }
}

/** Reactivate: the deactivation was a mistake. Clears the pending purge. */
export function reactivate () {
  return { status: ACTIVE, left_on: null, purge_after: null }
}

/** True when the undo window has closed and this person may be purged. */
export function isPurgeDue (person, asOf = new Date()) {
  if (!person || person.status !== INACTIVE || !person.purge_after) return false
  const due = toDate(person.purge_after)
  const now = toDate(asOf) || toDate(new Date())
  return !!due && !!now && now.getTime() >= due.getTime()
}

/** Whole days left in the undo window; 0 once due. Null if not pending. */
export function daysUntilPurge (person, asOf = new Date()) {
  if (!person || person.status !== INACTIVE || !person.purge_after) return null
  const due = toDate(person.purge_after)
  const now = toDate(asOf) || toDate(new Date())
  if (!due || !now) return null
  return Math.max(0, Math.round((due.getTime() - now.getTime()) / 86400000))
}

/**
 * The warning the admin must see before confirming. Iain's wording, 2026-07-30:
 * an "In effect from" date defaulting to today, plus the purge notice.
 */
export function deactivationWarning ({ name, leftOn, actionOn } = {}) {
  const { purge_after } = deactivate({ leftOn, actionOn })
  const who = name || 'This person'
  return `If ${who} is not reactivated within ${UNDO_WINDOW_DAYS} days ` +
         `(by ${purge_after}), their data will be purged from the system.`
}

/**
 * Can this person hold a login? An external contact never can — enforced as a
 * CHECK constraint in migration 068, mirrored here so the UI can grey the field
 * rather than letting the user submit and collect a 500.
 */
export function canHaveLogin (person) {
  return !!person && person.person_type !== 'external'
}

/**
 * Name snapshot for the *_name_at_time columns. Written at row-creation time,
 * because after a purge there is nothing left to derive it from.
 */
export function nameSnapshot (person) {
  if (!person) return null
  const full = [person.first_name, person.last_name].filter(Boolean).join(' ').trim()
  return person.display_name || full || null
}

export function displayName (person) {
  return nameSnapshot(person) || 'Resident'
}
