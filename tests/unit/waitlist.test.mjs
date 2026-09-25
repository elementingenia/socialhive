// Unit tests for lib/waitlist.js -- the one waitlist-position rule every hub
// uses (BUG-067).
//
//   npm run test:unit

import { waitlistQueue, waitlistPositionMap, waitlistSummary, waitlistLabel } from '../../lib/waitlist.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }
const eq = (actual, expected, msg) => ok(JSON.stringify(actual) === JSON.stringify(expected), `${msg} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`)

// Mirrors the live Fire Pit Spit Roast Dinner (2026-09-26): one confirmed
// row + one waitlist row from the same member (a split), then two more
// waitlisted parties. Deliberately out of order to prove sorting.
const firePit = [
  { id: 'w3', member_id: 'C', status: 'waitlist',  seats: 2, booked_at: '2026-09-24T08:02:56.508Z' },
  { id: 'c1', member_id: 'A', status: 'confirmed', seats: 1, booked_at: '2026-09-23T07:30:09.413Z' },
  { id: 'w1', member_id: 'A', status: 'waitlist',  seats: 1, booked_at: '2026-09-23T07:30:10.932Z' },
  { id: 'x1', member_id: 'D', status: 'cancelled', seats: 1, booked_at: '2026-09-21T01:15:40.627Z' },
  { id: 'w2', member_id: 'B', status: 'waitlist',  seats: 2, booked_at: '2026-09-24T01:18:32.113Z' },
]

// ── waitlistQueue ────────────────────────────────────────────────────────
{
  eq(waitlistQueue(firePit).map(b => b.id), ['w1', 'w2', 'w3'], 'waitlist rows only, booked_at ascending (same order promoteWaitlist uses)')
  eq(waitlistQueue(null), [], 'null bookings -> empty queue, not a crash')
  const tie = [
    { id: 'b', status: 'waitlist', booked_at: '2026-01-01T00:00:00Z' },
    { id: 'a', status: 'waitlist', booked_at: '2026-01-01T00:00:00Z' },
  ]
  eq(waitlistQueue(tie).map(b => b.id), ['a', 'b'], 'identical booked_at -> stable id tie-break')
}

// ── waitlistPositionMap ──────────────────────────────────────────────────
{
  const m = waitlistPositionMap(firePit)
  eq(m.get('w1'), 1, 'earliest waitlist row is #1')
  eq(m.get('w3'), 3, 'latest waitlist row is #3')
  eq(m.get('c1'), undefined, 'confirmed rows have no position')
}

// ── waitlistSummary ──────────────────────────────────────────────────────
{
  eq(waitlistSummary(firePit, b => b.member_id === 'B'),
    { position: 2, my_waitlist_seats: 2, waitlist_count: 3, waitlist_seats: 5 },
    'member B is #2, 3 parties / 5 seats waiting')
  eq(waitlistSummary(firePit, b => b.member_id === 'A').position, 1, 'split booking: waitlist half still gets its position')
  eq(waitlistSummary(firePit, b => b.member_id === 'Z').position, null, 'not on the waitlist -> null position')
  eq(waitlistSummary([], () => true), { position: null, my_waitlist_seats: 0, waitlist_count: 0, waitlist_seats: 0 }, 'empty event')
  const twoRows = [
    { id: 'p', member_id: 'A', status: 'waitlist', seats: 1, booked_at: '2026-01-01T00:00:00Z' },
    { id: 'q', member_id: 'B', status: 'waitlist', seats: 1, booked_at: '2026-01-02T00:00:00Z' },
    { id: 'r', member_id: 'A', status: 'waitlist', seats: 3, booked_at: '2026-01-03T00:00:00Z' },
  ]
  eq(waitlistSummary(twoRows, b => b.member_id === 'A'), { position: 1, my_waitlist_seats: 4, waitlist_count: 3, waitlist_seats: 5 },
    'member with two waitlist rows gets their best (earliest) position and all their seats')
}

// ── waitlistLabel ────────────────────────────────────────────────────────
{
  eq(waitlistLabel(2), '#2 on waitlist', 'known position')
  eq(waitlistLabel(null), 'On waitlist', 'unknown position falls back cleanly')
}

console.log(`waitlist: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
