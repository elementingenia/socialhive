// lib/spaces.js — space (common-area) rules. Pure functions, no I/O.
//
// Decisions locked by Iain 2026-07-31 (Social_Hive_Spaces_Gap_Analysis.md):
//   * Every location is bookable. No facility/room distinction.
//   * Capacity is a THEORETICAL figure. It seeds the default max_seats for an
//     event in that room and warns when exceeded — it NEVER blocks, because
//     real capacity varies with external factors.
//   * A location can be closed for bookings, either "until further notice"
//     (a start date only) or between two dates, with a reason of <= 100 chars.
//   * Space administration is admin-only. No approval workflow, no per-space
//     owners.
//
// ⚠ OUR AVAILABILITY ANSWER IS NOT AUTHORITATIVE. The Ingenia resident app
// books these same rooms and any resident can book there; the Hive only ever
// sees its own bookings. Every message below is worded to say "no clash with
// another Hive event" and never "this space is free" — overstating it is worse
// than saying nothing, because an organiser who trusts it stops cross-checking.

export const REASON_MAX = 100
export const PURPOSES = ['event', 'maintenance', 'private', 'hold']

const toDate = (d) => {
  if (d instanceof Date) return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return new Date(d.slice(0, 10) + 'T00:00:00Z')
  return null
}

/**
 * Is this location closed to bookings on the given date?
 * Open-ended closure (no closed_to) means "from closed_from onwards, forever".
 */
export function isClosedOn (location, date) {
  if (!location || location.booking_status !== 'closed') return false
  const from = toDate(location.closed_from)
  const on = toDate(date)
  if (!from || !on) return false
  if (on.getTime() < from.getTime()) return false      // closure hasn't started
  const to = toDate(location.closed_to)
  if (!to) return true                                  // until further notice
  return on.getTime() <= to.getTime()                   // inclusive of the last day
}

/** Wording for why a room can't be booked. Null when it's available. */
export function closureMessage (location, date) {
  if (!isClosedOn(location, date)) return null
  const name = location.name || 'This space'
  const reason = location.closed_reason ? ` — ${location.closed_reason}` : ''
  return location.closed_to
    ? `${name} is closed for bookings from ${location.closed_from} to ${location.closed_to}${reason}.`
    : `${name} is closed for bookings from ${location.closed_from} until further notice${reason}.`
}

/** Validation for the admin form. Returns an error string, or null when valid. */
export function validateClosure ({ booking_status, closed_from, closed_to, closed_reason } = {}) {
  if (booking_status !== 'closed') return null
  if (!closed_from) return 'A closure needs a start date'
  if (closed_to && toDate(closed_to) < toDate(closed_from)) return 'The closing "to" date cannot be before the "from" date'
  if (closed_reason && closed_reason.length > REASON_MAX) {
    return `Reason must be ${REASON_MAX} characters or fewer (currently ${closed_reason.length})`
  }
  return null
}

/** Characters left in the reason field, for a live counter. */
export function reasonRemaining (text) {
  return REASON_MAX - (text || '').length
}

/**
 * The default max_seats for an event in this room. Capacity SEEDS this; it does
 * not cap it. A room with no capacity set falls back to the app default.
 */
export function defaultSeatsFor (location, fallback = 20) {
  const c = location?.capacity
  return Number.isFinite(c) && c > 0 ? c : fallback
}

/**
 * Warning when an event's seats exceed the room's theoretical capacity.
 * Advisory ONLY — never used to block a save (Iain: capacity "does not restrict
 * it from having a larger number").
 */
export function capacityWarning (location, maxSeats) {
  const c = location?.capacity
  const n = Number(maxSeats)
  if (!Number.isFinite(c) || c <= 0 || !Number.isFinite(n) || n <= c) return null
  return `${location.name || 'This space'} seats about ${c}. You've set ${n} — that's fine if you know it fits.`
}

/**
 * Turn a Postgres exclusion-constraint violation into something a resident can
 * read. The EXCLUDE constraint is the guarantee; the app still owns the words.
 * SQLSTATE 23P01 = exclusion_violation.
 */
export function isOverlapError (error) {
  if (!error) return false
  return error.code === '23P01' || /space_bookings_no_overlap/.test(error.message || '')
}

/**
 * Deliberately hedged. We can only speak for the Hive's own bookings.
 */
export function overlapMessage (locationName) {
  return `${locationName || 'That space'} is already booked for part of that time by another Hive event. ` +
         `Note the Ingenia app books these rooms too — availability there is separate.`
}

/** Shown after a successful clash check, so nobody reads it as a guarantee. */
export function availabilityCaveat () {
  return 'No clash with another Hive event. Remember to check and book the space in the Ingenia app as well.'
}

/** Compose a local date + time into an instant, for the booking window. */
/**
 * The UTC offset (minutes) for Australia/Sydney on a given LOCAL calendar
 * date — 600 (AEST) or 660 (AEDT) depending on daylight saving. toInstant's
 * default of 600 is a fixed approximation that drifts an hour wrong for the
 * roughly half the year AEDT is in effect (Oct-Apr); this looks the real
 * offset up via Intl's timezone database instead of hardcoding either one.
 *
 * Anchored at local NOON (not the target time) specifically to stay clear of
 * the 2-3am hour where a DST transition itself happens — using the actual
 * target time here could read the wrong side of a transition on the two days
 * a year it flips.
 */
export function sydneyOffsetMinutes (dateStr) {
  if (!dateStr) return 600
  const probe = new Date(`${dateStr.slice(0, 10)}T12:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', timeZoneName: 'shortOffset',
  }).formatToParts(probe)
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value || ''
  const m = tz.match(/GMT([+-]\d+)(?::(\d+))?/)
  if (!m) return 600
  const sign = m[1].startsWith('-') ? -1 : 1
  return sign * (Math.abs(parseInt(m[1], 10)) * 60 + (m[2] ? parseInt(m[2], 10) : 0))
}

export function toInstant (dateStr, timeStr, timeZoneOffsetMinutes = 600) {
  if (!dateStr || !timeStr) return null
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  const [hh, mm] = timeStr.slice(0, 5).split(':').map(Number)
  if ([y, m, d, hh, mm].some((n) => !Number.isFinite(n))) return null
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - timeZoneOffsetMinutes * 60000)
}

/** Does a proposed window sit inside a closure? Used before hitting the DB. */
export function bookingBlockedBy (location, dateStr) {
  if (!location) return 'Choose a venue'
  return closureMessage(location, dateStr)
}
