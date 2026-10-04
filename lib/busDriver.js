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
export function normaliseBusDriver({ has_bus, bus_driver_id, bus_driver_name } = {}) {
  if (!has_bus) return { bus_driver_id: null, bus_driver_name: null }
  if (bus_driver_id) return { bus_driver_id, bus_driver_name: null }
  const name = typeof bus_driver_name === "string" ? bus_driver_name.trim().slice(0, BUS_DRIVER_NAME_MAX) : ""
  return { bus_driver_id: null, bus_driver_name: name || null }
}
