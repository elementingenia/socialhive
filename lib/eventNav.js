// Shared hub deep-link routing -- the single source of truth for turning an
// event into the URL that lands a resident on that specific event. Each
// hub's own event-list page reads a ?event=<id> query param on mount and
// opens that event's booking modal automatically (Event Deep Linking,
// 2026-09-13/14, PR #123/#124/BUG-060 -- see each hub page's own "Event
// Deep Linking" comment). This file exists so NotificationsDrawer.js
// (targetForNotif) and the global Find button (components/FindButton.js)
// route through one implementation instead of drifting apart.
//
// Delegates the actual hub_type/club -> base-path mapping to
// lib/eventShare.js's hubPathForEvent(), which already existed and was
// already correct (club events use event.club.slug, not a hard-coded
// "/clubs" landing page) -- CORRECTED 2026-09-22 after this file was
// first written with its own, DUPLICATE routing table that didn't know
// about hubPathForEvent and got the club case wrong as a result (Iain
// caught it live: the Find button landed on the plain "Groups & Clubs"
// page instead of the specific event). Reusing the canonical helper here
// instead of maintaining a second copy is the actual fix, not just
// patching the symptom -- see hubPathForEvent's own doc comment for why
// club.slug wins over hub_type.
import { hubPathForEvent } from './eventShare.js'

export function eventDeepLink({ hubType, eventId, clubId, clubSlug } = {}) {
  const basePath = hubPathForEvent({
    hub_type: hubType,
    club: clubSlug ? { slug: clubSlug } : null,
  })
  if (basePath) return eventId ? `${basePath}?event=${encodeURIComponent(eventId)}` : basePath
  // hubPathForEvent returns null for a club event whose slug genuinely
  // isn't available to the caller (shouldn't happen in practice -- every
  // caller of this file joins it -- but degrade to the plain landing page
  // rather than a dead link if it ever does) or for an unrecognised
  // hub_type.
  if (clubId) return '/clubs'
  return null
}

// Convenience wrapper for a full event object as returned by /api/events
// (which already joins club:clubs!club_id(..., slug, ...)) -- matches
// CalendarView.js's hubKeyOf: a club event is identified by club_id,
// never hub_type.
export function eventDeepLinkFor(ev) {
  return eventDeepLink({
    hubType: ev?.hub_type,
    eventId: ev?.id,
    clubId: ev?.club_id,
    clubSlug: ev?.club?.slug,
  })
}
