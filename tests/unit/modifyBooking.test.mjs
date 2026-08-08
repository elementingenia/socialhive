// Unit tests for lib/modifyBooking.js — shared seat-modification rules used
// by self-service PATCH /api/bookings and the admin/EC "modify_booking"
// action (2026-08-08). Pure logic, no DB.
//
//   npm run test:unit

import { maxSeatsPerBooking, planSeatModification } from '../../lib/modifyBooking.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

// maxSeatsPerBooking — reads the per-event cap instead of a hardcoded 4
ok(maxSeatsPerBooking({ max_seats_per_booking: 10 }) === 10, 'respects an event configured above 4 (e.g. Social)')
ok(maxSeatsPerBooking({ max_seats_per_booking: 2 })  === 2,  'respects an event configured below 4')
ok(maxSeatsPerBooking({ max_seats_per_booking: null }) === 4, 'null => default of 4')
ok(maxSeatsPerBooking({})                              === 4, 'missing field => default of 4')
ok(maxSeatsPerBooking(null)                            === 4, 'null event => default of 4, no crash')
ok(maxSeatsPerBooking({ max_seats_per_booking: 0 })    === 4, 'zero => default of 4 (0 is not a valid cap)')
ok(maxSeatsPerBooking({ max_seats_per_booking: -3 })   === 4, 'negative => default of 4')

// planSeatModification — cap enforcement
const bigEvent = { max_seats: 100, max_seats_per_booking: 10 }
let p = planSeatModification({ event: bigEvent, requestedSeats: 8, oldConfirmed: 2, oldWaitlisted: 0, othersConfirmed: 0 })
ok(p.ok && p.seats === 8, 'allows growing up to the per-event cap (10)')
p = planSeatModification({ event: bigEvent, requestedSeats: 15, oldConfirmed: 2, oldWaitlisted: 0, othersConfirmed: 0 })
ok(p.ok && p.seats === 10, 'clamps a request above the per-event cap down to the cap')

const defaultEvent = { max_seats: 20 } // no max_seats_per_booking set
p = planSeatModification({ event: defaultEvent, requestedSeats: 6, oldConfirmed: 1, oldWaitlisted: 0, othersConfirmed: 0 })
ok(p.ok && p.seats === 4, 'falls back to the default cap of 4 when the event has none set')

// Already-split booking: growth blocked, shrink allowed
const splitState = { event: { max_seats: 10, max_seats_per_booking: 4 }, oldConfirmed: 1, oldWaitlisted: 1, othersConfirmed: 9 }
p = planSeatModification({ ...splitState, requestedSeats: 3 })
ok(p.ok === false && p.code === 'already_split', 'blocks growing a booking that already has a waitlist portion')
p = planSeatModification({ ...splitState, requestedSeats: 2 })
ok(p.ok === true && p.newConfirmed + p.newWaitlisted === 2, 'shrinking a split booking (2 -> still <= current total) is allowed')
p = planSeatModification({ ...splitState, requestedSeats: 1 })
ok(p.ok === true, 'shrinking further below the confirmed portion is allowed')

// Not currently split: growing beyond available capacity auto-splits
// (matches existing self-service behaviour — this function doesn't itself
// decide "closed", callers pass that in)
const roomyState = { event: { max_seats: 10, max_seats_per_booking: 4 }, oldConfirmed: 1, oldWaitlisted: 0, othersConfirmed: 9 }
p = planSeatModification({ ...roomyState, requestedSeats: 3 })
ok(p.ok === true && p.newConfirmed === 1 && p.newWaitlisted === 2, 'growing an unsplit booking past available capacity splits confirmed/waitlist rather than blocking')

// Reservation cut-off
p = planSeatModification({ event: { max_seats: 20, max_seats_per_booking: 4 }, requestedSeats: 3, oldConfirmed: 2, oldWaitlisted: 0, othersConfirmed: 0, closed: true })
ok(p.ok === false && p.code === 'bookings_closed', 'blocks growth once bookings have closed')
p = planSeatModification({ event: { max_seats: 20, max_seats_per_booking: 4 }, requestedSeats: 1, oldConfirmed: 2, oldWaitlisted: 0, othersConfirmed: 0, closed: true })
ok(p.ok === true, 'shrinking is still allowed once bookings have closed')
p = planSeatModification({ event: { max_seats: 20, max_seats_per_booking: 4 }, requestedSeats: 2, oldConfirmed: 2, oldWaitlisted: 0, othersConfirmed: 0, closed: true })
ok(p.ok === true, 'an unchanged seat count is not "growing" even when closed')

console.log(`\nlib/modifyBooking.js: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
