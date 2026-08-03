// Unit tests for lib/spaceBookings.js — the pure parts (message formatting).
//   npm run test:unit
//
// findSpaceBookingConflict/checkSpaceAvailability/listAvailableLocations are
// I/O (they query space_bookings/locations/events) and are not unit-tested
// here, same convention as findSpaceConflict in lib/eventClash.js — verified
// live-fire against real data instead, not with a mocked db.

import { spaceBookingConflictMessage, toSpaceBookingWindow, validateSpaceBooking, BOOKING_REASON_MAX } from '../../lib/spaceBookings.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

// ── another space_booking (no event_id) ─────────────────────────────────────
const privateConflict = {
  starts_at: '2026-08-15T06:00:00+00:00', // 4pm AEST
  ends_at:   '2026-08-15T08:00:00+00:00', // 6pm AEST
  purpose: 'private', event_id: null, title: 'Family lunch',
}
const msg1 = spaceBookingConflictMessage('Community Lounge', privateConflict)
ok(msg1.includes('Community Lounge'), 'names the space')
ok(msg1.includes('another booking'), 'a private booking reads as "another booking", never the reason text')
ok(!msg1.includes('Family lunch'), 'NEVER reveals another resident\'s private reason')

// ── maintenance hold ─────────────────────────────────────────────────────────
const maint = { starts_at: '2026-08-15T00:00:00+00:00', ends_at: '2026-08-15T02:00:00+00:00',
                 purpose: 'maintenance', event_id: null, title: null }
ok(spaceBookingConflictMessage('Workshop', maint).includes('scheduled maintenance'),
   'a maintenance hold is named as such')

// ── an event-backed space_booking DOES name the event (not private) ────────
const eventBacked = { starts_at: '2026-08-15T06:00:00+00:00', ends_at: '2026-08-15T08:00:00+00:00',
                       purpose: 'event', event_id: 'e1', title: 'Bastille Day' }
ok(spaceBookingConflictMessage('Community Lounge', eventBacked).includes('Bastille Day'),
   'an event-backed row names the event, which is already public')

// ── graceful fallback ────────────────────────────────────────────────────────
ok(spaceBookingConflictMessage(null, privateConflict).startsWith('That space'),
   'falls back gracefully with no space name')

// ── toSpaceBookingWindow (the DST-aware composer) ──────────────────────────
const winter = toSpaceBookingWindow('2026-08-01', '14:00', '16:00')
ok(winter.starts_at === '2026-08-01T04:00:00.000Z', 'winter 2pm start composes to 4am UTC (AEST)')
ok(winter.ends_at   === '2026-08-01T06:00:00.000Z', 'winter 4pm end composes to 6am UTC (AEST)')

const summer = toSpaceBookingWindow('2026-12-25', '14:00', '16:00')
ok(summer.starts_at === '2026-12-25T03:00:00.000Z', 'summer 2pm start composes to 3am UTC (AEDT, one hour earlier than AEST would give)')

ok(toSpaceBookingWindow(null, '14:00', '16:00') === null, 'missing date => null, caller must validate before insert')
ok(toSpaceBookingWindow('2026-08-01', null, '16:00') === null, 'missing start time => null')

// A message built from a real composed window round-trips to the same time
// fmtTime would show for the equivalent event_time string -- proves the
// isoToSydneyHHMM conversion inside spaceBookingConflictMessage is correct,
// not just internally consistent with itself.
const roundTrip = spaceBookingConflictMessage('Cinema', {
  starts_at: winter.starts_at, ends_at: winter.ends_at, purpose: 'private', event_id: null,
})
ok(roundTrip.includes('2pm'), 'a window composed for 14:00 local reads back as 2pm, not shifted by the UTC storage')
ok(roundTrip.includes('4pm'), 'a window composed for 16:00 local reads back as 4pm')

// ── validateSpaceBooking ─────────────────────────────────────────────────────
const validBooking = { location_id: 'loc1', event_date: '2026-08-15', event_time: '14:00', event_end_time: '16:00', reason: 'Family lunch' }
ok(validateSpaceBooking(validBooking) === null, 'a fully filled-in booking is valid')
ok(validateSpaceBooking({ ...validBooking, location_id: null }) === 'Choose a space', 'missing location')
ok(validateSpaceBooking({ ...validBooking, event_date: null }) === 'Choose a date', 'missing date')
ok(validateSpaceBooking({ ...validBooking, event_time: null }) === 'Choose a start and end time', 'missing start time')
ok(validateSpaceBooking({ ...validBooking, event_end_time: null }) === 'Choose a start and end time', 'missing end time')
ok(validateSpaceBooking({ ...validBooking, event_end_time: '14:00' }) === 'End time must be after the start time', 'end equal to start is rejected')
ok(validateSpaceBooking({ ...validBooking, event_end_time: '13:00' }) === 'End time must be after the start time', 'end before start is rejected')
ok(validateSpaceBooking({ ...validBooking, reason: '' }) === 'Say what the space is for', 'empty reason rejected')
ok(validateSpaceBooking({ ...validBooking, reason: '   ' }) === 'Say what the space is for', 'whitespace-only reason rejected')
ok(validateSpaceBooking({ ...validBooking, reason: 'x'.repeat(BOOKING_REASON_MAX) }) === null, 'reason at exactly the cap is valid')
ok(validateSpaceBooking({ ...validBooking, reason: 'x'.repeat(BOOKING_REASON_MAX + 1) })?.includes(String(BOOKING_REASON_MAX)),
   'reason one over the cap is rejected and the message names the limit')

console.log(`spaceBookings: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
