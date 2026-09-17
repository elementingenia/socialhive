// Unit tests for lib/vehicleSections.js -- the shared "who's driving, who's
// riding" builder consolidated 2026-09-17 after Iain caught a real gap: the
// first attendee-list/PDF-export round (PR #147) only fixed
// components/EventSlideOut.js's Coordinator View, not the three hub pages'
// own separate, inline "Attendees" accordions (Social, Special Events,
// Groups & Clubs) that every resident actually sees on the event tile.
//
//   npm run test:unit

import { buildCarSections, buildTransportExportSections } from '../../lib/vehicleSections.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

const resolveName = (m, fallback) => m?.name || fallback

// ── buildCarSections ────────────────────────────────────────────────────────

{
  const { carByOwner, carSections, carPeopleKeys } = buildCarSections([], [], resolveName)
  ok(Object.keys(carByOwner).length === 0, 'no offers/passengers -> empty carByOwner')
  ok(carSections.length === 0, 'no offers/passengers -> empty carSections')
  ok(carPeopleKeys.size === 0, 'no offers/passengers -> empty carPeopleKeys')
}

{
  // Iain driving, Scampi riding -- the exact real-world case this round was
  // built and fixed against.
  const offers = [{ id: 'offer-1', member_id: 'iain', seats_offered: 1, driver: { name: 'Iain Pallot' } }]
  const passengers = [{
    id: 'p1', vehicle_offer_id: 'offer-1', party_owner_member_id: 'scampi', member_id: 'scampi', contact_id: null, guest_name: null,
    passenger_member: { name: 'Scampi' }, passenger_contact: null,
    vehicle_offer: { member_id: 'iain', driver: { name: 'Iain Pallot' } },
  }]
  const { carByOwner, carSections, carPeopleKeys } = buildCarSections(offers, passengers, resolveName)
  ok(carByOwner['m:iain']?.role === 'driving' && carByOwner['m:iain'].seatsOffered === 1, 'driver gets a "driving" entry with their seat count')
  ok(carByOwner['m:scampi']?.role === 'riding' && carByOwner['m:scampi'].driverName === 'Iain Pallot', 'passenger gets a "riding" entry naming the driver')
  ok(carPeopleKeys.has('m:iain') && carPeopleKeys.has('m:scampi'), 'both driver and passenger are in carPeopleKeys')
  ok(carSections.length === 1 && carSections[0].driverName === 'Iain Pallot', 'one car section, named for the driver')
  ok(carSections[0].passengers.length === 1 && carSections[0].passengers[0].name === 'Scampi' && carSections[0].passengers[0].guest === false,
    'the passenger is nested under the driver\'s own car section, not flagged as a guest')
}

{
  // A zero-seat self-nomination ("driving myself, not offering a ride") --
  // still a valid driving state with no passengers.
  const offers = [{ id: 'offer-2', member_id: 'solo', seats_offered: 0, driver: { name: 'Solo Driver' } }]
  const { carByOwner, carSections } = buildCarSections(offers, [], resolveName)
  ok(carByOwner['m:solo']?.role === 'driving' && carByOwner['m:solo'].seatsOffered === 0, 'zero-seat self-nomination is still "driving"')
  ok(carSections[0].passengers.length === 0, 'zero-seat offer has no passengers')
}

{
  // Guest passenger (no member_id/contact_id) -- flagged as a guest, no
  // carByOwner entry of their own (guests have no owner identity to key on
  // unless they own the party, which a bare guest never does).
  const offers = [{ id: 'offer-3', member_id: 'driver1', seats_offered: 2, driver: { name: 'Driver One' } }]
  const passengers = [{
    id: 'p2', vehicle_offer_id: 'offer-3', party_owner_member_id: null, party_owner_contact_id: null, member_id: null, contact_id: null, guest_name: 'Jamie Guest',
    passenger_member: null, passenger_contact: null, vehicle_offer: { member_id: 'driver1', driver: { name: 'Driver One' } },
  }]
  const { carSections, carPeopleKeys } = buildCarSections(offers, passengers, resolveName)
  ok(carSections[0].passengers[0].name === 'Jamie Guest' && carSections[0].passengers[0].guest === true, 'a bare guest passenger is named and flagged as a guest')
  ok(carPeopleKeys.has('g:jamie guest'), 'a guest passenger is still tracked in carPeopleKeys by lower-cased name')
}

// ── buildTransportExportSections ────────────────────────────────────────────

const baseEvent = { has_bus: false, bus_driver_id: null, bus_driver: null, allow_personal_vehicles: true }

{
  const sections = buildTransportExportSections({ owners: [], event: baseEvent, carSections: [], carPeopleKeys: new Set() })
  ok(sections.length === 2, 'with no cars, returns exactly 2 sections: Bus, Own Way')
  ok(sections[0].heading.includes('Bus') && sections[0].rows.length === 0, 'empty Bus section when nobody rides the bus')
  ok(sections[sections.length - 1].heading.includes('Own Way') && sections[sections.length - 1].rows.length === 0, 'empty Own Way section when there are no owners')
}

{
  // Bus driver leads the Bus section (the exact bug Iain caught and had
  // corrected in PR #147 -- see EventSlideOut.js's own comment on this).
  const event = { has_bus: true, bus_driver_id: 'busdriver', bus_driver: { name: 'Chris Jardine' }, allow_personal_vehicles: false }
  const owners = [
    { key: 'm:busdriver', name: 'Chris Jardine', going: true, isBusRider: false, party: [] },
    { key: 'm:rider1', name: 'Rider One', going: true, isBusRider: true, party: [] },
  ]
  const sections = buildTransportExportSections({ owners, event, carSections: [], carPeopleKeys: new Set() })
  const busSection = sections[0]
  ok(busSection.rows[0].name === 'Chris Jardine' && busSection.rows[0].note === 'Driver', 'the bus driver is always the first row of the Bus section')
  ok(busSection.rows.some(r => r.name === 'Rider One'), 'a bus rider appears in the Bus section')
  ok(!busSection.rows.some(r => r.name === 'Chris Jardine' && r.note !== 'Driver'), 'the bus driver is not ALSO listed as a plain rider')
}

{
  // Own Way: an owner who chose neither bus nor car.
  const owners = [
    { key: 'm:onOwn', name: 'On Their Own', going: true, isBusRider: false, party: [] },
    { key: 'm:waitlisted', name: 'Waitlisted Person', going: false, isBusRider: false, party: [] },
  ]
  const sections = buildTransportExportSections({ owners, event: baseEvent, carSections: [], carPeopleKeys: new Set() })
  const ownWay = sections[sections.length - 1]
  ok(ownWay.rows.some(r => r.name === 'On Their Own'), 'an owner with no bus/car ends up in Own Way')
  ok(!ownWay.rows.some(r => r.name === 'Waitlisted Person'), 'a waitlist-only (not "going") owner is excluded from every transport section')
}

{
  // A car owner/passenger is excluded from Own Way, and the car section
  // itself lists driver-then-passengers.
  const carSections = [{ driverKey: 'm:driver1', driverName: 'Driver One', seatsOffered: 2, offerId: 'o1', passengers: [{ name: 'Rider Two', guest: false }] }]
  const carPeopleKeys = new Set(['m:driver1', 'm:rider2'])
  const owners = [
    { key: 'm:driver1', name: 'Driver One', going: true, isBusRider: false, party: [] },
    { key: 'm:rider2', name: 'Rider Two', going: true, isBusRider: false, party: [] },
  ]
  const sections = buildTransportExportSections({ owners, event: baseEvent, carSections, carPeopleKeys })
  ok(sections.length === 3, 'one extra section is added per car (Bus, car, Own Way)')
  const carSection = sections[1]
  ok(carSection.heading.includes("Driver One's car"), "the car section is headed with the driver's name")
  ok(carSection.rows[0].name === 'Driver One' && carSection.rows[0].note === 'Driver', 'the car section leads with its own driver')
  ok(carSection.rows[1].name === 'Rider Two' && carSection.rows[1].note === 'Passenger', 'the passenger follows the driver in the car section')
  const ownWay = sections[sections.length - 1]
  ok(!ownWay.rows.some(r => r.name === 'Driver One' || r.name === 'Rider Two'), 'both driver and passenger are excluded from Own Way')
}

{
  // Named party members (workstream A attendees) are checked individually,
  // same as the owner.
  const owners = [{
    key: 'm:booker', name: 'Booker', going: true, isBusRider: true,
    party: [
      { identityKey: 'm:plusone', label: 'Plus One', bus: false, guest: false },
      { identityKey: 'g:guest one', label: 'Guest One', bus: true, guest: true },
    ],
  }]
  const sections = buildTransportExportSections({ owners, event: baseEvent, carSections: [], carPeopleKeys: new Set() })
  const busSection = sections[0]
  const ownWay = sections[sections.length - 1]
  ok(busSection.rows.some(r => r.name === 'Booker'), 'the booker rides the bus')
  ok(busSection.rows.some(r => r.name === 'Guest One' && r.note === 'Named attendee (guest)'), 'a named guest riding the bus appears in the Bus section, flagged as a guest')
  ok(ownWay.rows.some(r => r.name === 'Plus One' && r.note === 'Named attendee'), 'a named resident attendee with no bus/car ends up in Own Way')
}

console.log(`\nlib/vehicleSections.js: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
