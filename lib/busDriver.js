// Bus driver: a resident (events.bus_driver_id) OR a named non-resident
// ("Other", events.bus_driver_name -- e.g. the Community Manager). Never
// both. Migration 125, Iain 2026-10-04.

export const BUS_DRIVER_NAME_MAX = 80

// Display name for the driver, or null when none is set. Accepts an event
// with the joined `bus_driver` member row (name/display_name/username) and/or
// the free-text `bus_driver_name`.
export function busDriverLabel(event) {
  if (!event) return null
  const m = event.bus_driver
  const resident = m ? (m.display_name || m.name || m.username || null) : null
  if (resident) return resident
  const other = typeof event.bus_driver_name === "string" ? event.bus_driver_name.trim() : ""
  return other || null
}

// Server-side normaliser for the two driver columns. Bus off -> both null.
// A resident id wins over a typed name (they are mutually exclusive).
// bus_driver_free (migration 145, Iain 2026-10-29): "Driver doesn't pay" --
// only meaningful for a resident driver (an Other driver has no seat).
export function normaliseBusDriver({ has_bus, bus_driver_id, bus_driver_name, bus_driver_free } = {}) {
  if (!has_bus) return { bus_driver_id: null, bus_driver_name: null, bus_driver_free: false }
  if (bus_driver_id) return { bus_driver_id, bus_driver_name: null, bus_driver_free: !!bus_driver_free }
  const name = typeof bus_driver_name === "string" ? bus_driver_name.trim().slice(0, BUS_DRIVER_NAME_MAX) : ""
  return { bus_driver_id: null, bus_driver_name: name || null, bus_driver_free: false }
}

// ── Resident bus driver gets a seat (Iain, 2026-10-29 -- Men's Race Day) ────
// A resident bus driver is going to the event, so they always hold a seat:
// booked automatically when they're made the driver, even if that takes the
// event one over its seat limit (the bus can't go without them). They never
// use a bus passenger seat, a car seat or "own way" -- their transport is
// "Bus driver". A driver who is replaced keeps their seat and is told to
// choose how they're getting there.

// The event's resident bus driver id, or null (bus off / non-resident driver).
export function residentBusDriverId(event) {
  if (!event || !event.has_bus) return null
  return event.bus_driver_id || null
}

export function isResidentBusDriver(event, memberId) {
  const id = residentBusDriverId(event)
  return !!id && !!memberId && id === memberId
}

// Named-party rows (self-service / walk-up payload, or stored rows): the
// driver is never a bus passenger.
export function stripDriverFromBus(attendees = [], driverId) {
  if (!driverId) return attendees
  return attendees.map(a => (a && a.member_id === driverId ? { ...a, is_bus_passenger: false } : a))
}

// What has to happen so the driver holds exactly one confirmed seat.
// bookings: the driver's OWN non-cancelled booking rows ({id,status,seats}).
// namedRows: booking_attendees rows naming the driver on someone else's
//   booking ({id, owner_id, owner_contact_id}).
// Returns { action, ... }:
//   "none"              -- no resident driver / bus off / open event
//   "keep_own"          -- driver has a confirmed booking (bookingId)
//   "keep_named"        -- driver is named on someone else's confirmed party
//   "promote_waitlist"  -- driver only has a waitlist row (bookingId, seats)
//   "create"            -- nothing at all: book them 1 confirmed seat
// confirmedOwnerKeys: Set of "m:<id>"/"c:<id>" for owners with a CONFIRMED
//   booking -- a name on a waitlist-only party isn't a seat yet.
export function planBusDriverSeat({ event, bookings = [], namedRows = [], confirmedOwnerKeys = new Set() }) {
  const driverId = residentBusDriverId(event)
  if (!driverId || event.booking_required === false || event.archived) return { action: "none" }
  const live = bookings.filter(b => b.status !== "cancelled")
  const confirmed = live.find(b => b.status === "confirmed")
  if (confirmed) return { action: "keep_own", driverId, bookingId: confirmed.id }
  const named = namedRows.find(r => confirmedOwnerKeys.has(r.owner_id ? `m:${r.owner_id}` : `c:${r.owner_contact_id}`))
  if (named) return { action: "keep_named", driverId, attendeeId: named.id }
  const wait = live.find(b => b.status === "waitlist")
  if (wait) return { action: "promote_waitlist", driverId, bookingId: wait.id, seats: wait.seats || 1 }
  return { action: "create", driverId }
}

// Label shown against the driver in attendee lists and the PDF.
export const BUS_DRIVER_TRANSPORT_LABEL = "Bus driver"
