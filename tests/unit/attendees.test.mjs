// Unit tests for lib/attendees.js validateParty() — multi-attendee booking
// validation (workstream A, feedback round 2026-07-16).
//
//   npm run test:unit

import { validateParty, validateBring } from '../../lib/attendees.js'

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

// bring fields survive normalisation (the guest-dish bug, 2026-07-18)
const withBring = validateParty({ seats: 2, attendees: [{ member_id: 'm1', bring_category_id: 'cat1', bring_note: 'Pavlova' }], allowGuests: false, ownerId: OWNER })
ok(withBring.ok && withBring.attendees[0].bring_category_id === 'cat1' && withBring.attendees[0].bring_note === 'Pavlova', 'resident attendee keeps their dish through validation')
const guestBring = validateParty({ seats: 2, attendees: [{ guest_name: 'Bob', bring_category_id: 'cat2' }], allowGuests: true, ownerId: OWNER })
ok(guestBring.ok && guestBring.attendees[0].bring_category_id === 'cat2', 'guest attendee keeps their dish through validation')

// mixed resident + guest
const mix = validateParty({ seats: 3, attendees: [{ member_id: 'm1' }, { guest_name: 'Bob' }], allowGuests: true, ownerId: OWNER })
ok(mix.ok === true && mix.attendees.length === 2, 'mixed resident + guest => ok')

// owner can't be their own guest; no duplicate residents
ok(validateParty({ seats: 2, attendees: [{ member_id: OWNER }], allowGuests: false, ownerId: OWNER }).ok === false, 'owner as attendee => rejected')
ok(validateParty({ seats: 3, attendees: [{ member_id: 'm1' }, { member_id: 'm1' }], allowGuests: false, ownerId: OWNER }).ok === false, 'duplicate resident => rejected')

// empty/blank entries rejected
ok(validateParty({ seats: 2, attendees: [{ guest_name: '   ' }], allowGuests: true, ownerId: OWNER }).ok === false, 'blank guest name => rejected')
ok(validateParty({ seats: 2, attendees: [{}], allowGuests: true, ownerId: OWNER }).ok === false, 'empty attendee => rejected')

// contact-only residents (2026-07-23) — a real resident with no app login,
// distinct from both member_id and guest_name.
const c = validateParty({ seats: 2, attendees: [{ contact_id: 'c1' }], allowGuests: false, ownerId: OWNER })
ok(c.ok === true && c.attendees[0].contact_id === 'c1' && c.attendees[0].member_id === null && c.attendees[0].guest_name === null, 'contact resident => ok, normalised')
ok(validateParty({ seats: 3, attendees: [{ contact_id: 'c1' }, { contact_id: 'c1' }], allowGuests: false, ownerId: OWNER }).ok === false, 'duplicate contact => rejected')
const mixMC = validateParty({ seats: 3, attendees: [{ member_id: 'm1' }, { contact_id: 'c1' }], allowGuests: false, ownerId: OWNER })
ok(mixMC.ok === true && mixMC.attendees.length === 2, 'mixed member + contact residents => ok')
// a contact never needs allowGuests — they're a resident, not a guest
ok(validateParty({ seats: 2, attendees: [{ contact_id: 'c1' }], allowGuests: false, ownerId: OWNER }).ok === true, 'contact resident allowed even when guests are not')

// a contact-owned booking (walk-up) can also own a party, and can't name
// itself as its own party member either (2026-07-23).
const ownerContact = validateParty({ seats: 2, attendees: [{ contact_id: 'c1' }], allowGuests: false, ownerContactId: 'c-owner' })
ok(ownerContact.ok === true, 'contact-owned booking naming a different contact => ok')
ok(validateParty({ seats: 2, attendees: [{ contact_id: 'c-owner' }], allowGuests: false, ownerContactId: 'c-owner' }).ok === false, 'contact owner naming themselves => rejected')

// bring-a-dish
ok(validateBring({ required: false }).ok === true, 'not required => ok even with nothing chosen')
ok(validateBring({ required: true, bringCategoryId: null }).ok === false, 'required + nothing chosen => rejected')
ok(validateBring({ required: true, bringCategoryId: 'cat1' }).ok === true, 'required + chosen => ok')
ok(validateBring({ required: true, bringCategoryId: 'cat9', allowedCategoryIds: ['cat1','cat2'] }).ok === false, 'category not allowed for this event => rejected')
ok(validateBring({ required: true, bringCategoryId: 'cat1', allowedCategoryIds: ['cat1','cat2'] }).ok === true, 'allowed category => ok')
ok(validateBring({ required: true, bringCategoryId: 'cat1', allowedCategoryIds: [] }).ok === true, 'empty allowed list means all categories')

console.log(`\nlib/attendees.js validateParty: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
