// Shared "who's driving, who's riding" builder for the Personal Vehicle
// Offers feature (migrations 109/110). Consolidated here 2026-09-17 after
// Iain caught a real gap in the first attendee-list/PDF-export round
// (PR #147): that round only fixed components/EventSlideOut.js's
// CoordinatorPanel view. Every hub ALSO has its own separate, inline
// "Attendees" accordion + Export PDF on the event tile itself --
// app/(app)/social/events/page.js, app/(app)/special-events/events/page.js,
// and components/ClubHome.js all keep their own copy of the attendee list
// and export handler rather than going through EventSlideOut's shared
// panel (each file's own header comment on handleExportAttendees says so
// explicitly -- a deliberate, pre-existing pattern in this app, not
// something introduced by this feature). None of those three had ever been
// touched by the car/bus work, so a driver/passenger on Bowlers Unite
// (Groups & Clubs) saw nothing on the actual tile they were looking at,
// even though the exact same feature was working correctly in
// EventSlideOut's Coordinator View the whole time -- confirmed with a real
// Supabase query against the live vehicle_offer_passengers row before
// concluding this was a rendering gap and not a data gap.
//
// This function is the one place the vehicle_offers/vehicle_offer_passengers
// rows get turned into a per-person "driving" / "riding" status plus the
// resolved per-car passenger list -- every one of the four call sites above
// now builds its car state by calling this, so they can't drift apart from
// each other again the way the first round's fix and these three files
// already had.

export const VEHICLE_OFFER_SELECT =
  "id, member_id, seats_offered, driver:members!member_id(name, display_name, hide_name, username)"

export const VEHICLE_OFFER_PASSENGER_SELECT = `
  id, vehicle_offer_id, party_owner_member_id, party_owner_contact_id, member_id, contact_id, guest_name,
  passenger_member:members!member_id(name, display_name, hide_name, username),
  passenger_contact:contacts!contact_id(name),
  vehicle_offer:vehicle_offers!vehicle_offer_id(member_id, driver:members!member_id(name, display_name, hide_name, username))
`

// offers: rows from vehicle_offers (VEHICLE_OFFER_SELECT shape)
// passengers: rows from vehicle_offer_passengers (VEHICLE_OFFER_PASSENGER_SELECT shape)
// resolveName(memberRow, fallback): the caller's own name-resolution helper
//   (resolveMemberName wired to that page's own masking/canManage rules) --
//   kept as a parameter rather than imported so every call site's own
//   admin/masking behaviour is preserved exactly as it was before this
//   consolidation.
//
// Returns:
//   carByOwner:   { "m:<id>" | "c:<id>" -> { role: "driving", seatsOffered } | { role: "riding", driverName } }
//   carSections:  [{ driverKey, driverName, seatsOffered, offerId, passengers: [{ name, guest }] }]
//   carPeopleKeys: Set of every "m:"/"c:"/"g:" identity that's a driver or
//     passenger in ANY car for the event -- for "own way" exclusion in the
//     PDF export.
export function buildCarSections(offers = [], passengers = [], resolveName) {
  const carByOwner = {}
  const carSections = []
  const carPeopleKeys = new Set()

  for (const o of offers) {
    const key = `m:${o.member_id}`
    carByOwner[key] = { role: "driving", seatsOffered: o.seats_offered }
    carPeopleKeys.add(key)
    carSections.push({
      driverKey: key,
      driverName: resolveName(o.driver, "a resident"),
      seatsOffered: o.seats_offered,
      offerId: o.id,
      passengers: [],
    })
  }

  const sectionByOfferId = Object.fromEntries(carSections.map(s => [s.offerId, s]))
  for (const p of passengers) {
    // Fall back to the passenger's own identity if a row somehow has no
    // party owner stamped (pre-migration-110 rows).
    const key = p.party_owner_member_id ? `m:${p.party_owner_member_id}`
      : p.party_owner_contact_id ? `c:${p.party_owner_contact_id}`
      : p.member_id ? `m:${p.member_id}` : p.contact_id ? `c:${p.contact_id}` : null
    if (key) {
      const driverName = resolveName(p.vehicle_offer?.driver, "a resident")
      carByOwner[key] = { role: "riding", driverName }
    }
    const personKey = p.member_id ? `m:${p.member_id}` : p.contact_id ? `c:${p.contact_id}` : p.guest_name ? `g:${p.guest_name.trim().toLowerCase()}` : null
    if (personKey) carPeopleKeys.add(personKey)
    const section = sectionByOfferId[p.vehicle_offer_id]
    if (section) {
      const name = p.passenger_member ? resolveName(p.passenger_member, p.passenger_member?.username || "Resident")
        : p.passenger_contact ? p.passenger_contact.name : p.guest_name
      section.passengers.push({ name, guest: !p.member_id && !p.contact_id })
    }
  }

  return { carByOwner, carSections, carPeopleKeys }
}

// Builds the Bus/Car/"Own Way" sections for the attendee-list PDF export
// (Iain, follow-up on PR #145: "the Export PDF needs to accommodate both the
// bus and the cars in an event, so needs to list who is on the bus and who
// is the driver, then who is driving cars and who is going in those cars
// and finally any that have not chosen a ride anywhere and are assumed to
// be finding their own way"). Consolidated alongside buildCarSections above
// for the same reason -- every hub's own export handler now calls this
// instead of keeping its own copy, so they can't drift out of sync with
// each other the way the four attendee-list implementations already had.
//
// owners: one entry per confirmed booking owner --
//   { key: "m:<id>"|"c:<id>"|null, name, going: bool, isBusRider: bool,
//     party: [{ identityKey, label, bus: bool, guest: bool }] }
//   `going` is whether this owner actually has a confirmed (non-waitlist)
//   seat -- a waitlist-only party isn't attending yet, so it's excluded from
//   every transport section, same as the original implementation.
// event: needs has_bus, bus_driver_id, bus_driver, allow_personal_vehicles.
// carSections / carPeopleKeys: from buildCarSections() above, for this event.
export function buildTransportExportSections({ owners = [], event, carSections = [], carPeopleKeys = new Set() }) {
  const busRows = []
  const ownWayRows = []
  const busDriverIdentityKey = event.bus_driver_id ? `m:${event.bus_driver_id}` : null
  if (event.has_bus && event.bus_driver) {
    busRows.push({ name: event.bus_driver.name || event.bus_driver.username, seats: "", note: "Driver" })
  }
  for (const o of owners) {
    if (!o.going) continue
    const ownerIsBusDriver = !!busDriverIdentityKey && o.key === busDriverIdentityKey
    const ownerInCar = o.key ? carPeopleKeys.has(o.key) : false
    // The bus driver already has their own row above -- don't also list them
    // as a rider or "own way" just because they didn't separately tick
    // "riding the bus" on their own booking.
    if (!ownerIsBusDriver) {
      if (o.isBusRider) busRows.push({ name: o.name, seats: 1, note: "" })
      if (!o.isBusRider && !ownerInCar) ownWayRows.push({ name: o.name, seats: 1, note: "" })
    }
    for (const p of o.party || []) {
      const inCar = p.identityKey ? carPeopleKeys.has(p.identityKey) : false
      const isBusDriver = !!busDriverIdentityKey && p.identityKey === busDriverIdentityKey
      if (isBusDriver) continue
      if (p.bus) busRows.push({ name: p.label, seats: 1, note: p.guest ? "Named attendee (guest)" : "Named attendee" })
      if (!p.bus && !inCar) ownWayRows.push({ name: p.label, seats: 1, note: p.guest ? "Named attendee (guest)" : "Named attendee" })
    }
  }
  busRows.sort((a, b) => (a.note === "Driver" ? -1 : b.note === "Driver" ? 1 : a.name.localeCompare(b.name)))
  ownWayRows.sort((a, b) => a.name.localeCompare(b.name))

  const carSectionsForExport = carSections.map(s => ({
    heading: `🚗 ${s.driverName}'s car`,
    rows: [
      { name: s.driverName, seats: s.seatsOffered, note: "Driver" },
      ...s.passengers.map(p => ({ name: p.name, seats: 1, note: p.guest ? "Passenger (guest)" : "Passenger" })),
    ],
  }))

  // Spread this directly into an exportAttendeeListPdf `sections` array,
  // gated on `event.allow_personal_vehicles || event.has_bus` the same way
  // every call site already gates the Confirmed/Waitlist sections above it.
  return [
    { heading: "🚌 Community Bus", rows: busRows },
    ...carSectionsForExport,
    { heading: "🚶 Making Own Way (no bus or car chosen)", rows: ownWayRows },
  ]
}
