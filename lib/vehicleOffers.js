// Personal vehicle offers -- seat math + validation (migration 109, Iain
// 2026-09-17). Second, independent transport option alongside Community
// Bus (lib/busSeats.js), which stays completely unchanged. Pure logic so
// the server (the authoritative check, in the vehicle-offers API routes)
// and the client (which mirrors it to disable controls before a resident
// ever hits the rejection) can't drift apart -- same reasoning as
// lib/busSeats.js and lib/attendees.js.
//
// The identity model mirrors booking_attendees exactly: a driver is
// member_id XOR contact_id (always an already-identified resident, never a
// bare guest -- migration 061's owner-identity shape); a passenger is
// member_id XOR contact_id XOR guest_name (migration 059's three-way
// shape), since a passenger must be an attendee of the event and attendees
// can be guests too.

// Any offer -- including a genuine zero-seat self-nomination ("I'm driving
// myself, not offering a ride") -- is a valid state. seats_offered must be a
// non-negative integer; the DB's own CHECK (seats_offered >= 0) backs this
// up, but the API validates before ever reaching the database so a bad
// request gets a real error message instead of a raw constraint violation.
export function validateSeatsOffered(seatsOffered) {
  if (typeof seatsOffered === "string" && seatsOffered.trim() === "") {
    return { ok: false, error: "Seats offered must be a whole number, 0 or more." }
  }
  const n = Number(seatsOffered)
  if (!Number.isInteger(n) || n < 0) {
    return { ok: false, error: "Seats offered must be a whole number, 0 or more." }
  }
  return { ok: true, seats: n }
}

// How many of an offer's seats are currently taken -- passengers is the set
// of vehicle_offer_passengers rows for THIS offer (nominated_by_driver true
// or false both count the same toward capacity, per the scope answer: the
// flag is a display/audit distinction only).
export function vehicleSeatsUsed(passengers = []) {
  return passengers.length
}

// requested: how many MORE seats this action wants to fill (1 for a single
// claim/pre-assign, or however many the caller is adding at once).
// seatsOffered: the offer's own seats_offered.
// currentUsed: vehicleSeatsUsed() for this offer, EXCLUDING whatever the
//   caller is about to add (so re-submitting an unchanged assignment isn't
//   blocked by itself, same pattern validateBusRequest's othersUsed uses).
// Explicitly no waitlist, matching the bus's own rule -- once full, the
// request is just rejected, nothing else about the booking is affected.
export function validateVehicleSeatRequest({ requested = 1, seatsOffered, currentUsed = 0 }) {
  const remaining = Math.max(0, seatsOffered - currentUsed)
  if (requested > remaining) {
    return {
      ok: false,
      remaining,
      error: remaining === 0
        ? "That car is full."
        : `Only ${remaining} seat${remaining === 1 ? "" : "s"} left in that car.`,
    }
  }
  return { ok: true, remaining }
}

// Self-nomination exclusivity (scope §5, sharpened by Iain's answer):
// self-nominating as a driver AT ALL -- zero seats offered or not --
// disqualifies that person from being added to or claiming a seat in
// ANY other attendee's vehicle offer. Broader than "not already assigned
// to a different vehicle": it's checked before the passenger-assignment
// check even runs.
//
// alreadyDrivingEvent: true if this identity already has a vehicle_offers
//   row for this event (the caller looks this up by member_id/contact_id --
//   a driver can only ever have one offer per event, per the DB's own
//   partial-unique indexes).
export function isDriverIneligibleAsPassenger({ alreadyDrivingEvent }) {
  if (alreadyDrivingEvent) {
    return { ok: false, error: "You're already driving to this event, so you can't also ride in someone else's car." }
  }
  return { ok: true }
}

// Bus/vehicle exclusivity (scope §2, confirmed to extend fully to riders,
// not just drivers, on Iain's same-day follow-up): one transport mode per
// person per event, full stop, no exceptions, in either direction.
//
// isBusRider / isBusDriver describe this identity's CURRENT bus state for
// this event (bus_passenger on their own booking row, or
// is_bus_passenger on a booking_attendees row they're named on -- "driver"
// here means the informational events.has_bus driver field, per migration
// 015/085's own bus design, which has no seat of its own to conflict with a
// car seat, but bus RIDING is what actually excludes).
export function checkBusVehicleExclusivity({ isBusRider, wantsVehicleRole }) {
  if (isBusRider) {
    return {
      ok: false,
      error: wantsVehicleRole === "driver"
        ? "You're already riding the bus for this event -- riding the bus and driving a car are mutually exclusive."
        : "You're already riding the bus for this event -- riding the bus and riding in a car are mutually exclusive.",
    }
  }
  return { ok: true }
}

// Full eligibility check for adding/claiming a passenger seat (pre-assign
// by the driver, or a self-claim by the passenger) -- composes the three
// independent exclusivity rules above plus the basic "must be a genuine
// attendee of the event" rule (scope §1/§5: attendee-list membership is the
// only gate, resident or guest, no distinction) into the one check the API
// route actually calls.
//
// isAttendee: this identity (or guest name) is on the event's own attendee
//   list (booker or named party member) -- looked up by the caller.
// alreadyDrivingEvent / isBusRider: see the two functions above.
// alreadyPassengerElsewhere: already a named passenger on a DIFFERENT
//   vehicle_offer_passengers row for this event (the DB's own partial-
//   unique indexes catch this for member/contact identities; guest_name has
//   no stable identity to index on, so the caller must also check this for
//   guests by comparing names within the event, same de-duplication
//   precedent booking_attendees guest naming already accepts as good enough).
export function validateVehiclePassenger({ isAttendee, alreadyDrivingEvent, isBusRider, alreadyPassengerElsewhere }) {
  if (!isAttendee) {
    return { ok: false, error: "This person isn't on the event's attendee list." }
  }
  const driverCheck = isDriverIneligibleAsPassenger({ alreadyDrivingEvent })
  if (!driverCheck.ok) return driverCheck
  const busCheck = checkBusVehicleExclusivity({ isBusRider, wantsVehicleRole: "passenger" })
  if (!busCheck.ok) return busCheck
  if (alreadyPassengerElsewhere) {
    return { ok: false, error: "This person is already riding in another car for this event." }
  }
  return { ok: true }
}

// Full eligibility check for self-nominating as a driver (creating or
// re-saving a vehicle_offers row) -- the mirror of validateVehiclePassenger
// above, for the driver side. A driver must themselves be a genuine
// attendee (scope §1) and can't already be a bus rider (scope §2) or a
// passenger in someone else's car (self-nominating as driver supersedes an
// existing passenger seat -- the caller should drop that seat, not silently
// allow both).
export function validateDriverSelfNomination({ isAttendee, isBusRider, alreadyPassengerElsewhere }) {
  if (!isAttendee) {
    return { ok: false, error: "You need to be on the event's attendee list before you can offer seats." }
  }
  const busCheck = checkBusVehicleExclusivity({ isBusRider, wantsVehicleRole: "driver" })
  if (!busCheck.ok) return busCheck
  if (alreadyPassengerElsewhere) {
    return { ok: false, error: "You're already riding in someone else's car for this event -- drop that seat first if you want to drive yourself." }
  }
  return { ok: true }
}

// A driver-initiated removal of an already-seated passenger ("bump") needs
// a plain-text reason, distinct from a passenger simply choosing to leave
// their own claim (no reason required there -- scope §6). Pure validation
// so both the API route and the bump UI enforce the same rule.
export function validateBumpReason(reason) {
  const trimmed = typeof reason === "string" ? reason.trim() : ""
  if (!trimmed) {
    return { ok: false, error: "Please give a reason for removing this passenger -- it's sent to them as a notification." }
  }
  return { ok: true, reason: trimmed }
}
