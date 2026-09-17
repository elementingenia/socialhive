// Unit tests for lib/vehicleOffers.js — Personal vehicle offers
// (migration 109, Iain 2026-09-17).
//
//   npm run test:unit

import {
  validateSeatsOffered,
  vehicleSeatsUsed,
  validateVehicleSeatRequest,
  isDriverIneligibleAsPassenger,
  checkBusVehicleExclusivity,
  validateVehiclePassenger,
  validateDriverSelfNomination,
  validateBumpReason,
} from '../../lib/vehicleOffers.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

// validateSeatsOffered
ok(validateSeatsOffered(0).ok === true && validateSeatsOffered(0).seats === 0, 'zero seats is a valid, meaningful state (driving myself, not offering a ride)')
ok(validateSeatsOffered(4).ok === true && validateSeatsOffered(4).seats === 4, 'a positive integer is valid')
ok(validateSeatsOffered(-1).ok === false, 'negative rejected')
ok(validateSeatsOffered(1.5).ok === false, 'non-integer rejected')
ok(validateSeatsOffered('abc').ok === false, 'non-numeric string rejected')
ok(validateSeatsOffered('').ok === false, 'empty string rejected')
ok(validateSeatsOffered(undefined).ok === false, 'undefined rejected')
ok(validateSeatsOffered('3').ok === true && validateSeatsOffered('3').seats === 3, 'numeric string coerced')

// vehicleSeatsUsed
ok(vehicleSeatsUsed([]) === 0, 'no passengers => 0')
ok(vehicleSeatsUsed() === 0, 'defaults to empty array when omitted')
ok(vehicleSeatsUsed([{}, {}, {}]) === 3, 'counts every passenger row regardless of nominated_by_driver')

// validateVehicleSeatRequest
ok(validateVehicleSeatRequest({ requested: 1, seatsOffered: 0, currentUsed: 0 }).ok === false, 'zero-seat offer has no room for any passenger')
ok(validateVehicleSeatRequest({ requested: 1, seatsOffered: 3, currentUsed: 1 }).ok === true, 'requested fits within remaining => ok')
{
  const r = validateVehicleSeatRequest({ requested: 1, seatsOffered: 2, currentUsed: 2 })
  ok(r.ok === false && r.remaining === 0 && /full/.test(r.error), 'full car rejected with "full" wording')
}
{
  const r = validateVehicleSeatRequest({ requested: 2, seatsOffered: 3, currentUsed: 2 })
  ok(r.ok === false && r.remaining === 1 && /1 seat left/.test(r.error), 'singular "seat" wording when exactly 1 remains')
}
{
  const r = validateVehicleSeatRequest({ requested: 2, seatsOffered: 5, currentUsed: 1 })
  ok(r.ok === true && r.remaining === 4, 'remaining computed correctly on success')
}

// isDriverIneligibleAsPassenger — self-nomination as driver at all excludes from passenger pool
ok(isDriverIneligibleAsPassenger({ alreadyDrivingEvent: true }).ok === false, 'already driving (even with 0 seats offered) excludes from being a passenger')
ok(isDriverIneligibleAsPassenger({ alreadyDrivingEvent: false }).ok === true, 'not driving => eligible on this check')

// checkBusVehicleExclusivity — extends fully to riders, both directions, no exceptions
ok(checkBusVehicleExclusivity({ isBusRider: true, wantsVehicleRole: 'passenger' }).ok === false, 'bus rider cannot also be a car passenger')
ok(checkBusVehicleExclusivity({ isBusRider: true, wantsVehicleRole: 'driver' }).ok === false, 'bus rider cannot also be a car driver')
ok(checkBusVehicleExclusivity({ isBusRider: false, wantsVehicleRole: 'passenger' }).ok === true, 'non bus-rider is fine as a passenger')
ok(checkBusVehicleExclusivity({ isBusRider: false, wantsVehicleRole: 'driver' }).ok === true, 'non bus-rider is fine as a driver')

// validateVehiclePassenger — composes attendee/driver/bus/elsewhere checks
ok(validateVehiclePassenger({ isAttendee: false, alreadyDrivingEvent: false, isBusRider: false, alreadyPassengerElsewhere: false }).ok === false, 'must be a genuine attendee of the event')
ok(validateVehiclePassenger({ isAttendee: true, alreadyDrivingEvent: true, isBusRider: false, alreadyPassengerElsewhere: false }).ok === false, 'already self-nominated as a driver => excluded')
ok(validateVehiclePassenger({ isAttendee: true, alreadyDrivingEvent: false, isBusRider: true, alreadyPassengerElsewhere: false }).ok === false, 'already riding the bus => excluded')
ok(validateVehiclePassenger({ isAttendee: true, alreadyDrivingEvent: false, isBusRider: false, alreadyPassengerElsewhere: true }).ok === false, 'already a passenger in another car => excluded')
ok(validateVehiclePassenger({ isAttendee: true, alreadyDrivingEvent: false, isBusRider: false, alreadyPassengerElsewhere: false }).ok === true, 'eligible attendee with no conflicts => ok')

// validateDriverSelfNomination — mirror check for the driver side
ok(validateDriverSelfNomination({ isAttendee: false, isBusRider: false, alreadyPassengerElsewhere: false }).ok === false, 'must be a genuine attendee to self-nominate as driver')
ok(validateDriverSelfNomination({ isAttendee: true, isBusRider: true, alreadyPassengerElsewhere: false }).ok === false, 'a bus rider cannot self-nominate as a vehicle driver')
ok(validateDriverSelfNomination({ isAttendee: true, isBusRider: false, alreadyPassengerElsewhere: true }).ok === false, 'already riding in someone else\'s car cannot self-nominate as driver too')
ok(validateDriverSelfNomination({ isAttendee: true, isBusRider: false, alreadyPassengerElsewhere: false }).ok === true, 'eligible attendee with no conflicts can self-nominate')

// validateBumpReason — required for a driver-initiated removal, not for a self-withdrawal
ok(validateBumpReason('').ok === false, 'empty reason rejected')
ok(validateBumpReason('   ').ok === false, 'whitespace-only reason rejected')
ok(validateBumpReason(undefined).ok === false, 'missing reason rejected')
ok(validateBumpReason('Need the seat for my partner instead').ok === true, 'a real reason is accepted')
ok(validateBumpReason('  trimmed  ').reason === 'trimmed', 'reason is trimmed before being stored/sent')

console.log(`\nlib/vehicleOffers.js: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
