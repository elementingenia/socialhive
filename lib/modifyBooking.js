// Shared seat-modification decision logic — used by both self-service
// (PATCH /api/bookings) and EC/admin-on-behalf-of (PATCH /api/coordinator,
// action "modify_booking"), added 2026-08-08 so an admin can add/remove
// seats on someone else's existing booking (or a walk-up booking) with
// exactly the same rules a resident gets modifying their own. Two separate
// copies of this logic is exactly the shape that let promoteWaitlist drift
// in 2026-07-12 — kept as one pure function instead so both entry points
// can't diverge.
//
// Pure — no DB access — so it's unit-testable and the two callers stay
// responsible for their own reads/writes.

// Per-event cap on how many seats a single booking may hold. Previously
// every seat-count entry point (POST/PATCH /api/bookings,
// add_booking in /api/coordinator) hardcoded a cap of 4 regardless of the
// event's own max_seats_per_booking — harmless for events at the default,
// silently wrong for Social events configured above 4 (the form allows up
// to 10): a resident could never actually book past 4 seats no matter what
// the event said. Found while wiring this shared function (Iain asked for
// "the same rules apply in terms of max seats per booking"), fixed here as
// the one place all four seat-count call sites now read the cap from.
export function maxSeatsPerBooking(event) {
  const raw = parseInt(event?.max_seats_per_booking, 10)
  return raw > 0 ? raw : 4
}

// The per-BOOKING cap above exists to stop one resident's self-service
// booking from hogging seats meant for the whole community. It was never
// meant to also apply to an EC/admin managing bookings ON BEHALF of the
// event -- Iain, 2026-09-04 (backlog item raised 2026-09-03b): "can we
// adjust the max seat logic to ignore the constrain for an event
// coordinator. EC's can invite as many as they like, its THEIR event and
// their prerogative to bring whoever they like" -- with the explicit ceiling
// "cannot be greater than Total Seats" added when actually scoping it.
// Used only by the two coordinator-only actions in app/api/coordinator/route.js
// (add_booking, modify_booking), which are already gated admin/Owner/EC by
// requireEventManage() -- a resident's own self-service booking (POST/PATCH
// /api/bookings) always uses maxSeatsPerBooking() above, unchanged.
export function effectiveSeatCap(event, { unlimitedCap = false } = {}) {
  if (!unlimitedCap) return maxSeatsPerBooking(event)
  const total = parseInt(event?.max_seats, 10)
  return total > 0 ? total : maxSeatsPerBooking(event)
}

// Decide whether a requested seat-count change is allowed, and if so, how
// the resulting confirmed/waitlist split should look.
//
//   event            — { max_seats, max_seats_per_booking, unassigned_seats_count? }
//   requestedSeats    — the new TOTAL seats wanted for this one booking (raw, unclamped)
//   oldConfirmed      — this booking's current confirmed seat count (0 if none)
//   oldWaitlisted     — this booking's current waitlist seat count (0 if none)
//   othersConfirmed   — confirmed seats held by every OTHER booking on the event
//   closed            — bookingsClosed(event) — reservation cut-off has passed
export function planSeatModification({ event, requestedSeats, oldConfirmed = 0, oldWaitlisted = 0, othersConfirmed = 0, closed = false, unlimitedCap = false }) {
  const cap = effectiveSeatCap(event, { unlimitedCap })
  const seats = Math.min(cap, Math.max(1, parseInt(requestedSeats, 10) || 1))

  const currentTotal = (oldConfirmed || 0) + (oldWaitlisted || 0)
  const isGrowing = seats > currentTotal

  // A booking that's already split across confirmed + waitlist means the
  // event was full at the time some of these seats were requested. Growing
  // it further would either need to jump the existing FIFO queue or just
  // pile more onto this one booking's waitlist portion — neither is right,
  // so growth is blocked outright once any part of the booking is
  // waitlisted. Shrinking a split booking is still always fine. Cancel and
  // rebook is the only path back in (Iain, 2026-08-08) — matches the
  // seat-selector cap the resident-facing Modify UI already enforces
  // client-side (EventSlideOut.js's BookingSection), now backed server-side
  // too, and reused for the admin/EC path.
  if (isGrowing && oldWaitlisted > 0) {
    return {
      ok: false,
      code: "already_split",
      error: "This booking already has seats on the waitlist — increasing it isn't allowed while the event is full. Cancel the booking and rebook from scratch instead.",
    }
  }

  if (isGrowing && closed) {
    return {
      ok: false,
      code: "bookings_closed",
      error: "Bookings for this event have closed — seats can no longer be added.",
    }
  }

  const maxCanConfirm = Math.max(0, (event?.max_seats || 0) - (event?.unassigned_seats_count || 0) - (othersConfirmed || 0))
  const newConfirmed = Math.min(seats, maxCanConfirm)
  const newWaitlisted = seats - newConfirmed

  return { ok: true, seats, cap, newConfirmed, newWaitlisted }
}
