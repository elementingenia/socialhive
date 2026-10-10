// Unit tests for lib/myStuff.js and lib/contactEntries.js -- My Stuff.
//   npm run test:unit

import { validatePin, personKey, pinFromPersonKey, bookedSeries, seriesName, summaryLine } from '../../lib/myStuff.js'
import { buildContactEntries } from '../../lib/contactEntries.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗', m)) }
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

const ID = '11111111-2222-3333-4444-555555555555'

// ── pin requests ──────────────────────────────────────────────────────────
eq(validatePin({ action: 'pin', item_type: 'member', item_id: ID }), null, 'valid member pin')
eq(validatePin({ action: 'unpin', item_type: 'document', item_id: ID }), null, 'valid document unpin')
ok(!!validatePin({ action: 'pin', item_type: 'club', item_id: ID }), 'clubs are not pinned (they fill in on their own)')
ok(!!validatePin({ action: 'pin', item_type: 'member', item_id: 'nope' }), 'rejects a bad id')
ok(!!validatePin({ action: 'delete', item_type: 'member', item_id: ID }), 'rejects an unknown action')

// ── person keys match Contacts card keys ──────────────────────────────────
eq(personKey({ item_type: 'member', item_id: 'x' }), 'm-x', 'member key')
eq(personKey({ item_type: 'contact', item_id: 'y' }), 'c-y', 'contact key')
eq(personKey({ item_type: 'document', item_id: 'z' }), null, 'documents are not people')
eq(pinFromPersonKey('m-x'), { item_type: 'member', item_id: 'x' }, 'back from member key')
eq(pinFromPersonKey('c-y'), { item_type: 'contact', item_id: 'y' }, 'back from contact key')
eq(pinFromPersonKey('q-1'), null, 'unknown key')

// ── repeating events: one row per series, next booked date ────────────────
const rows = [
  { id: 'e2', series_id: 's1', event_date: '2026-10-25', event_time: '18:00', hub_type: 'movie', showing_name: 'Sunday Night at the Movies' },
  { id: 'e1', series_id: 's1', event_date: '2026-10-11', event_time: '18:00', hub_type: 'movie', showing_name: 'Sunday Night at the Movies' },
  { id: 'e3', series_id: 's2', event_date: '2026-10-14', event_time: '10:00', hub_type: 'club', title: 'Card Games', club_id: 'c1', club_name: 'Cards', club_slug: 'cards' },
  { id: 'e4', series_id: null, event_date: '2026-10-12', title: 'One-off' },
]
const s = bookedSeries(rows)
eq(s.length, 2, 'one-off events are not repeating events')
eq(s.map(x => x.name), ['Card Games', 'Sunday Night at the Movies'], 'A-Z by name')
eq(s[1].next_event_id, 'e1', 'points at the next booked date')
eq(s[1].dates, 2, 'counts booked dates')
eq(s[0].club_slug, 'cards', 'keeps the club for the link')
eq(seriesName({ content_tba: true }), 'Repeating showing', 'unnamed TBA showing')
eq(seriesName({ title: '  ', club_name: 'Cards' }), 'Cards event', 'falls back to the club')

// ── tile line ─────────────────────────────────────────────────────────────
eq(summaryLine({}), 'Pin people and documents to find them here', 'empty tile says how to add')
eq(summaryLine({ series: 1, clubs: 2, people: 1, documents: 3 }), '1 repeating event · 2 groups & clubs · 1 person · 3 documents', 'counts')

// ── people built exactly as Contacts, no admin extras ────────────────────
const members = [
  { id: 'a', name: 'Alice Real', display_name: 'Al', hide_name: false, email: 'a@x', house_number: '7', phone: '04' },
  { id: 'p', name: 'Pat Private', display_name: 'Pat', hide_name: true, email: 'p@x', house_number: '9', phone: '05', is_admin: true },
  { id: 't', name: 'Test Bot', hide_name: true, is_test: true },
]
const entries = buildContactEntries({ members, residentsId: 'r', isAdmin: false, me: { id: 'a' } })
eq(entries.map(e => e.key).sort(), ['m-a', 'm-p'], 'test accounts never show')
const pat = entries.find(e => e.key === 'm-p')
eq([pat.name, pat.email, pat.phone, pat.house_number], ['Resident', null, null, null], 'a Private resident is masked for a resident')
eq(pat.badges, [], 'no admin badges outside admin view')
const admin = buildContactEntries({ members, residentsId: 'r', isAdmin: true, me: { id: 'x' } }).find(e => e.key === 'm-p')
ok(admin.badges.includes('Private') && admin.email === 'p@x', 'admin view unchanged on Contacts')

console.log(`myStuff: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
