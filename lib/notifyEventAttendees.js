// lib/notifyEventAttendees.js
// Server-only helper — notifies every member with an active (confirmed or
// waitlisted) booking on an event. Used when an event's date/time/location
// changes, so attendees find out from the app rather than by surprise.
//
// Routes each recipient through lib/notify.js (2026-07-14) rather than a
// single bulk `notifications` insert, so push goes out alongside the
// in-app row for every attendee, not just the DB write. No longer needs
// the caller's supabaseAdmin client passed in -- notify() has its own.
import { notify } from "@/lib/notify"

export async function notifyEventAttendees(supabaseAdmin, event_id, type, message, { excludeMemberId } = {}) {
  const { data: bookings } = await supabaseAdmin
    .from('bookings')
    .select('member_id')
    .eq('event_id', event_id)
    .in('status', ['confirmed', 'waitlist'])

  const memberIds = [...new Set(
    (bookings || []).map(b => b.member_id).filter(id => id && id !== excludeMemberId)
  )]
  if (!memberIds.length) return

  await Promise.all(memberIds.map(member_id => notify(member_id, event_id, type, message)))
}
