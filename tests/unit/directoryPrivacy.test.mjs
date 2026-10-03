// Unit tests for lib/directoryPrivacy.js -- server-side masking of Private
// residents (BUG-072, 2026-10-03). Pure logic, no DB.
//
//   npm run test:unit

import { canSeePrivateMember, maskMemberRow, maskLinkedContact, buildContactsDirectory, buildResidentPicker } from '../../lib/directoryPrivacy.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

const pub  = { id: 'p', name: 'Pat Public', display_name: 'Pat', username: 'PatP', email: 'pat@x', phone: '0400 000 001', house_number: '12', hide_name: false }
const priv = { id: 'q', name: 'Quinn Private', display_name: 'Quinn', username: 'QuinnP', email: 'q@x', phone: '0400 000 002', house_number: '34', street_id: 'st1', street_name: 'Mosaic Street', hide_name: true }
const resident = { id: 'r', is_admin: false }
const admin = { id: 'a', is_admin: true }

// canSeePrivateMember
ok(canSeePrivateMember(pub, resident), 'a non-Private resident is visible to everyone')
ok(!canSeePrivateMember(priv, resident), 'a Private resident is hidden from another resident')
ok(canSeePrivateMember(priv, admin), 'admins see Private residents')
ok(canSeePrivateMember(priv, { id: 'q', is_admin: false }), 'a Private resident sees themself')
ok(!canSeePrivateMember(priv, null), 'no viewer -> hidden')

// maskMemberRow
let m = maskMemberRow(priv, resident)
ok(m.masked === true, 'masked flag set')
ok(m.name === 'Resident' && m.display_name === 'Resident', 'name and display name replaced with "Resident"')
ok(m.username === null, 'username removed (it usually spells the real name)')
ok(m.email === null && m.phone === null && m.house_number === null, 'email, phone and house number removed')
ok(m.street_id === null && m.street_name === null, 'street removed too (migration 122)')
ok(m.id === 'q' && m.hide_name === true, 'id and hide_name kept so the page can still list the card')
m = maskMemberRow(priv, admin)
ok(m.masked === false && m.phone === '0400 000 002' && m.name === 'Quinn Private', 'admin gets the real values')
m = maskMemberRow(pub, resident)
ok(m.masked === false && m.phone === '0400 000 001', 'non-Private resident unchanged')
ok(!('pin' in maskMemberRow({ ...priv }, resident)), 'mask never adds a pin field')

// maskLinkedContact
const linked = { id: 'c1', member_id: 'q', name: 'Quinn Private', title: 'Treasurer', phone: '0400', email: 'q@x', house_number: '34' }
let c = maskLinkedContact(linked, new Set(['q']))
ok(c.phone === null && c.email === null && c.house_number === null && c.title === null, 'linked contact row of a masked resident loses its details')
ok(c.name === 'Resident', 'linked contact name masked too')
ok(maskLinkedContact(linked, new Set()) === linked, 'linked contact left alone when the resident is not masked')
const standalone = { id: 'c2', member_id: null, name: 'Plumber', phone: '0411' }
ok(maskLinkedContact(standalone, new Set(['q'])) === standalone, 'standalone contacts untouched')

// buildContactsDirectory
const contacts = [linked, standalone, { id: 'c3', member_id: null, name: 'Hidden one', active: false }]
contacts[0].active = true; contacts[1].active = true
let d = buildContactsDirectory({ members: [pub, priv], contacts, viewer: resident })
ok(d.members.length === 2, 'every active member still listed (Private ones as "Resident")')
ok(d.members.find(x => x.id === 'q').phone === null, 'Private phone not sent to a resident')
ok(d.contacts.length === 2, 'inactive contacts not sent to a resident')
ok(d.contacts.find(x => x.id === 'c1').phone === null, 'linked contact of a Private resident not leaked')
d = buildContactsDirectory({ members: [pub, priv], contacts, viewer: admin })
ok(d.contacts.length === 3, 'admins still get hidden contacts to manage')
ok(d.members.find(x => x.id === 'q').phone === '0400 000 002', 'admins get real Private details')

// buildResidentPicker
let list = buildResidentPicker({ members: [pub, priv], contacts: [standalone], viewer: resident })
ok(!list.find(x => x.id === 'q'), 'party picker (default) leaves Private residents out entirely -- they cannot be added by someone else')
ok(list.find(x => x.id === 'p').house_number === '12', 'picker keeps non-Private house numbers')
ok(list.find(x => x.id === 'c2').type === 'contact', 'picker includes contacts')
list = buildResidentPicker({ members: [pub, priv], contacts: [], viewer: { id: 'q', is_admin: false } })
ok(!!list.find(x => x.id === 'q'), 'a Private resident still sees themself')
list = buildResidentPicker({ members: [pub, priv], contacts: [], viewer: resident, purpose: 'walkup' })
ok(!list.find(x => x.id === 'q'), 'walk-up purpose without managing the event still excludes Private residents')
list = buildResidentPicker({ members: [pub, priv], contacts: [], viewer: admin })
ok(!list.find(x => x.id === 'q'), 'even an admin booking their OWN party cannot add a Private resident')
list = buildResidentPicker({ members: [pub, priv], contacts: [], viewer: admin, purpose: 'walkup' })
ok(list.find(x => x.id === 'q')?.house_number === '34', 'admin walk-up includes Private residents with house number')
list = buildResidentPicker({ members: [pub, priv], contacts: [], viewer: resident, canManageEvent: true, purpose: 'walkup' })
ok(list.find(x => x.id === 'q').house_number === '34', 'event managers see Private house numbers in the walk-up picker')
ok(list.find(x => x.id === 'q').street_name === 'Mosaic Street', 'event managers see the Private street too')
ok(list.every(x => !('email' in x) && !('phone' in x)), 'picker never carries email or phone')
ok(list.map(x => x.name).join() === 'Pat Public,Quinn Private', 'picker sorted A-Z')

console.log(`\nlib/directoryPrivacy.js: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
