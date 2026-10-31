// Unit tests for lib/bookingMode.js (optional booking / no-limit seats).
//   npm run test:unit
import {
  UNLIMITED_SEATS, isBookingOptional, isSeatsUnlimited, seatCapacity,
  normaliseBookingMode, comingLabel, bookedLabel,
} from '../../lib/bookingMode.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗', m)) }
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

eq(isBookingOptional({ booking_optional: true }), true, 'optional')
eq(isBookingOptional({ booking_optional: true, booking_required: false }), false, 'open-all-welcome beats optional')
eq(isBookingOptional(null), false, 'null event')
eq(isSeatsUnlimited({ seats_unlimited: true }), true, 'unlimited flag')
eq(isSeatsUnlimited({ booking_optional: true }), true, 'optional implies unlimited')
eq(isSeatsUnlimited({ max_seats: 20 }), false, 'normal event limited')

eq(seatCapacity({ max_seats: 20 }), 20, 'normal capacity')
eq(seatCapacity({ max_seats: '12' }), 12, 'string capacity')
eq(seatCapacity({}), 0, 'missing capacity 0')
eq(seatCapacity({ max_seats: 20, seats_unlimited: true }), UNLIMITED_SEATS, 'unlimited capacity')
eq(seatCapacity({ max_seats: 20, booking_optional: true }), UNLIMITED_SEATS, 'optional capacity')
ok(Number.isFinite(UNLIMITED_SEATS), 'unlimited is finite (JSON-safe)')

eq(normaliseBookingMode({ booking_optional: true, seats_unlimited: false, booking_required: true }),
  { booking_optional: true, seats_unlimited: true, booking_required: true }, 'optional forces unlimited')
eq(normaliseBookingMode({ booking_optional: 'yes' }), { booking_optional: false, seats_unlimited: false }, 'non-true -> false')
eq(normaliseBookingMode({ booking_required: false, booking_optional: true, seats_unlimited: true }),
  { booking_required: false, booking_optional: false, seats_unlimited: false }, 'open-all-welcome clears both')
eq(normaliseBookingMode({ booking_optional: false }), { booking_optional: false, seats_unlimited: false }, 'back to required clears unlimited')
eq(normaliseBookingMode({ booking_optional: false, seats_unlimited: true }), { booking_optional: false, seats_unlimited: true }, 'explicit no-limit kept')
eq(normaliseBookingMode({ title: 'x' }), { title: 'x' }, 'partial patch untouched')

eq(comingLabel(0), 'No one yet', 'none coming')
eq(comingLabel(3), '3 coming', 'three coming')
eq(bookedLabel(5), '5 booked · no limit', 'no-limit label')

console.log(`bookingMode: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
