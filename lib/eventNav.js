// Shared hub deep-link routing -- the single source of truth for turning an
// event's hub type + id into the URL that lands a resident on that specific
// event. Each hub's own event-list page reads a ?event=<id> query param on
// mount and opens that event's booking modal automatically (Event Deep
// Linking, 2026-09-13/14, PR #123/#124/BUG-060 -- see each hub page's own
// "Event Deep Linking" comment). This file exists so NotificationsDrawer.js
// (targetForNotif) and the global Find button (components/FindButton.js)
// route through one implementation instead of drifting apart.
//
// Club/Book Club events are NOT deep-linkable to the specific event yet:
// ClubHome.js needs the club's slug in the URL (/clubs/<slug>?event=<id>),
// which nothing here supplies, and /bookclub's redirect drops query strings
// entirely -- both still land on the hub's plain page. Known remaining gap,
// not fixed here (unchanged from targetForNotif's original comment).
//
// "space" (Book a Space shared events) deep-links to /spaces/scheduled --
// confirmed by reading app/(app)/spaces/scheduled/page.js's own ?event=<id>
// useEffect. NotificationsDrawer's switch never had a "space" case (falls
// through to default: null, so space notifications currently don't
// navigate anywhere) -- a pre-existing gap in notifications, left as-is
// here since it wasn't in scope; the Find button below does NOT inherit
// that gap, since search results need to go somewhere for every hub type
// they can return.
export function eventDeepLink(hubType, eventId) {
  switch (hubType) {
    case "movie":    return eventId ? `/screenings?event=${eventId}` : "/screenings"
    case "social":   return eventId ? `/social/events?event=${eventId}` : "/social"
    case "bookclub": return "/bookclub"
    case "club":     return "/clubs"
    case "special":  return eventId ? `/special-events/events?event=${eventId}` : "/special-events"
    case "space":    return eventId ? `/spaces/scheduled?event=${eventId}` : "/spaces/scheduled"
    default:         return null
  }
}

// Convenience wrapper for a full event object as returned by /api/events --
// matches CalendarView.js's hubKeyOf: a club event is identified by
// club_id, never hub_type, and this must keep agreeing with that function.
export function eventDeepLinkFor(ev) {
  const hubType = ev?.club_id ? "club" : ev?.hub_type
  return eventDeepLink(hubType, ev?.id)
}
