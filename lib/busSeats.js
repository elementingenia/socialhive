// Community bus — seat-usage math (migration 085, Iain 2026-08-19).
//
// Independent of the event's own seat capacity: a resident can book the
// event without a bus seat, or book it AND reserve seats on the bus. The
// bus has its own cap (events.bus_max_seats, null = uncapped) and,
// explicitly, NO waitlist -- once full, a request is rejected outright, the
// event booking itself is unaffected. Pure logic so the server (the
// authoritative check) and the client (which mirrors it to disable the
// control before a resident ever hits the rejection) can't drift apart --
// same reasoning as lib/modifyBooking.js and lib/attendees.js.

// How many bus seats a set of CONFIRMED bookings + their named attendees are
// currently using. `bookings` is an array of { id, status, bus_passenger };
// `attendees` is an array of booking_attendees rows with { owner_booking_id
// (or however the caller keys it) unused here -- attendees are simply
// counted if is_bus_passenger is set, since booking_attendees rows for a
// cancelled/waitlisted booking are expected to already be excluded/synced
// away by the caller (syncAttendees deletes an owner's whole party on every
// write, so a stale row belonging to a since-cancelled booking shouldn't
// exist, but callers should still only pass attendees for bookings they've
// already filtered to confirmed).
export function busSeatsUsed({ bookings = [], attendees = [] }) {
  const ownerSeats = bookings.filter(b => b.status === "confirmed" && b.bus_passenger).length
  const attendeeSeats = attendees.filter(a => a.is_bus_passenger).length
  return ownerSeats + attendeeSeats
}

// requested: how many bus seats THIS submission wants (owner + named party).
// busMaxSeats: events.bus_max_seats (null/undefined = uncapped).
// othersUsed: busSeatsUsed() across every OTHER confirmed booking on the
//   event (i.e. excluding this booking's own current bus usage, the same
//   "othersConfirmed" pattern app/api/bookings/route.js already uses for
//   the ordinary seat cap).
export function validateBusRequest({ requested, busMaxSeats, othersUsed = 0 }) {
  if (!requested) return { ok: true }
  if (busMaxSeats == null) return { ok: true }
  const remaining = Math.max(0, busMaxSeats - othersUsed)
  if (requested > remaining) {
    return {
      ok: false,
      remaining,
      error: remaining === 0
        ? "The bus is full."
        : `Only ${remaining} bus seat${remaining === 1 ? "" : "s"} left.`,
    }
  }
  return { ok: true, remaining }
}

// Count how many seats THIS submission is requesting for the bus: the
// booker themselves (if they ticked it) plus every named additional
// attendee flagged is_bus_passenger, from the already-normalised list
// validateParty() returns.
export function requestedBusSeats({ ownerWantsBus, attendees = [] }) {
  return (ownerWantsBus ? 1 : 0) + attendees.filter(a => a.is_bus_passenger).length
}
