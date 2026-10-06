// Event notices (Iain, 2026-10-06) -- pure, dependency-free so it can be unit
// tested under plain Node (tests/unit/eventNotices.test.mjs). The route is
// app/api/event-notices; the UI is components/EventNotices.js.
//
// Audience = everyone attending the event: residents with a confirmed or
// waitlisted booking, plus residents named in someone else's party
// (booking_attendees.member_id) whose booking is still active. Contacts with
// no app login can't receive anything and are counted separately so the
// coordinator knows who to tell another way.

export const ACTIVE_BOOKING_STATUSES = ["confirmed", "waitlist"]

// Plain-text preview for the notification message (content is RichEditor HTML).
export function eventNoticeMessage(eventTitle, content) {
  const title = String(eventTitle || "").trim() || "your event"
  const plain = String(content || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
  const snippet = plain.length > 90 ? plain.slice(0, 88) + "…" : plain
  return `Notice for ${title}: ${snippet}`
}

// bookings:   [{ id, member_id, contact_id, status }]
// partyRows:  [{ owner_id, owner_contact_id, member_id, contact_id }]
// Returns { memberIds, noAppCount } -- memberIds de-duplicated, author removed.
export function eventNoticeRecipients(bookings, partyRows, authorId) {
  const active = (bookings || []).filter(b => ACTIVE_BOOKING_STATUSES.includes(b.status))
  const activeOwners = new Set(active.map(b => b.member_id).filter(Boolean))
  const activeContactOwners = new Set(active.map(b => b.contact_id).filter(Boolean))

  const ids = new Set(active.map(b => b.member_id).filter(Boolean))
  const contacts = new Set(active.map(b => b.contact_id).filter(Boolean))

  for (const p of partyRows || []) {
    const ownerActive = (p.owner_id && activeOwners.has(p.owner_id)) ||
                        (p.owner_contact_id && activeContactOwners.has(p.owner_contact_id))
    if (!ownerActive) continue
    if (p.member_id) ids.add(p.member_id)
    else if (p.contact_id) contacts.add(p.contact_id)
  }

  if (authorId) ids.delete(authorId)
  return { memberIds: [...ids], noAppCount: contacts.size }
}

// Which events a viewer may read notices on: the ones they manage, plus the
// ones they're attending. Returns a Set of event ids.
export function viewableEventIds(eventIds, managedIds, attendingIds) {
  const managed = new Set(managedIds || [])
  const attending = new Set(attendingIds || [])
  return new Set((eventIds || []).filter(id => managed.has(id) || attending.has(id)))
}

// An "open, all welcome" club event (booking_required false) has no bookings,
// so there is nobody to send a notice to.
export function eventTakesNotices(event) {
  return !!event && event.booking_required !== false
}
