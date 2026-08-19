// Unit tests for lib/attendees.js validateParty() — multi-attendee booking
// validation (workstream A, feedback round 2026-07-16).
//
//   npm run test:unit

import { validateParty, validateBring, resolveBringCategoryIds, validateBringRequirement } from '../../lib/attendees.js'

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

// already-booked elsewhere on this event (2026-07-24) -- the same resident
// can't be added to two different bookings for one event.
const taken1 = validateParty({ seats: 2, attendees: [{ member_id: 'm9' }], allowGuests: false, ownerId: OWNER, takenMemberIds: new Set(['m9']) })
ok(taken1.ok === false, 'resident already booked elsewhere => rejected')
const taken2 = validateParty({ seats: 2, attendees: [{ contact_id: 'c9' }], allowGuests: false, ownerId: OWNER, takenContactIds: new Set(['c9']) })
ok(taken2.ok === false, 'contact already booked elsewhere => rejected')
const notTaken = validateParty({ seats: 2, attendees: [{ member_id: 'm9' }], allowGuests: false, ownerId: OWNER, takenMemberIds: new Set(['someone-else']) })
ok(notTaken.ok === true, 'resident not in the taken set => ok')
const noTakenSets = validateParty({ seats: 2, attendees: [{ member_id: 'm9' }], allowGuests: false, ownerId: OWNER })
ok(noTakenSets.ok === true, 'omitting takenMemberIds/takenContactIds entirely => ok (backward compatible)')

// optional naming (2026-07-25) -- required defaults to true (unchanged
// behaviour for every caller above that doesn't pass it); required:false is
// the new per-event opt-out.
ok(validateParty({ seats: 3, attendees: [], allowGuests: false, ownerId: OWNER, required: false }).ok === true, 'not required, 0 of 2 named => ok')
const partial = validateParty({ seats: 3, attendees: [{ member_id: 'm1' }], allowGuests: false, ownerId: OWNER, required: false })
ok(partial.ok === true && partial.attendees.length === 1, 'not required, 1 of 2 named => ok, only the named one kept')
const blankRow = validateParty({ seats: 3, attendees: [{ member_id: 'm1' }, { kind: 'resident', member_id: null, contact_id: null, guest_name: '' }], allowGuests: false, ownerId: OWNER, required: false })
ok(blankRow.ok === true && blankRow.attendees.length === 1, 'not required, blank placeholder row => dropped, not an error')
ok(validateParty({ seats: 3, attendees: [{ member_id: 'm1' }, { member_id: 'm2' }, { member_id: 'm3' }], allowGuests: false, ownerId: OWNER, required: false }).ok === false, 'not required, more named than seats allow => still rejected')
// not-required doesn't loosen the OTHER rules -- duplicates, owner-as-guest,
// taken-elsewhere, and guests-not-allowed all still apply to whatever IS named
ok(validateParty({ seats: 3, attendees: [{ member_id: 'm1' }, { member_id: 'm1' }], allowGuests: false, ownerId: OWNER, required: false }).ok === false, 'not required, duplicate resident named => still rejected')
ok(validateParty({ seats: 2, attendees: [{ member_id: OWNER }], allowGuests: false, ownerId: OWNER, required: false }).ok === false, 'not required, owner names themselves => still rejected')
ok(validateParty({ seats: 2, attendees: [{ guest_name: 'Bob' }], allowGuests: false, ownerId: OWNER, required: false }).ok === false, 'not required, guest named on residents-only event => still rejected')
// required explicitly true behaves exactly like the default (redundant but
// documents the intent at call sites that pass it explicitly)
ok(validateParty({ seats: 3, attendees: [{ member_id: 'm1' }], allowGuests: false, ownerId: OWNER, required: true }).ok === false, 'required:true, 1 of 2 named => rejected, same as default')

// bring-a-dish
ok(validateBring({ required: false }).ok === true, 'not required => ok even with nothing chosen')
ok(validateBring({ required: true, bringCategoryId: null }).ok === false, 'required + nothing chosen => rejected')
ok(validateBring({ required: true, bringCategoryId: 'cat1' }).ok === true, 'required + chosen => ok')
ok(validateBring({ required: true, bringCategoryId: 'cat9', allowedCategoryIds: ['cat1','cat2'] }).ok === false, 'category not allowed for this event => rejected')
ok(validateBring({ required: true, bringCategoryId: 'cat1', allowedCategoryIds: ['cat1','cat2'] }).ok === true, 'allowed category => ok')
ok(validateBring({ required: true, bringCategoryId: 'cat1', allowedCategoryIds: [] }).ok === true, 'empty allowed list means all categories')
// 2026-08-07: bring is now applicable-per-event (event.bring_category_ids
// non-empty) with mandatory/optional (event.bring_required) as a separate
// choice. An optional event should still validate a VOLUNTARY pick against
// the allowed list, not wave through anything just because it's not required.
ok(validateBring({ required: false, bringCategoryId: 'cat1', allowedCategoryIds: ['cat1','cat2'] }).ok === true, 'optional + valid voluntary pick => ok')
ok(validateBring({ required: false, bringCategoryId: 'cat9', allowedCategoryIds: ['cat1','cat2'] }).ok === false, 'optional + invalid voluntary pick => still rejected, optional is not "anything goes"')

// resolveBringCategoryIds -- reconciling a possibly-stale events.bring_category_ids
// snapshot against the club's current live categories (2026-07-25 fix,
// Sydney Harbour Night hit "That option isn't available" on submit even
// though the client's own fallback showed it as pickable).
ok(resolveBringCategoryIds({ allowedCategoryIds: null, currentCategoryIds: ['a','b'] }) === null, 'no narrowing stored => unrestricted')
ok(resolveBringCategoryIds({ allowedCategoryIds: [], currentCategoryIds: ['a','b'] }) === null, 'empty narrowing stored => unrestricted')
{
  const r = resolveBringCategoryIds({ allowedCategoryIds: ['a','b'], currentCategoryIds: ['a','b','c'] })
  ok(Array.isArray(r) && r.length === 2 && r.includes('a') && r.includes('b'), 'all stored ids still valid => unchanged')
}
ok(resolveBringCategoryIds({ allowedCategoryIds: ['stale1','stale2'], currentCategoryIds: ['a','b','c'] }) === null, 'totally stale narrowing => falls back to unrestricted')
{
  const r = resolveBringCategoryIds({ allowedCategoryIds: ['a','stale'], currentCategoryIds: ['a','b','c'] })
  ok(Array.isArray(r) && r.length === 1 && r[0] === 'a', 'partially stale narrowing => keeps only the still-valid ids')
}
ok(validateBring({ required: true, bringCategoryId: 'a', allowedCategoryIds: resolveBringCategoryIds({ allowedCategoryIds: ['a'], currentCategoryIds: [] }) }).ok === true, 'club has zero current categories => resolves to something validateBring treats as unrestricted, never a hard block')

// Community bus (2026-08-19) -- a row flagged is_bus_passenger must always be
// named, regardless of the event's require_attendee_names setting.
ok(validateParty({ seats: 2, attendees: [{ member_id: 'm1', is_bus_passenger: true }], allowGuests: false, ownerId: OWNER }).ok === true, 'named bus passenger => ok')
const busUnnamedOptional = validateParty({ seats: 3, attendees: [{ kind: 'resident', member_id: null, contact_id: null, guest_name: '', is_bus_passenger: true }], allowGuests: false, ownerId: OWNER, required: false })
ok(busUnnamedOptional.ok === false && /bus/.test(busUnnamedOptional.error), 'not required, blank row flagged bus => rejected, not silently dropped')
const busUnnamedRequired = validateParty({ seats: 2, attendees: [{ member_id: null, contact_id: null, guest_name: '', is_bus_passenger: true }], allowGuests: false, ownerId: OWNER })
ok(busUnnamedRequired.ok === false && /bus/.test(busUnnamedRequired.error), 'required, blank row flagged bus => rejected with bus-specific message')
const busNormalised = validateParty({ seats: 2, attendees: [{ member_id: 'm1', is_bus_passenger: true }], allowGuests: false, ownerId: OWNER })
ok(busNormalised.ok === true && busNormalised.attendees[0].is_bus_passenger === true, 'is_bus_passenger survives normalisation')
const busDefaultFalse = validateParty({ seats: 2, attendees: [{ member_id: 'm1' }], allowGuests: false, ownerId: OWNER })
ok(busDefaultFalse.ok === true && busDefaultFalse.attendees[0].is_bus_passenger === false, 'attendee not flagged for bus => normalises to false')
// a non-bus blank row still behaves as before (dropped when optional)
const nonBusBlankStillDropped = validateParty({ seats: 3, attendees: [{ member_id: 'm1' }, { member_id: null, contact_id: null, guest_name: '' }], allowGuests: false, ownerId: OWNER, required: false })
ok(nonBusBlankStillDropped.ok === true && nonBusBlankStillDropped.attendees.length === 1, 'not required, blank non-bus row => still dropped, unaffected by bus check')

// validateBringRequirement -- event-level guard (2026-08-07): an event can't
// be saved as Required with zero categories chosen. Catches the stale-state
// bug where a category was picked, Required turned on, then the category
// deselected again -- form.bring_required stayed true in memory with nothing
// to actually require.
ok(validateBringRequirement({ bring_required: true, bring_category_ids: [] }).ok === false, 'required + zero categories => rejected')
ok(validateBringRequirement({ bring_required: true, bring_category_ids: null }).ok === false, 'required + null categories => rejected')
ok(validateBringRequirement({ bring_required: true, bring_category_ids: ['cat1'] }).ok === true, 'required + at least one category => ok')
ok(validateBringRequirement({ bring_required: false, bring_category_ids: [] }).ok === true, 'optional + zero categories => ok, not applicable')
ok(validateBringRequirement({ bring_required: false, bring_category_ids: ['cat1'] }).ok === true, 'optional + categories chosen => ok')

console.log(`\nlib/attendees.js validateParty: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
