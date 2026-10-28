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

// Whole-party seat claiming (Iain, live-fire review of PR #145,
// 2026-09-17, confirmed answer: "Whole party, same rule everywhere"). A
// booking's full party -- the booker plus every booking_attendees row
// owned by that booker for this event -- moves into or out of a car
// together, whichever side initiates it: a driver pre-assigning one named
// attendee from a party pulls in their whole party exactly like a
// self-claim does. This composes the existing per-person checks above
// across every member of the party, then a single capacity check sized to
// the whole party, so a party that doesn't fit isn't partially seated.
//
// partyMembers: array of { name, isBusRider, alreadyDrivingEvent,
//   alreadyPassengerElsewhere } -- one entry per party member (the booker
//   included), already resolved by the caller (resolveBookingParty in the
//   API route). isAttendee isn't asked for here: by construction, everyone
//   in a booking's own party is already on the event's attendee list.
// seatsOffered / currentUsed: same meaning as validateVehicleSeatRequest,
//   for the ONE car this whole party is trying to get into.
export function validatePartyForVehicle({ partyMembers = [], seatsOffered, currentUsed = 0 }) {
  if (!Array.isArray(partyMembers) || partyMembers.length === 0) {
    return { ok: false, error: "Couldn't find your booking party for this event." }
  }
  for (const member of partyMembers) {
    const check = validateVehiclePassenger({
      isAttendee: true,
      alreadyDrivingEvent: member.alreadyDrivingEvent,
      isBusRider: member.isBusRider,
      alreadyPassengerElsewhere: member.alreadyPassengerElsewhere,
    })
    if (!check.ok) {
      return {
        ok: false,
        error: partyMembers.length > 1 ? `${member.name || "Someone"} in your booking: ${check.error}` : check.error,
      }
    }
  }
  const seatCheck = validateVehicleSeatRequest({ requested: partyMembers.length, seatsOffered, currentUsed })
  if (!seatCheck.ok) {
    return {
      ok: false,
      error: partyMembers.length > 1
        ? `Your booking is for ${partyMembers.length} people, and ${seatCheck.error.charAt(0).toLowerCase()}${seatCheck.error.slice(1)}`
        : seatCheck.error,
    }
  }
  return { ok: true, partySize: partyMembers.length }
}

// Courtesy-notification wording (Iain, 2026-09-17, from a live PDF/app
// screenshot): the seat-claimed notification shipped in PR #145 said the
// literal word "Someone", and PR #147/#148's own follow-up only got as far
// as the equally-vague "A booking party" -- even though the claimant's (or
// driver's) actual, privacy-masked display name is available every time
// this fires. Pure string builders, matching this file's existing
// pattern, so the wording is unit-testable without mocking Supabase; the
// API route resolves the name via lib/memberName.js's existing hide_name/
// display_name rules (never bypassed here) and hands the result in.
export function buildSeatClaimedMessage({ claimantName, seatCount = 1, eventTitle }) {
  const who = claimantName || "A resident"
  const seatsWord = seatCount > 1 ? `${seatCount} seats` : "a seat"
  return `${who} claimed ${seatsWord} in your car for ${eventTitle}.`
}

export function buildSeatAssignedMessage({ driverName, eventTitle }) {
  const carPhrase = driverName ? `${driverName}'s car` : "a car"
  return `You and your booking party have been given seats in ${carPhrase} for ${eventTitle}.`
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

// ── Releasing transport when a booking is cancelled (BUG-102, 2026-10-28) ──
// Cancelling a booking used to leave the party's car arrangements in place:
// a driver who cancelled kept a live car that others could still join
// (Iain's own Stockton Flexi-Day car, 2026-10-21 -> two residents joined it
// after he'd cancelled), and a passenger who cancelled kept a seat in
// someone else's car. Pure planner so both cancel paths (self-cancel in
// /api/bookings, EC cancel in /api/coordinator) do exactly the same thing.
//
// offers: vehicle_offers rows for the event, each with member_id/contact_id
//   and passengers [{ id, member_id, contact_id, guest_name,
//   party_owner_member_id, party_owner_contact_id }].
// partyKeys: identity keys ("m:<id>", "c:<id>") of the cancelled booking's
//   owner and its named attendees. Guests are matched by party owner only,
//   never by name, so two parties' guests called "Mary" can't collide.
// ownerKey: the booking owner's identity key.
//
// Returns which offers to withdraw, which passenger rows to delete, who was
// riding in a withdrawn car (to tell them), and which other drivers just
// got seats back (to tell them).
export function identityKeyOf({ member_id, contact_id } = {}) {
  if (member_id) return `m:${member_id}`
  if (contact_id) return `c:${contact_id}`
  return null
}

// removedGuestNames: null = every guest in the party leaves (a full cancel);
//   a Set of lower-cased names = only those guests left (seats reduced).
// stillGoingKeys: identity keys still attending the event some other way
//   (their own booking, or named on another booking). Those people keep
//   their car and their seats -- only people who are genuinely no longer
//   going are released.
export function planCancelTransportRelease({ offers = [], partyKeys = [], ownerKey = null, removedGuestNames = null, stillGoingKeys = new Set() }) {
  const keys = new Set(partyKeys.filter(Boolean))
  const leaving = k => !!k && keys.has(k) && !stillGoingKeys.has(k)
  const rowOwnerKey = p => (p.party_owner_member_id ? `m:${p.party_owner_member_id}`
    : p.party_owner_contact_id ? `c:${p.party_owner_contact_id}` : null)
  const releasesRow = p => {
    const k = identityKeyOf(p)
    const owner = rowOwnerKey(p)
    if (!owner) return leaving(k) // legacy rows with no party owner stamped
    if (owner !== ownerKey) return false
    if (k) return leaving(k)
    if (!p.guest_name) return false
    return removedGuestNames === null || removedGuestNames.has(p.guest_name.trim().toLowerCase())
  }

  const offersToWithdraw = []
  const strandedPassengers = [] // { member_id, offer_id } -- in a withdrawn car, not leaving themselves
  const passengerIdsToDelete = []
  const freedSeatsByDriver = new Map() // driver member_id -> seats freed

  for (const o of offers) {
    if (leaving(identityKeyOf(o))) {
      offersToWithdraw.push(o.id)
      for (const p of o.passengers || []) {
        if (!releasesRow(p) && p.member_id) strandedPassengers.push({ member_id: p.member_id, offer_id: o.id })
      }
      continue // the car's own passenger rows go with it (ON DELETE CASCADE)
    }
    for (const p of o.passengers || []) {
      if (!releasesRow(p)) continue
      passengerIdsToDelete.push(p.id)
      if (o.member_id) freedSeatsByDriver.set(o.member_id, (freedSeatsByDriver.get(o.member_id) || 0) + 1)
    }
  }

  return {
    offersToWithdraw,
    passengerIdsToDelete,
    strandedPassengers,
    freedSeats: [...freedSeatsByDriver].map(([member_id, seats]) => ({ member_id, seats })),
  }
}

// A car is only usable while its driver is still going. activeKeys: identity
// keys of everyone with a non-cancelled booking or a named seat on the event.
export function isOfferDriverBooked(offer, activeKeys) {
  const k = identityKeyOf(offer || {})
  return !!k && activeKeys.has(k)
}

export function buildDriverCancelledMessage({ driverName, eventTitle }) {
  const who = driverName || "Your driver"
  return `${who} is no longer going to ${eventTitle}, so their car isn't running and you've been taken out of it. Please choose another way to get there.`
}

// passengerName is the booking owner; seats can include people they had
// named on their booking, so the wording is about the booking, not one person.
export function buildPassengerCancelledMessage({ passengerName, seats = 1, eventTitle, reduced = false }) {
  const who = passengerName || "A resident"
  const seatsWord = seats > 1 ? `${seats} seats` : "a seat"
  const what = reduced ? "changed their booking" : "cancelled their booking"
  return `${who} ${what} for ${eventTitle}, so ${seatsWord} in your car ${seats > 1 ? "are" : "is"} free again.`
}
