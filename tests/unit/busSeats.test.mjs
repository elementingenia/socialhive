// Unit tests for lib/busSeats.js — Community bus seat-usage math
// (migration 085, Iain 2026-08-19).
//
//   npm run test:unit

import { busSeatsUsed, validateBusRequest, requestedBusSeats } from '../../lib/busSeats.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

// busSeatsUsed
ok(busSeatsUsed({ bookings: [], attendees: [] }) === 0, 'no bookings/attendees => 0')
ok(busSeatsUsed({}) === 0, 'defaults to empty arrays when omitted entirely')
ok(busSeatsUsed({
  bookings: [{ status: 'confirmed', bus_passenger: true }, { status: 'confirmed', bus_passenger: false }],
  attendees: [],
}) === 1, 'only confirmed+bus_passenger owner bookings count')
ok(busSeatsUsed({
  bookings: [{ status: 'waitlist', bus_passenger: true }],
  attendees: [],
}) === 0, 'a waitlisted booking never counts toward bus usage, even if flagged')
ok(busSeatsUsed({
  bookings: [],
  attendees: [{ is_bus_passenger: true }, { is_bus_passenger: false }, { is_bus_passenger: true }],
}) === 2, 'attendee rows counted purely on is_bus_passenger')
ok(busSeatsUsed({
  bookings: [{ status: 'confirmed', bus_passenger: true }],
  attendees: [{ is_bus_passenger: true }, { is_bus_passenger: true }],
}) === 3, 'owner seat + attendee seats sum together')

// validateBusRequest
ok(validateBusRequest({ requested: 0, busMaxSeats: 5, othersUsed: 5 }).ok === true, 'requesting 0 seats always ok, even if bus is already full')
ok(validateBusRequest({ requested: 2, busMaxSeats: null, othersUsed: 999 }).ok === true, 'null busMaxSeats => uncapped, always ok')
ok(validateBusRequest({ requested: 2, busMaxSeats: 5, othersUsed: 2 }).ok === true, 'requested fits within remaining => ok')
{
  const r = validateBusRequest({ requested: 3, busMaxSeats: 5, othersUsed: 3 })
  ok(r.ok === false && r.remaining === 2 && /2 bus seats left/.test(r.error), 'requested exceeds remaining => rejected with remaining count')
}
{
  const r = validateBusRequest({ requested: 1, busMaxSeats: 5, othersUsed: 5 })
  ok(r.ok === false && r.remaining === 0 && r.error === 'The bus is full.', 'bus fully used already => "The bus is full."')
}
{
  const r = validateBusRequest({ requested: 2, busMaxSeats: 3, othersUsed: 4 })
  ok(r.ok === false && r.remaining === 0, 'othersUsed exceeding busMaxSeats clamps remaining to 0, never negative')
}
{
  const r = validateBusRequest({ requested: 2, busMaxSeats: 5, othersUsed: 4 })
  ok(r.ok === false && r.remaining === 1 && /1 bus seat left/.test(r.error), 'singular "seat" wording when exactly 1 remains')
}

// requestedBusSeats
ok(requestedBusSeats({ ownerWantsBus: false, attendees: [] }) === 0, 'owner not riding, no party => 0')
ok(requestedBusSeats({ ownerWantsBus: true, attendees: [] }) === 1, 'owner riding alone => 1')
ok(requestedBusSeats({ ownerWantsBus: true, attendees: [{ is_bus_passenger: true }, { is_bus_passenger: false }] }) === 2, 'owner + one flagged attendee => 2')
ok(requestedBusSeats({ ownerWantsBus: false, attendees: [{ is_bus_passenger: true }, { is_bus_passenger: true }] }) === 2, 'owner not riding, two flagged attendees => 2')
ok(requestedBusSeats({}) === 0, 'defaults to 0 when called with nothing')

console.log(`\nlib/busSeats.js: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
