// Unit tests for lib/attendees.js validateParty() — multi-attendee booking
// validation (workstream A, feedback round 2026-07-16).
//
//   npm run test:unit

import { validateParty } from '../../lib/attendees.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

const OWNER = 'owner-1'

// 1 seat needs no attendees
ok(validateParty({ seats: 1, attendees: [], allowGuests: false, ownerId: OWNER }).ok === true, '1 seat, no attendees => ok')
ok(validateParty({ seats: 1, attendees: undefined, allowGuests: false, ownerId: OWNER }).ok === true, '1 seat, undefined attendees => ok')

// count must equal seats - 1
ok(validateParty({ seats: 3, attendees: [{ member_id: 'm1' }], allowGuests: false, ownerId: OWNER }).ok === false, '3 seats, 1 attendee => rejected (need 2)')
ok(validateParty({ seats: 2, attendees: [], allowGuests: false, ownerId: OWNER }).ok === false, '2 seats, 0 attendees => rejected')

// residents-only path
const r = validateParty({ seats: 3, attendees: [{ member_id: 'm1' }, { member_id: 'm2' }], allowGuests: false, ownerId: OWNER })
ok(r.ok === true && r.attendees.length === 2 && r.attendees[0].member_id === 'm1' && r.attendees[0].guest_name === null, 'two residents => ok, normalised')

// non-resident blocked when not allowed, permitted when allowed
ok(validateParty({ seats: 2, attendees: [{ guest_name: 'Aunt May' }], allowGuests: false, ownerId: OWNER }).ok === false, 'guest when residents-only => rejected')
const g = validateParty({ seats: 2, attendees: [{ guest_name: '  Aunt May  ' }], allowGuests: true, ownerId: OWNER })
ok(g.ok === true && g.attendees[0].member_id === null && g.attendees[0].guest_name === 'Aunt May', 'guest allowed => ok, trimmed')

// mixed resident + guest
const mix = validateParty({ seats: 3, attendees: [{ member_id: 'm1' }, { guest_name: 'Bob' }], allowGuests: true, ownerId: OWNER })
ok(mix.ok === true && mix.attendees.length === 2, 'mixed resident + guest => ok')

// owner can't be their own guest; no duplicate residents
ok(validateParty({ seats: 2, attendees: [{ member_id: OWNER }], allowGuests: false, ownerId: OWNER }).ok === false, 'owner as attendee => rejected')
ok(validateParty({ seats: 3, attendees: [{ member_id: 'm1' }, { member_id: 'm1' }], allowGuests: false, ownerId: OWNER }).ok === false, 'duplicate resident => rejected')

// empty/blank entries rejected
ok(validateParty({ seats: 2, attendees: [{ guest_name: '   ' }], allowGuests: true, ownerId: OWNER }).ok === false, 'blank guest name => rejected')
ok(validateParty({ seats: 2, attendees: [{}], allowGuests: true, ownerId: OWNER }).ok === false, 'empty attendee => rejected')

console.log(`\nlib/attendees.js validateParty: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
