// Unit tests for lib/clubs.js — the capability helpers that replace the 16
// hardcoded `hub_type === 'bookclub'` checks (Phase 2b).
import { clubCaps, isClubEvent, clubColour, tracksLoanedItem, clubNavItems } from '../../lib/clubs.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗', m)) }

const bookClub  = { id: 'c1', name: 'Book Club',   slug: 'book-club',   colour: 'var(--purple)', catalogue_module: 'books', has_book_return: true,  has_kit_return: true, single_signup: true }
const dinnerClub = { id: 'c2', name: 'Dinner Club', slug: 'dinner-club', colour: '#c2410c',       catalogue_module: 'none',  bring_enabled: true, has_cost: true }

ok(clubCaps(bookClub).hasBooks === true, 'book club has books catalogue')
ok(clubCaps(dinnerClub).hasBooks === false, 'dinner club has no catalogue')
ok(clubCaps(dinnerClub).bringEnabled === true, 'dinner club bring enabled')
ok(clubCaps(dinnerClub).hasBookReturn === false, 'dinner club no book return')
ok(clubCaps(null).hasBooks === false, 'null club => no caps, no crash')
ok(clubCaps(bookClub).singleSignup === true, 'book club is sign-up style (no seat picker)')
ok(clubCaps(dinnerClub).singleSignup === false, 'dinner club books seats')
ok(clubCaps(undefined).singleSignup === false, 'undefined club => seat booking default')

ok(isClubEvent({ club_id: 'c1' }) === true, 'club_id => club event')
ok(isClubEvent({ hub_type: 'bookclub' }) === false, 'hub_type alone is NOT how we identify a club event')
ok(isClubEvent(null) === false, 'null event => false')

ok(clubColour(dinnerClub) === '#c2410c', 'club colour used')
ok(clubColour(null) === 'var(--purple)', 'null club => default colour')

// loaned-item tracking (book conflict / kit) is a capability, not a hub name
ok(tracksLoanedItem(bookClub, { book_id: 'b1' }) === true, 'book club + book => tracks loan')
ok(tracksLoanedItem(bookClub, {}) === false, 'book club, no book on event => no loan')
ok(tracksLoanedItem(dinnerClub, { book_id: 'b1' }) === false, 'club without book return => no loan tracking')

// nav items
const bcNav = clubNavItems(bookClub)
ok(bcNav.length === 3, 'book club nav = Clubs + club + Suggest')
ok(bcNav[0].path === '/clubs' && bcNav[0].label === 'Clubs', 'first item is back-to-Clubs')
ok(bcNav[1].path === '/clubs/book-club', 'second item is the club itself')
ok(bcNav[2].label === 'Suggest', 'Suggest last, only for catalogue clubs')
const dcNav = clubNavItems(dinnerClub)
ok(dcNav.length === 2 && dcNav[1].label === 'Dinner Club', 'dinner club nav = Clubs + club (no Suggest)')
ok(dcNav[1].textOnly === true, "the club's own nav entry is text-only (no icon)")
ok(!bcNav[0].textOnly, 'the Clubs list entry keeps its icon')
ok(clubNavItems(null).length === 0, 'null club => no nav items')

console.log(`\nlib/clubs.js: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
