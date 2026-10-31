// How an event takes bookings (Iain, 2026-10-31).
// Scope: claude/Element_Happenings_Optional_RSVP_and_ShowTime_Village_Scope_Answered.md
//
//   Requires booking     -- the normal case: book a seat, seat limit applies.
//   Optional             -- booking_optional: "no need to book, let us know if
//                           you're coming". I'm coming is a normal confirmed
//                           booking underneath. Never a seat limit or waitlist.
//   Open -- All Welcome  -- booking_required false (Groups & Clubs only): no
//                           booking can exist at all.
//   seats_unlimited      -- bookings with no seat limit (Show Time village
//                           "No limit"). Optional always implies it.
//
// Pure functions (no DB) so server routes, client components and unit tests
// share one set of rules.

// Stands in for "no limit" in seat maths. Finite on purpose: Infinity
// becomes null in JSON and breaks Math on the client.
export const UNLIMITED_SEATS = 100000

export function isBookingOptional(event) {
  return !!event && event.booking_optional === true && event.booking_required !== false
}

export function isSeatsUnlimited(event) {
  return !!event && (event.seats_unlimited === true || isBookingOptional(event))
}

// The seat limit used for every "how many seats are free" sum.
export function seatCapacity(event) {
  if (isSeatsUnlimited(event)) return UNLIMITED_SEATS
  const n = parseInt(event?.max_seats, 10)
  return n > 0 ? n : 0
}

// Server-side tidy-up of a create/edit payload. Only touches the keys that
// are present, so partial PATCHes are safe.
export function normaliseBookingMode(payload) {
  if (!payload) return payload
  const hadUnlimited = "seats_unlimited" in payload
  if ("booking_optional" in payload) payload.booking_optional = payload.booking_optional === true
  if ("seats_unlimited" in payload) payload.seats_unlimited = payload.seats_unlimited === true
  // Open -- All Welcome wins: no booking can exist, so neither flag applies.
  if (payload.booking_required === false) {
    payload.booking_optional = false
    payload.seats_unlimited = false
  } else if (payload.booking_optional === true) {
    payload.seats_unlimited = true
  } else if (payload.booking_optional === false && !hadUnlimited) {
    // Switching back to Requires booking (Social, Special, Clubs only send
    // booking_optional) puts the seat limit back on.
    payload.seats_unlimited = false
  }
  return payload
}

// "3 coming" / "1 coming" for an optional event's tile.
export function comingLabel(seats) {
  const n = Math.max(0, parseInt(seats, 10) || 0)
  return n === 0 ? "No one yet" : `${n} coming`
}

// Short line for a no-limit (but booking required) event: "12 booked".
export function bookedLabel(seats) {
  const n = Math.max(0, parseInt(seats, 10) || 0)
  return `${n} booked · no limit`
}

export const OPTIONAL_WELCOME = "Everyone's welcome — no need to book. Let us know if you're coming."
