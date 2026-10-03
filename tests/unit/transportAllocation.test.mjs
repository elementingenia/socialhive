// Unit tests for lib/transportAllocation.js -- coordinator bus/car
// allocation (Iain, 2026-10-04).
//
//   npm run test:unit

import { validateTransportPlan, buildTransportMessage, transportLabel } from '../../lib/transportAllocation.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

const both = { has_bus: true, bus_max_seats: 10, allow_personal_vehicles: true }
const base = { event: both, bookingConfirmed: true, bookingSeats: 2, partySize: 2 }

// mode
ok(!validateTransportPlan({ ...base, mode: 'boat' }).ok, 'unknown mode rejected')
ok(validateTransportPlan({ ...base, mode: 'none' }).ok, 'own way always fine')
ok(validateTransportPlan({ mode: 'none', bookingConfirmed: false }).ok, 'own way fine even on a waitlist booking')

// confirmed + naming
ok(!validateTransportPlan({ ...base, mode: 'bus', bookingConfirmed: false }).ok, 'waitlist booking cannot ride')
{
  const r = validateTransportPlan({ ...base, mode: 'bus', bookingSeats: 3, partySize: 2 })
  ok(!r.ok && /1 still unnamed/.test(r.error), 'unnamed seat blocks bus with count')
}
ok(!validateTransportPlan({ ...base, mode: 'car', bookingSeats: 2, partySize: 1, offer: { seats_offered: 4 } }).ok, 'unnamed seat blocks car')

// bus
ok(!validateTransportPlan({ ...base, mode: 'bus', event: { ...both, has_bus: false } }).ok, 'no bus on event')
ok(validateTransportPlan({ ...base, mode: 'bus', busOthersUsed: 8 }).ok, 'bus with exactly 2 left fits 2')
{
  const r = validateTransportPlan({ ...base, mode: 'bus', busOthersUsed: 9 })
  ok(!r.ok && /needs 2 bus seats/.test(r.error), 'bus with 1 left rejects party of 2 (hard limit)')
}
ok(validateTransportPlan({ ...base, mode: 'bus', event: { ...both, bus_max_seats: null }, busOthersUsed: 500 }).ok, 'uncapped bus always fits')

// car
ok(!validateTransportPlan({ ...base, mode: 'car', event: { ...both, allow_personal_vehicles: false }, offer: { seats_offered: 4 } }).ok, 'cars off on event')
ok(!validateTransportPlan({ ...base, mode: 'car', offer: null }).ok, 'missing car rejected')
ok(!validateTransportPlan({ ...base, mode: 'car', offer: { seats_offered: 4 }, offerOwnedByParty: true }).ok, 'cannot be a passenger in own booking\'s car')
ok(validateTransportPlan({ ...base, mode: 'car', offer: { seats_offered: 3 }, carUsedByOthers: 1 }).ok, 'car with 2 left fits 2')
{
  const r = validateTransportPlan({ ...base, mode: 'car', offer: { seats_offered: 3 }, carUsedByOthers: 2 })
  ok(!r.ok && /for 2 people/.test(r.error), 'car with 1 left rejects party of 2 (hard limit)')
}

// driver
ok(validateTransportPlan({ ...base, mode: 'driver', partySize: 1, bookingSeats: 1, driverSeats: 0 }).ok, 'solo driver with 0 spare seats is fine')
ok(!validateTransportPlan({ ...base, mode: 'driver', driverSeats: -1 }).ok, 'negative seats rejected')
ok(!validateTransportPlan({ ...base, mode: 'driver', driverSeats: '' }).ok, 'blank seats rejected')
{
  const r = validateTransportPlan({ ...base, mode: 'driver', driverSeats: 0 })
  ok(!r.ok && /at least 1 spare seat/.test(r.error), 'driver must fit rest of own booking')
}
{
  const r = validateTransportPlan({ ...base, mode: 'driver', driverSeats: 2, othersInOwnCar: 2 })
  ok(!r.ok && /at least 3 spare seats/.test(r.error) && /2 already riding/.test(r.error), 'cannot shrink below riders already in the car')
}
{
  const r = validateTransportPlan({ ...base, mode: 'driver', driverSeats: 3, othersInOwnCar: 2 })
  ok(r.ok && r.seats === 3, 'driver seats returned as a number')
}
ok(!validateTransportPlan({ ...base, mode: 'driver', event: { ...both, allow_personal_vehicles: false }, driverSeats: 3 }).ok, 'driving needs cars on')

// messages
ok(/on the bus for Picnic/.test(buildTransportMessage({ mode: 'bus', eventTitle: 'Picnic' })), 'bus message')
ok(/seat in Jan's car for Picnic/.test(buildTransportMessage({ mode: 'car', eventTitle: 'Picnic', driverName: 'Jan' })), 'car message names driver')
ok(/driving your own car/.test(buildTransportMessage({ mode: 'driver', eventTitle: 'Picnic', isDriverSelf: true })), 'driver message for the driver')
ok(/seat in Jan's car/.test(buildTransportMessage({ mode: 'driver', eventTitle: 'Picnic', driverName: 'Jan', isDriverSelf: false })), 'driver message for the driver\'s party')
ok(/removed your bus\/car arrangement/.test(buildTransportMessage({ mode: 'none', eventTitle: 'Picnic' })), 'own-way message')

// label
ok(transportLabel({ carRole: 'driving', seatsOffered: 1 }) === '🚗 Driving (1 spare seat)', 'driving label')
ok(transportLabel({ carRole: 'riding', driverName: 'Jan' }) === "🧍 In Jan's car", 'riding label')
ok(transportLabel({ busRider: true }) === '🚌 Bus', 'bus label')
ok(transportLabel({}) === 'Own way', 'own way label')

console.log(`transportAllocation: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
