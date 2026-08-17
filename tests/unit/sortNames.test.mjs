// Unit tests for lib/sortNames.js -- attendee-list ordering helpers.
//
//   npm run test:unit

import { byOwnThenName, ordinal } from '../../lib/sortNames.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }
const eq = (actual, expected, msg) => ok(actual === expected, `${msg} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`)

// ── byOwnThenName ────────────────────────────────────────────────────────
{
  ok(byOwnThenName(true, false, 'Zeb', 'Alice') < 0, 'own row sorts before everyone else, even alphabetically later')
  ok(byOwnThenName(false, true, 'Alice', 'Zeb') > 0, 'own row (as b) still sorts first')
  ok(byOwnThenName(false, false, 'alice', 'Bob') < 0, 'case-insensitive A-Z among non-own rows')
  eq(byOwnThenName(false, false, '', ''), 0, 'two blank names are equal, not a crash')
}

// ── ordinal ──────────────────────────────────────────────────────────────
{
  eq(ordinal(1), '1st', '1 => 1st')
  eq(ordinal(2), '2nd', '2 => 2nd')
  eq(ordinal(3), '3rd', '3 => 3rd')
  eq(ordinal(4), '4th', '4 => 4th')
  eq(ordinal(10), '10th', '10 => 10th, not 10st')
  eq(ordinal(11), '11th', '11 => 11th (the 1-exception band)')
  eq(ordinal(12), '12th', '12 => 12th (the 2-exception band)')
  eq(ordinal(13), '13th', '13 => 13th (the 3-exception band)')
  eq(ordinal(21), '21st', '21 => 21st (exception band doesn\'t apply past the teens)')
  eq(ordinal(22), '22nd', '22 => 22nd')
  eq(ordinal(23), '23rd', '23 => 23rd')
  eq(ordinal(101), '101st', '101 => 101st, three digits still work')
  eq(ordinal(111), '111th', '111 => 111th (the 1-exception band recurs every hundred)')
}

console.log(`sortNames: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
