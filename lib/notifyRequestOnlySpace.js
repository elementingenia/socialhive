// lib/notifyRequestOnlySpace.js — server-only. "Request Only" locations
// (Iain, 2026-08-04): an Admin can book/create directly against one of
// these rooms without a checkbox (trusted to have already talked to
// Ingenia), but gets a reminder notification to actually go validate it.
//
// Deliberately a SEPARATE file from lib/spaceBookings.js, even though this
// is conceptually "spaces" logic: spaceBookings.js is imported client-side
// too (components/SpaceBookingForm.js pulls in its pure validators/
// constants), and lib/notify.js drags in lib/push.js -> the `web-push`
// package, which is Node-only and breaks the client webpack bundle the
// moment anything imports it transitively. Route handlers only.
import { notify } from './notify.js'

// Fired from every place an Admin can put a booking against a Request Only
// room -- the event-creation routes (screenings/social/clubs) when
// location_id newly points at a request_only room, and app/api/spaces
// POST when an admin uses the personal booking form directly. `eventId` is
// null for a personal space_bookings row (notifications.event_id FKs to
// events, so it must never be a space_bookings id) -- same pattern
// bar_reconciled already uses for an event-less notification.
export async function notifyRequestOnlySpace({ actingMemberId, eventId, eventTitle, eventDate, locationName }) {
  if (!actingMemberId) return
  const when = eventDate ? ` (${eventDate})` : ''
  const what = eventTitle ? `"${eventTitle}"` : 'This booking'
  await notify(
    actingMemberId, eventId || null, 'space_request_validate',
    `${what} uses ${locationName || 'a Request Only space'}${when} — confirm with the Ingenia Community Manager if you haven't already.`,
    '/home',
  )
}
