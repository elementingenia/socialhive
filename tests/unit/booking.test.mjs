// Unit tests for lib/booking.js — the reservation cut-off logic (workstream B,
// feedback round 2026-07-16). Pure logic, no DB, so it runs anywhere with node
// and guards the single source of truth shared by the server booking gate
// (app/api/bookings/route.js) and every hub's booking UI.
//
//   npm run test:unit

import { bookingsClosed, cutoffToInputValue, cutoffFromInputValue, cutoffLabel } from '../../lib/booking.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

const past   = new Date(Date.now() - 3600e3).toISOString()
const future = new Date(Date.now() + 3600e3).toISOString()

// bookingsClosed
ok(bookingsClosed({ reservation_cutoff: past })   === true,  'past cut-off => closed')
ok(bookingsClosed({ reservation_cutoff: future }) === false, 'future cut-off => open')
ok(bookingsClosed({ reservation_cutoff: null })   === false, 'null cut-off => open (current default behaviour)')
ok(bookingsClosed({})                             === false, 'missing cut-off => open')
ok(bookingsClosed(null)                           === false, 'null event => open, no crash')
ok(bookingsClosed({ reservation_cutoff: 'garbage' }) === false, 'unparseable cut-off => open (fail safe: never wrongly block)')

// datetime-local <-> ISO round-trip (timezone-stable in the running zone)
const iso = cutoffFromInputValue('2026-07-20T17:30')
ok(typeof iso === 'string' && iso.endsWith('Z'), 'cutoffFromInputValue yields a UTC ISO string')
ok(cutoffToInputValue(iso) === '2026-07-20T17:30', 'round-trip input->ISO->input is stable')
ok(cutoffFromInputValue('') === null, 'empty input => null (clears the field)')
ok(cutoffToInputValue(null) === '', 'null ISO => empty input value')
ok(cutoffToInputValue('garbage') === '', 'unparseable ISO => empty input value, no crash')
ok(cutoffLabel(iso).length > 0, 'cutoffLabel renders a non-empty label')
ok(cutoffLabel(null) === '', 'cutoffLabel(null) => empty string')

console.log(`\nlib/booking.js: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
