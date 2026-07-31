// Unit tests for lib/occupancy.js — household/house-number derivation.
//   npm run test:unit
//
// The purged-person tests matter most: they are what prove the app stays
// readable after a purge, which is the behaviour migration 069's snapshots exist
// to guarantee.

import {
  currentOccupants, currentOccupancyFor, houseNumberFor, householdOf,
  occupancyHistory, occupantLabel, derivePropertyStatus, closeOccupancy,
  vacantProperties
} from '../../lib/occupancy.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }
const eq = (a, b, msg) => ok(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

const P = { p45: 'prop-45', p12: 'prop-12', p99: 'prop-99' }
const properties = [
  { id: P.p45, ref: '45', sort_order: 45, status: 'occupied' },
  { id: P.p12, ref: '12', sort_order: 12, status: 'occupied' },
  { id: P.p99, ref: '99', sort_order: 99, status: 'unbuilt' }
]
// #45: Marjorie (current) + Doris (current) = a two-person household
// #12: Bob current; Robert moved out in 2024; Wend purged (person_id null)
const occ = [
  { id: 'o1', person_id: 'marjorie', property_id: P.p45, from_date: '2024-01-10', to_date: null, person_name_at_time: 'Marjorie Adams' },
  { id: 'o2', person_id: 'doris',    property_id: P.p45, from_date: '2024-01-10', to_date: null, person_name_at_time: 'Doris Sacco' },
  { id: 'o3', person_id: 'bob',      property_id: P.p12, from_date: '2025-06-01', to_date: null, person_name_at_time: 'Bob Pimm' },
  { id: 'o4', person_id: 'robert',   property_id: P.p12, from_date: '2023-02-01', to_date: '2024-11-30', person_name_at_time: 'Robert Older' },
  { id: 'o5', person_id: null,       property_id: P.p12, from_date: '2022-01-01', to_date: '2023-01-31', person_name_at_time: 'Wend Purged' }
]

// ── current occupants ───────────────────────────────────────────────────────
eq(currentOccupants(occ, P.p45).length, 2, '#45 has two current occupants')
eq(currentOccupants(occ, P.p12).length, 1, '#12 has one current occupant (past ones excluded)')
eq(currentOccupants(occ, P.p99).length, 0, 'unbuilt property has none')
eq(currentOccupants(null, P.p45).length, 0, 'null input => empty, not a throw')

// ── current occupancy for a person ─────────────────────────────────────────
eq(currentOccupancyFor(occ, 'bob').id, 'o3', 'finds Bob\'s current occupancy')
eq(currentOccupancyFor(occ, 'robert'), null, 'a moved-out person has no CURRENT occupancy')
eq(currentOccupancyFor(occ, 'nobody'), null, 'unknown person => null')
eq(currentOccupancyFor(occ, null), null, 'null personId => null')

// ── house number, replacing the duplicated column ──────────────────────────
eq(houseNumberFor(occ, 'doris', properties), '45', 'house number derived from occupancy')
eq(houseNumberFor(occ, 'bob', properties), '12', 'house number for #12')
eq(houseNumberFor(occ, 'robert', properties), null, 'moved-out person has no house number')
eq(houseNumberFor(occ, 'nobody', properties), null, 'unknown person => null')

// ── household = "book for the house", with no households table ─────────────
const h = householdOf(occ, 'doris')
eq(h.length, 1, 'Doris\'s household is one other person')
eq(h[0].person_id, 'marjorie', 'and that person is Marjorie')
eq(householdOf(occ, 'bob').length, 0, 'Bob lives alone => empty household')
eq(householdOf(occ, 'robert').length, 0, 'moved-out person has no household')
// the naive bug: a person with no occupancy matching everyone with property_id undefined
eq(householdOf(occ, 'nobody').length, 0, 'unknown person gets NOBODY, not everybody')
ok(!householdOf(occ, 'doris').some((o) => o.person_id === 'doris'),
   'household never includes the person themselves')

// ── history survives a purge ───────────────────────────────────────────────
const hist = occupancyHistory(occ, P.p12)
eq(hist.length, 3, '#12 has three historical occupancies')
eq(hist[0].person_id, 'bob', 'newest first')
eq(hist[2].person_name_at_time, 'Wend Purged', 'the purged person is still in the history')
eq(hist[2].person_id, null, 'purged person has no id')
eq(occupantLabel(hist[2]), 'Wend Purged', 'a purged occupant is still NAMED, not anonymous')
eq(occupantLabel({ person_name_at_time: null }), 'Former resident', 'graceful fallback')
eq(occupantLabel(null), null, 'null row => null label')

// ── property status derivation ─────────────────────────────────────────────
eq(derivePropertyStatus(occ, properties[0]), 'occupied', '#45 occupied')
eq(derivePropertyStatus(occ, { id: 'prop-empty', status: 'vacant' }), 'vacant', 'no occupants => vacant')
eq(derivePropertyStatus(occ, properties[2]), 'unbuilt',
   'unbuilt is a human statement and is NOT overwritten by absence of occupancy')
eq(derivePropertyStatus(occ, { id: 'x', status: 'withheld' }), 'withheld', 'withheld preserved too')
eq(derivePropertyStatus(occ, null), null, 'null property => null')

// ── closing an occupancy on move-out ───────────────────────────────────────
let patch = closeOccupancy(occ, 'bob', '2026-07-30')
eq(patch.id, 'o3', 'closes the right row')
eq(patch.to_date, '2026-07-30', 'sets to_date')
// backdating earlier than from_date would violate occupancies_dates_sane
patch = closeOccupancy(occ, 'bob', '2020-01-01')
eq(patch.to_date, '2025-06-01', 'a to_date before from_date is clamped to from_date')
eq(closeOccupancy(occ, 'robert', '2026-07-30'), null, 'nothing to close for a past resident')

// ── vacancy listing ────────────────────────────────────────────────────────
const withEmpty = [...properties, { id: 'prop-50', ref: '50', sort_order: 50, status: 'vacant' },
                                  { id: 'prop-3', ref: '3', sort_order: 3, status: 'vacant' }]
const vac = vacantProperties(occ, withEmpty)
eq(vac.length, 2, 'two genuinely vacant properties (unbuilt #99 excluded)')
eq(vac[0].ref, '3', 'sorted by sort_order, so #3 before #50')
ok(!vac.some((p) => p.ref === '99'), 'unbuilt is not reported as vacant')

console.log(`occupancy: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
