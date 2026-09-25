// Waitlist queue position -- the ONE rule every hub uses (Iain, 2026-09-26:
// "waitlist should be consistent through system"). Pure, no DB access, so it
// runs identically server-side (app/api/events/waitlist) and in unit tests.
//
// Order matches lib/promoteWaitlist.js exactly -- that's the engine that
// actually hands out freed seats, walking waitlist rows by booked_at
// ascending. A position that disagreed with it would be a promise the app
// can't keep. `id` is a stable tie-break for two rows with an identical
// booked_at (a split booking's rows can land in the same millisecond).
//
// Position is per BOOKING ROW (one party = one row), not per seat -- a party
// of 2 at the front of the queue is "#1", and the party behind them is "#2",
// same as Show Time has always shown.

export function waitlistQueue(bookings) {
  return (bookings || [])
    .filter(b => b && b.status === "waitlist")
    .sort((a, b) => {
      const ta = new Date(a.booked_at).getTime() || 0
      const tb = new Date(b.booked_at).getTime() || 0
      if (ta !== tb) return ta - tb
      return String(a.id).localeCompare(String(b.id))
    })
}

// Map of booking id -> 1-based queue position.
export function waitlistPositionMap(bookings) {
  return new Map(waitlistQueue(bookings).map((b, i) => [b.id, i + 1]))
}

// Summary for one event's bookings, from one viewer's point of view.
// `isMine(b)` decides which rows belong to the viewer (member_id match).
// A viewer with more than one waitlist row (rare -- history) gets their
// earliest position, i.e. the best one, same as EventSlideOut's EC view.
export function waitlistSummary(bookings, isMine) {
  const queue = waitlistQueue(bookings)
  let position = null
  let mySeats = 0
  queue.forEach((b, i) => {
    if (isMine && isMine(b)) {
      mySeats += b.seats || 1
      if (position === null) position = i + 1
    }
  })
  return {
    position,
    my_waitlist_seats: mySeats,
    waitlist_count: queue.length,
    waitlist_seats: queue.reduce((s, b) => s + (b.seats || 1), 0),
  }
}

// Resident-facing wording, shared so every hub reads the same:
// "#2 on waitlist" when the position is known, "On waitlist" otherwise.
export function waitlistLabel(position) {
  return position ? `#${position} on waitlist` : "On waitlist"
}
