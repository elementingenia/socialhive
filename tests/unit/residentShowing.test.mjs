// Unit tests for lib/residentShowing.js -- Show Time resident showing wizard.
//   npm run test:unit

import {
  cinemaCapacity, canUseWizard, validateResidentShowing, allResidentsAudience,
  resolveCoordinatorIds, DEFAULT_CINEMA_CAPACITY, NOTIFY_CHOICES,
} from '../../lib/residentShowing.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗', m)) }
const eq = (a, b, m) => ok(a === b, `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

// 2026-10-07 10:00 Sydney (AEDT, UTC+11) = 2026-10-06T23:00Z
const now = new Date('2026-10-06T23:00:00Z')
const good = {
  ingenia_confirmed: true, movie_id: 'm1', event_date: '2026-10-10',
  event_time: '18:00', event_end_time: '20:00', seats_kept: 2, notify: 'members',
}
const v = (patch, opts = {}) => validateResidentShowing({ ...good, ...patch }, { capacity: 20, now, ...opts })

// ── capacity ──────────────────────────────────────────────────────────────
eq(cinemaCapacity({ capacity: 30 }), 30, 'uses the Cinema location capacity')
eq(cinemaCapacity({ capacity: null }), DEFAULT_CINEMA_CAPACITY, 'no capacity => 20')
eq(cinemaCapacity(null), DEFAULT_CINEMA_CAPACITY, 'no location => 20')
eq(cinemaCapacity({ capacity: 0 }), DEFAULT_CINEMA_CAPACITY, 'zero capacity => 20')

// ── switch ────────────────────────────────────────────────────────────────
ok(!canUseWizard({ enabled: false, isManager: false }), 'switch off: residents cannot use it')
ok(canUseWizard({ enabled: false, isManager: true }), 'switch off: admins/Owners can trial it')
ok(canUseWizard({ enabled: true, isManager: false }), 'switch on: everyone')

// ── validation ────────────────────────────────────────────────────────────
eq(v({}), null, 'a complete movie showing is valid')
eq(v({ movie_id: null, showing_title: 'AFL Grand Final' }), null, 'a free-text showing is valid')
ok(/Ingenia/.test(v({ ingenia_confirmed: false })), 'no Ingenia booking blocks')
ok(/Ingenia/.test(v({ ingenia_confirmed: 'yes' })), 'only a real true counts as Yes')
ok(/showing/.test(v({ movie_id: null, showing_title: '  ' })), 'no movie and no title blocks')
ok(/80/.test(v({ movie_id: null, showing_title: 'x'.repeat(81) })), 'title over 80 blocks')
ok(/date/.test(v({ event_date: '' })), 'date required')
ok(/start/.test(v({ event_time: '' })), 'start time required')
ok(/end time/.test(v({ event_end_time: '' })), 'end time required')
ok(/passed/.test(v({ event_date: '2026-10-06' })), 'yesterday blocked')
ok(/passed/.test(v({ event_date: '2026-10-07', event_time: '09:00', event_end_time: '11:00' })), 'today, start already gone, blocked')
eq(v({ event_date: '2026-10-07', event_time: '19:00', event_end_time: '21:00' }), null, 'today, later start, fine')
ok(/after/.test(v({ event_end_time: '18:00' })), 'end equal to start blocked')
ok(/after/.test(v({ event_end_time: '17:00' })), 'end before start blocked')
eq(v({ seats_kept: 0 }), null, 'keeping no seats is allowed')
eq(v({ seats_kept: 20 }), null, 'keeping every seat is allowed')
ok(/20 seats/.test(v({ seats_kept: 21 })), 'more than capacity blocked')
ok(/seats/.test(v({ seats_kept: -1 })), 'negative blocked')
ok(/seats/.test(v({ seats_kept: 1.5 })), 'fraction blocked')
ok(/notify/.test(v({ notify: 'some' })), 'unknown notify choice blocked')
for (const n of NOTIFY_CHOICES) eq(v({ notify: n }), null, `notify ${n} allowed`)
ok(/name will be shown/.test(v({}, { isPrivate: true })), 'Private resident must acknowledge')
eq(v({ privacy_ack: true }, { isPrivate: true }), null, 'Private resident who acknowledged is fine')
eq(v({}, { isPrivate: false }), null, 'non-private needs no acknowledgement')

// ── all-residents audience ────────────────────────────────────────────────
const members = [
  { id: 'a', status: 'active', auth_id: 'x' },
  { id: 'b', status: 'active', auth_id: null },        // never signed in
  { id: 'c', status: 'active', auth_id: 'y', is_test: true },
  { id: 'd', status: 'inactive', auth_id: 'z' },
  { id: 'e', status: 'active', auth_id: 'w' },         // creator
  { id: 'f', status: 'active', auth_id: 'v' },         // Owner
]
eq(allResidentsAudience(members, ['e', 'f']).join(','), 'a', 'only signed-in, active, real residents, minus creator and Owners')
eq(allResidentsAudience(null).length, 0, 'no members => nobody')

// ── coordinators on edit ──────────────────────────────────────────────────
eq(resolveCoordinatorIds({ coordinator_ids: ['a', 'b', 'a'] }, { isManager: false }).ids.join(','), 'a,b', 'dedupes the list')
eq(resolveCoordinatorIds({ coordinator_id: 'a' }, { isManager: true }).ids.join(','), 'a', 'old single-coordinator body still works')
eq(resolveCoordinatorIds({ coordinator_ids: [] }, { isManager: true }).ids.length, 0, 'admins/Owners may clear the coordinator')
ok(!!resolveCoordinatorIds({ coordinator_ids: [] }, { isManager: false }).error, 'a coordinator cannot leave it with none')

console.log(`residentShowing: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
