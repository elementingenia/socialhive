// Where an event happens (Iain, 2026-10-31). Three kinds:
//   onsite  -- a room from Admin > Locations (location_id is the truth;
//              booked as a common space, end time + clash rules apply)
//   village -- somewhere else in the village that isn't a bookable room:
//              a street, outside someone's home, the lawn by the lake.
//              Free text, no room, no space rules, no bus or cars.
//   offsite -- outside the village. Free text; bus and car-sharing allowed.
// Pure functions only (no DB imports) so this is unit-testable and safe to
// import from both server routes and client components.

export const LOCATION_TYPES = ["onsite", "village", "offsite"]

export const LOCATION_TYPE_LABELS = {
  onsite: "On-site",
  village: "In the village",
  offsite: "Off-site",
}

export const VILLAGE_LOCATION_MAX = 120

export const VILLAGE_PLACEHOLDER = "e.g. Outside 42 Banksia St, or the lawn by the lake"

export function normaliseLocationType(t) {
  return LOCATION_TYPES.includes(t) ? t : "onsite"
}

// One line, trimmed, capped. Village spots are short descriptions.
export function cleanVillageLocation(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, VILLAGE_LOCATION_MAX)
}

// Only Off-site events can have the community bus or car-sharing.
export function allowsTransport(locationType) {
  return locationType === "offsite"
}

// Server-side rules for a village event. Returns { error } or
// { location_id: null, location } to stamp onto the row. Also switches off
// any bus/car fields on the payload (the client already hides them; this is
// the safety net). Returns null for any other location type.
export function villageLocation(payload) {
  if (!payload || payload.location_type !== "village") return null
  const location = cleanVillageLocation(payload.location)
  if (!location) return { error: "Say where in the village the event is" }
  return { location_id: null, location }
}

export function stripTransport(payload) {
  if (!payload || allowsTransport(payload.location_type)) return payload
  payload.has_bus = false
  payload.bus_driver_id = null
  payload.bus_driver_name = null
  payload.bus_driver_free = false
  payload.bus_max_seats = null
  payload.allow_personal_vehicles = false
  return payload
}

// What to show residents as the location line.
export function locationDisplay(event) {
  if (!event?.location) return null
  return event.location_type === "offsite" ? event.location.split("\n")[0] : event.location
}
