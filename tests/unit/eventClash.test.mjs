// Unit tests for lib/eventClash.js — the pure space-validation rule.
//   npm run test:unit
//
// The "President" cases are the regression guard. needsSpaceValidation used to
// be /resident/i.test(locationName), and "P-resident" contains "resident", so a
// room called "President's Suite" was silently exempted from the end-time
// requirement AND from double-booking checks entirely.

import { needsSpaceValidation, spaceConflictMessage } from '../../lib/eventClash.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

// ── the rule ───────────────────────────────────────────────────────────────
ok(needsSpaceValidation({ location_type: 'onsite', bookable: true }),
   'onsite + bookable => validate')
ok(!needsSpaceValidation({ location_type: 'onsite', bookable: false }),
   'onsite + not bookable (Resident\'s Home) => exempt')
ok(!needsSpaceValidation({ location_type: 'offsite', bookable: true }),
   'offsite => exempt regardless of bookable')
ok(!needsSpaceValidation({ location_type: 'offsite', bookable: false }),
   'offsite + not bookable => exempt')

// ── fails CLOSED on unknown ────────────────────────────────────────────────
// An unrecognised location must still require an end time and still be
// clash-checked. Failing open would silently skip every rule.
ok(needsSpaceValidation({ location_type: 'onsite' }),
   'onsite with UNKNOWN bookable => still validates (fails closed)')
ok(needsSpaceValidation({ location_type: 'onsite', bookable: undefined }),
   'undefined bookable => still validates')
ok(needsSpaceValidation({ location_type: 'onsite', bookable: null }),
   'null bookable => still validates')

// ── REGRESSION: the name is no longer consulted at all ─────────────────────
// Under the old regex every one of these was exempt. They must now be governed
// purely by the flag, so a bookable room is checked whatever it is called.
for (const name of ["President's Suite", 'Presidents Lounge', 'Vice-President Room',
                    'Resident Parking', "Resident's Home"]) {
  ok(needsSpaceValidation({ location_type: 'onsite', bookable: true, locationName: name }),
     `"${name}" with bookable=true is validated (name must be irrelevant)`)
  ok(!needsSpaceValidation({ location_type: 'onsite', bookable: false, locationName: name }),
     `"${name}" with bookable=false is exempt (name must be irrelevant)`)
}

// ── the message still reads properly ───────────────────────────────────────
const msg = spaceConflictMessage('Community Lounge',
  { event_time: '18:00:00', event_end_time: '20:30:00', title: 'Bastille Day' })
ok(msg.includes('Community Lounge'), 'message names the space')
ok(msg.includes('Bastille Day'), 'message names the clashing event')
ok(msg.includes('6pm'), 'message formats the start time')
ok(msg.includes('8:30pm'), 'message formats the end time')
ok(spaceConflictMessage(null, { event_time: '18:00', event_end_time: '19:00' })
     .startsWith('That space'), 'falls back gracefully with no space name')

console.log(`eventClash: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
