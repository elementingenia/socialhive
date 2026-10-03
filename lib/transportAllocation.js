// Coordinator transport allocation (Iain, 2026-10-04): "the coordinator needs
// the ability to allocate people to being on the bus or in a car. This can be
// both when adding a walk up booking and once in the coordinators view of the
// booking."
//
// Decisions confirmed with Iain before building:
//   - One transport choice per BOOKING (the whole party), matching the car
//     rule from migration 110 ("whole party, same rule everywhere"). Choices:
//     none / bus / a specific car / driving their own car.
//   - The coordinator's choice WINS: anyone in the party already on the bus,
//     in another car, or driving is moved, not blocked. Residents still can't
//     do this to themselves (lib/vehicleOffers.js is unchanged).
//   - A coordinator CAN make a booking owner a driver -- including a
//     no-app contact, which self-service can never do.
//   - Capacity is a hard limit for coordinators too (bus_max_seats, a car's
//     seats_offered) -- a bus or car only has so many real seats.
//   - Every seat in the booking must be named before it can go on the bus or
//     in a car, because the bus driver / car driver needs names. Same rule
//     self-service bus already enforces (lib/attendees.js).
//
// Pure logic so it is unit-testable and the panel can mirror it.

import { validateBusRequest } from "./busSeats.js"
import { validateSeatsOffered, validateVehicleSeatRequest } from "./vehicleOffers.js"

export const TRANSPORT_MODES = ["none", "bus", "car", "driver"]

// mode: one of TRANSPORT_MODES
// event: { has_bus, bus_max_seats, allow_personal_vehicles }
// bookingConfirmed: owner has a confirmed (non-waitlist) booking
// bookingSeats: confirmed seat count on that booking
// partySize: owner + named attendees (identities that can be seated)
// busOthersUsed: bus seats used by everyone OUTSIDE this party
// offer: the chosen car (mode "car") -- { seats_offered } or null
// carUsedByOthers: passengers in that car who are NOT in this party
// offerOwnedByParty: the chosen car's driver is in this party
// driverSeats: spare seats the owner offers (mode "driver")
// othersInOwnCar: passengers from OTHER parties already in the owner's car
export function validateTransportPlan({
  mode, event = {}, bookingConfirmed, bookingSeats = 1, partySize = 1,
  busOthersUsed = 0, offer = null, carUsedByOthers = 0, offerOwnedByParty = false,
  driverSeats, othersInOwnCar = 0,
}) {
  if (!TRANSPORT_MODES.includes(mode)) return { ok: false, error: "Choose a transport option." }
  if (mode === "none") return { ok: true }

  if (!bookingConfirmed) {
    return { ok: false, error: "Transport can only be set on a confirmed booking, not one on the waitlist." }
  }
  if (partySize < bookingSeats) {
    const missing = bookingSeats - partySize
    return { ok: false, error: `Name every seat in this booking first (${missing} still unnamed) -- the driver needs to know who is coming.` }
  }

  if (mode === "bus") {
    if (!event.has_bus) return { ok: false, error: "This event doesn't have a bus." }
    const check = validateBusRequest({ requested: partySize, busMaxSeats: event.bus_max_seats, othersUsed: busOthersUsed })
    if (!check.ok) {
      return { ok: false, error: partySize > 1 ? `This booking needs ${partySize} bus seats. ${check.error}` : check.error }
    }
    return { ok: true }
  }

  if (!event.allow_personal_vehicles) {
    return { ok: false, error: "This event doesn't have car sharing turned on." }
  }

  if (mode === "car") {
    if (!offer) return { ok: false, error: "That car is no longer available." }
    if (offerOwnedByParty) {
      return { ok: false, error: "Someone in this booking is that car's driver -- choose Driving instead." }
    }
    const check = validateVehicleSeatRequest({ requested: partySize, seatsOffered: offer.seats_offered, currentUsed: carUsedByOthers })
    if (!check.ok) {
      return { ok: false, error: partySize > 1 ? `This booking is for ${partySize} people. ${check.error}` : check.error }
    }
    return { ok: true }
  }

  // mode === "driver"
  const seatsCheck = validateSeatsOffered(driverSeats)
  if (!seatsCheck.ok) return seatsCheck
  const needed = (partySize - 1) + othersInOwnCar
  if (seatsCheck.seats < needed) {
    const parts = []
    if (partySize > 1) parts.push(`${partySize - 1} from this booking`)
    if (othersInOwnCar > 0) parts.push(`${othersInOwnCar} already riding in this car`)
    return { ok: false, error: `Offer at least ${needed} spare seat${needed === 1 ? "" : "s"} (${parts.join(", ")}).` }
  }
  return { ok: true, seats: seatsCheck.seats }
}

// Notification text for a party member whose transport the coordinator set.
export function buildTransportMessage({ mode, eventTitle, driverName, isDriverSelf }) {
  const title = eventTitle || "this event"
  if (mode === "bus") return `The Event Coordinator has put you on the bus for ${title}.`
  if (mode === "car") return `The Event Coordinator has given you a seat in ${driverName ? `${driverName}'s car` : "a car"} for ${title}.`
  if (mode === "driver") {
    return isDriverSelf
      ? `The Event Coordinator has listed you as driving your own car to ${title}.`
      : `The Event Coordinator has given you a seat in ${driverName ? `${driverName}'s car` : "your booking's car"} for ${title}.`
  }
  return `The Event Coordinator has removed your bus/car arrangement for ${title}. Please make your own way or choose again.`
}

// Short label for the panel ("how is this booking getting there").
export function transportLabel({ busRider, carRole, driverName, seatsOffered }) {
  if (carRole === "driving") return `🚗 Driving (${seatsOffered} spare seat${seatsOffered === 1 ? "" : "s"})`
  if (carRole === "riding") return `🧍 In ${driverName}'s car`
  if (busRider) return "🚌 Bus"
  return "Own way"
}
