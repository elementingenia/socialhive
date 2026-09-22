// Unit tests for lib/eventNav.js — the shared hub deep-link routing used by
// NotificationsDrawer.js and the global Find button (components/FindButton.js).
//   npm run test:unit
//
// Written after a live bug (Iain, 2026-09-22): the first version of this
// file had its own routing table that didn't know club events need their
// club's slug, so the Find button landed on the plain "Groups & Clubs"
// page instead of the tapped event. Root cause was duplicating logic that
// already existed correctly in lib/eventShare.js's hubPathForEvent(). These
// tests pin the corrected behaviour so that regression can't happen again
// silently.

import { eventDeepLink, eventDeepLinkFor } from '../../lib/eventNav.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗', m)) }
const eq = (a, b, m) => ok(a === b, `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

// ── eventDeepLink -- non-club hubs (unchanged behaviour) ────────────────────
eq(eventDeepLink({ hubType: 'movie', eventId: 42 }), '/screenings?event=42', 'movie hub')
eq(eventDeepLink({ hubType: 'social', eventId: 7 }), '/social/events?event=7', 'social hub')
eq(eventDeepLink({ hubType: 'special', eventId: 9 }), '/special-events/events?event=9', 'special hub')
eq(eventDeepLink({ hubType: 'space', eventId: 3 }), '/spaces/scheduled?event=3', 'space hub')
eq(eventDeepLink({ hubType: 'movie' }), '/screenings', 'no eventId -> plain hub page')
eq(eventDeepLink({ hubType: 'unknown-future-hub', eventId: 1 }), null, 'unrecognised hub_type -> null, not a guess')
eq(eventDeepLink(), null, 'no args at all -> null')

// ── eventDeepLink -- club events, the actual bug this file guards against ──
eq(eventDeepLink({ hubType: 'club', eventId: 5, clubId: 'c1', clubSlug: 'bowlers-unite' }),
  '/clubs/bowlers-unite?event=5', 'club event routes to its OWN club slug + the specific event')
eq(eventDeepLink({ hubType: 'club', clubId: 'c1', clubSlug: 'bowlers-unite' }),
  '/clubs/bowlers-unite', 'club event with no eventId -> the club page, still slug-specific')
eq(eventDeepLink({ hubType: 'bookclub', eventId: 11, clubId: 'book-club-id', clubSlug: 'book-club' }),
  '/clubs/book-club?event=11', 'Book Club (post-cutover: a club, not a separate hub) routes the same way')
eq(eventDeepLink({ hubType: 'club', eventId: 5, clubId: 'c1' }), '/clubs',
  'club_id present but no slug available -> degrades to the plain Clubs page, never a dead link')

// ── eventDeepLinkFor -- the full-event-object wrapper FindButton/Calendar use ──
eq(eventDeepLinkFor({ id: 5, hub_type: 'club', club_id: 'c1', club: { slug: 'bowlers-unite' } }),
  '/clubs/bowlers-unite?event=5', 'eventDeepLinkFor pulls club_id/club.slug off the event, matching hubKeyOf()')
eq(eventDeepLinkFor({ id: 12, hub_type: 'movie' }), '/screenings?event=12', 'eventDeepLinkFor: non-club event')
eq(eventDeepLinkFor(null), null, 'eventDeepLinkFor: no event -> null')

console.log(`eventNav: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
