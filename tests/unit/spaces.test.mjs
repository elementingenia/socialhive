// Unit tests for lib/spaces.js — space closure, capacity and clash wording.
//   npm run test:unit
//
// Two themes carry most of the weight:
//   * capacity must NEVER block (Iain: it "does not restrict it from having a
//     larger number") — only seed a default and warn.
//   * no message may claim a space is free. The Ingenia app books these rooms
//     too, so the Hive can only speak for its own bookings.

import {
  isClosedOn, closureMessage, validateClosure, reasonRemaining,
  defaultSeatsFor, capacityWarning, isOverlapError, overlapMessage,
  availabilityCaveat, toInstant, sydneyOffsetMinutes, REASON_MAX
} from '../../lib/spaces.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗', m)) }
const eq = (a, b, m) => ok(a === b, `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

const open   = { name: 'Cinema', booking_status: 'open' }
const bounded = { name: 'Workshop', booking_status: 'closed', closed_from: '2026-08-10',
                  closed_to: '2026-08-20', closed_reason: 'Floor resurfacing' }
const forever = { name: 'Pool area', booking_status: 'closed', closed_from: '2026-08-10',
                  closed_to: null, closed_reason: 'Pump failure' }

// ── closure windows ────────────────────────────────────────────────────────
ok(!isClosedOn(open, '2026-08-15'), 'an open location is never closed')
ok(!isClosedOn(bounded, '2026-08-09'), 'day before the closure starts => open')
ok(isClosedOn(bounded, '2026-08-10'), 'first day of the closure => closed')
ok(isClosedOn(bounded, '2026-08-15'), 'mid-closure => closed')
ok(isClosedOn(bounded, '2026-08-20'), 'last day is INCLUSIVE => closed')
ok(!isClosedOn(bounded, '2026-08-21'), 'day after => open again')
ok(isClosedOn(forever, '2026-08-10'), 'until-further-notice: first day closed')
ok(isClosedOn(forever, '2099-01-01'), 'until-further-notice never reopens on its own')
ok(!isClosedOn(forever, '2026-08-09'), 'until-further-notice: before the start => open')
ok(!isClosedOn(null, '2026-08-15'), 'null location => not closed (caller handles it)')
ok(!isClosedOn({ booking_status: 'closed' }, '2026-08-15'), 'closed with no start date => not enforced')

// ── wording ────────────────────────────────────────────────────────────────
eq(closureMessage(open, '2026-08-15'), null, 'no message for an open space')
ok(closureMessage(bounded, '2026-08-15').includes('to 2026-08-20'), 'bounded closure states both dates')
ok(closureMessage(bounded, '2026-08-15').includes('Floor resurfacing'), 'and the reason')
ok(closureMessage(forever, '2026-08-15').includes('until further notice'), 'open-ended closure says so')
ok(!closureMessage(forever, '2026-08-15').includes('null'), 'never leaks a null date into the text')
ok(closureMessage({ booking_status: 'closed', closed_from: '2026-08-10' }, '2026-08-15')
     .startsWith('This space'), 'falls back when the space has no name')

// ── admin form validation ──────────────────────────────────────────────────
eq(validateClosure({ booking_status: 'open' }), null, 'open needs no closure detail')
ok(validateClosure({ booking_status: 'closed' }), 'closed with no start date => error')
eq(validateClosure({ booking_status: 'closed', closed_from: '2026-08-10' }), null,
   'until-further-notice is valid with just a start')
ok(validateClosure({ booking_status: 'closed', closed_from: '2026-08-20', closed_to: '2026-08-10' }),
   'to-before-from => error')
eq(validateClosure({ booking_status: 'closed', closed_from: '2026-08-10', closed_to: '2026-08-10' }), null,
   'a single-day closure is valid')
eq(validateClosure({ booking_status: 'closed', closed_from: '2026-08-10', closed_reason: 'x'.repeat(100) }), null,
   'exactly 100 characters is allowed')
ok(validateClosure({ booking_status: 'closed', closed_from: '2026-08-10', closed_reason: 'x'.repeat(101) }),
   '101 characters => error')
eq(REASON_MAX, 100, 'the reason limit is 100')
eq(reasonRemaining('x'.repeat(40)), 60, 'remaining characters counted for the UI')
eq(reasonRemaining(''), 100, 'empty reason => full allowance')
eq(reasonRemaining(null), 100, 'null reason => full allowance')

// ── capacity SEEDS, never CAPS ─────────────────────────────────────────────
eq(defaultSeatsFor({ capacity: 64 }), 64, 'capacity seeds the default seats')
eq(defaultSeatsFor({ capacity: null }), 20, 'no capacity => app fallback')
eq(defaultSeatsFor({ capacity: 0 }), 20, 'zero capacity is ignored')
eq(defaultSeatsFor(null, 30), 30, 'null location => supplied fallback')
eq(capacityWarning({ name: 'Lounge', capacity: 10 }, 8), null, 'under capacity => no warning')
eq(capacityWarning({ name: 'Lounge', capacity: 10 }, 10), null, 'exactly at capacity => no warning')
ok(capacityWarning({ name: 'Lounge', capacity: 10 }, 30).includes('10'), 'over capacity => warns with the figure')
ok(capacityWarning({ name: 'Lounge', capacity: 10 }, 30).includes('30'), 'and the requested number')
ok(/fine if you know it fits/.test(capacityWarning({ name: 'Lounge', capacity: 10 }, 30)),
   'warning is advisory in tone — it must not read as a refusal')
eq(capacityWarning({ name: 'Lounge', capacity: null }, 500), null, 'no capacity => never warns')
eq(capacityWarning(null, 500), null, 'null location => never warns')

// ── overlap errors ─────────────────────────────────────────────────────────
ok(isOverlapError({ code: '23P01' }), 'SQLSTATE 23P01 is recognised')
ok(isOverlapError({ message: 'violates exclusion constraint "space_bookings_no_overlap"' }),
   'recognised by constraint name too')
ok(!isOverlapError({ code: '23505' }), 'a unique violation is NOT an overlap')
ok(!isOverlapError(null), 'null error => false')

// ── nothing may claim a space is free ──────────────────────────────────────
const om = overlapMessage('Cinema')
ok(om.includes('Cinema'), 'overlap message names the space')
ok(/Ingenia/.test(om), 'overlap message points at the Ingenia app')
ok(/another Hive event/.test(om), 'and scopes the claim to Hive bookings')
ok(/Ingenia/.test(availabilityCaveat()), 'the all-clear caveat mentions Ingenia')
ok(!/is free|is available/i.test(availabilityCaveat()),
   'the all-clear must NEVER say the space is free or available')
ok(!/is free|is available/i.test(om), 'nor may the overlap message')

// ── local date+time -> instant ─────────────────────────────────────────────
eq(toInstant('2026-08-01', '19:00').toISOString(), '2026-08-01T09:00:00.000Z',
   'AEST +10 composes to the right instant')
eq(toInstant('2026-08-01', '19:00', 660).toISOString(), '2026-08-01T08:00:00.000Z',
   'AEDT +11 shifts by an hour')
eq(toInstant(null, '19:00'), null, 'missing date => null')
eq(toInstant('2026-08-01', null), null, 'missing time => null')
eq(toInstant('not-a-date', '19:00'), null, 'garbage date => null')

// ── sydneyOffsetMinutes (DST-aware, backs the space-booking timestamp math) ─
eq(sydneyOffsetMinutes('2026-08-01'), 600, 'August (winter) => AEST, 600')
eq(sydneyOffsetMinutes('2026-07-01'), 600, 'July (winter) => AEST, 600')
eq(sydneyOffsetMinutes('2026-12-25'), 660, 'December (summer) => AEDT, 660')
eq(sydneyOffsetMinutes('2026-01-15'), 660, 'January (summer) => AEDT, 660')
// 2026-10-04 is the DST-start Sunday (clocks forward at 2am) -> already AEDT
// by the noon anchor. 2026-04-05 is DST-end Sunday (clocks back at 3am) ->
// already AEST by the noon anchor. Both prove the noon-anchor sidesteps the
// transition-hour ambiguity rather than landing on the wrong side of it.
eq(sydneyOffsetMinutes('2026-10-04'), 660, 'DST-start Sunday, noon anchor => already AEDT')
eq(sydneyOffsetMinutes('2026-04-05'), 600, 'DST-end Sunday, noon anchor => already AEST')
eq(sydneyOffsetMinutes(null), 600, 'null date => safe default 600')

// toInstant composed WITH the correct seasonal offset gives the right UTC
// instant in both seasons -- this is the bug a fixed default=600 alone would
// have shipped: a summer booking would land an hour off in every comparison.
eq(toInstant('2026-08-01', '14:00', sydneyOffsetMinutes('2026-08-01')).toISOString(),
   '2026-08-01T04:00:00.000Z', 'winter 2pm AEST => 4am UTC')
eq(toInstant('2026-12-25', '14:00', sydneyOffsetMinutes('2026-12-25')).toISOString(),
   '2026-12-25T03:00:00.000Z', 'summer 2pm AEDT => 3am UTC (one hour earlier than AEST would give)')

console.log(`spaces: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
