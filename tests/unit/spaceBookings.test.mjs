// Unit tests for lib/spaceBookings.js — the pure parts (message formatting).
//   npm run test:unit
//
// findSpaceBookingConflict/checkSpaceAvailability/listAvailableLocations are
// I/O (they query space_bookings/locations/events) and are not unit-tested
// here, same convention as findSpaceConflict in lib/eventClash.js — verified
// live-fire against real data instead, not with a mocked db.

import { spaceBookingConflictMessage, toSpaceBookingWindow, validateSpaceBooking, BOOKING_REASON_MAX, validateIngeniaConfirmation, INGENIA_CONFIRMED_BY_MAX } from '../../lib/spaceBookings.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

// ── another space_booking (no event_id) ─────────────────────────────────────
//
// REVISED (Iain, 2026-08-17, Social_Hive_Location_First_Booking_Scope_v2.md
// item 5): personal bookings are no longer anonymised -- who booked it and
// why now follow the exact same Attendees-list rule as everywhere else
// (resolveMemberName), superseding the 2026-08-04 "another booking, no
// name, no reason" behaviour these tests used to assert.
const privateConflict = {
  starts_at: '2026-08-15T06:00:00+00:00', // 4pm AEST
  ends_at:   '2026-08-15T08:00:00+00:00', // 6pm AEST
  purpose: 'private', event_id: null, title: 'Family lunch',
  member: { id: 'm1', name: 'Jane Smith', display_name: 'Jane S.', hide_name: false },
}
const msg1 = spaceBookingConflictMessage('Community Lounge', privateConflict)
ok(msg1.includes('Community Lounge'), 'names the space')
ok(msg1.includes('Jane S.'), 'names the booker by their Display Name, same rule as the Attendees list')
ok(msg1.includes('Family lunch'), 'shows the booking reason too, no longer hidden')
ok(!msg1.includes('another booking'), 'the old anonymised wording is gone')

// Masked booker (hide_name set) -- still falls back to "a resident", same as
// resolveMemberName's fallback everywhere else.
const maskedConflict = { ...privateConflict, member: { id: 'm2', name: 'Bob Jones', display_name: 'Bob J.', hide_name: true } }
const msgMasked = spaceBookingConflictMessage('Community Lounge', maskedConflict)
ok(msgMasked.includes('a resident'), 'a booker with hide_name set is masked to "a resident" for an ordinary viewer')
ok(!msgMasked.includes('Bob J.'), 'a masked booker\'s name is never shown to a non-privileged viewer')

// An admin/EC/Owner viewer (canManage) sees the Real Name, same as every
// other Attendees-list surface.
const msgAdmin = spaceBookingConflictMessage('Community Lounge', privateConflict, { canManage: true })
ok(msgAdmin.includes('Jane S.'), 'an admin viewer still sees the Display Name (no Real Name override unless it differs)')

// No member row at all (defensive -- shouldn't happen in practice, but the
// function must not throw) falls back to "a resident".
const msgNoMember = spaceBookingConflictMessage('Community Lounge', { ...privateConflict, member: null })
ok(msgNoMember.includes('a resident'), 'no member row falls back to "a resident" rather than throwing')

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

// ── validateIngeniaConfirmation ("Request Only" locations, 2026-08-04) ──────
// No admin exemption here (corrected same day, Iain: "we are talking about
// Admins creating events not Admins as individuals ... any individual
// booking a space outside a HUB or Groups/club is treated the same way") --
// Personal Space Booking is for personal use regardless of who's using it,
// unlike event creation where an admin is trusted because the event is
// inherently community-based.
ok(validateIngeniaConfirmation({ requestOnly: false, ingeniaConfirmed: false, ingeniaConfirmedBy: '' }) === null,
   'an ordinary (non-Request-Only) location never needs confirmation')
ok(validateIngeniaConfirmation({ requestOnly: true, ingeniaConfirmed: false, ingeniaConfirmedBy: '' }) !== null,
   'a Request Only space with the box unchecked is rejected -- no admin exemption')
ok(validateIngeniaConfirmation({ requestOnly: true, ingeniaConfirmed: true, ingeniaConfirmedBy: '' }) !== null,
   'checked but no name given is still rejected')
ok(validateIngeniaConfirmation({ requestOnly: true, ingeniaConfirmed: true, ingeniaConfirmedBy: '   ' }) !== null,
   'whitespace-only name is rejected, same as a real reason field elsewhere in this app')
ok(validateIngeniaConfirmation({ requestOnly: true, ingeniaConfirmed: true, ingeniaConfirmedBy: 'Jane at Ingenia' }) === null,
   'checked + a real name is accepted')
ok(validateIngeniaConfirmation({ requestOnly: true, ingeniaConfirmed: true, ingeniaConfirmedBy: 'x'.repeat(INGENIA_CONFIRMED_BY_MAX) }) === null,
   'name at exactly the cap is valid')
ok(validateIngeniaConfirmation({ requestOnly: true, ingeniaConfirmed: true, ingeniaConfirmedBy: 'x'.repeat(INGENIA_CONFIRMED_BY_MAX + 1) })?.includes(String(INGENIA_CONFIRMED_BY_MAX)),
   'name one over the cap is rejected and the message names the limit')

console.log(`spaceBookings: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
