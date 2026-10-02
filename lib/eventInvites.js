// Invite a Neighbour (Iain, 2026-10-02) -- pure, dependency-light rules so
// they can be unit tested under plain Node (tests/unit/eventInvites.test.mjs).
// app/api/events/invite/route.js is the only writer; it calls these.
import { isEventPast } from "./date.js"
import { bookingsClosed } from "./booking.js"

// Iain: "Invite cap per sender per event - 10 OK? yes"
export const INVITE_CAP_PER_SENDER = 10

/** Can anyone still invite people to this event? Future, not archived, and
 * either still taking bookings or an open "all welcome" event (which has no
 * bookings to close). */
export function canInviteToEvent(event, now = new Date()) {
  if (!event || event.archived) return false
  if (isEventPast(event, now)) return false
  if (event.booking_required === false) return true
  return !bookingsClosed(event, now)
}

/**
 * Decide who actually gets an invite.
 * @param {object} p
 * @param {string[]} p.requestedIds   - who the sender picked
 * @param {string}   p.senderId
 * @param {Set|string[]} p.ineligibleIds - test accounts, no-login accounts,
 *   inactive members, Private members the sender can't see
 * @param {Set|string[]} p.bookedIds  - already booked (confirmed or waitlist)
 * @param {Set|string[]} p.alreadyInvitedIds - invited to this event by ANYONE
 * @param {number} p.senderSentCount  - invites this sender already sent for this event
 * @returns {{ toInvite: string[], skipped: number, capReached: boolean, remaining: number }}
 */
export function planInvites({ requestedIds, senderId, ineligibleIds = [], bookedIds = [], alreadyInvitedIds = [], senderSentCount = 0 }) {
  const blocked = new Set([...ineligibleIds, ...bookedIds, ...alreadyInvitedIds, senderId])
  const unique = [...new Set((requestedIds || []).filter(Boolean))]
  const eligible = unique.filter(id => !blocked.has(id))
  const remaining = Math.max(0, INVITE_CAP_PER_SENDER - (senderSentCount || 0))
  const toInvite = eligible.slice(0, remaining)
  return {
    toInvite,
    skipped: unique.length - toInvite.length,
    capReached: eligible.length > remaining,
    remaining: remaining - toInvite.length,
  }
}

/** Fixed wording -- no free-text note in phase 1 (nothing to moderate). */
export function inviteMessage(senderName, eventTitle) {
  const who = (senderName || "A neighbour").trim()
  const what = (eventTitle || "an event").trim()
  return `${who} thinks you'd enjoy ${what}`
}
