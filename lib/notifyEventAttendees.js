// lib/notifyEventAttendees.js
// Server-only helper — notifies every member with an active (confirmed or
// waitlisted) booking on an event. Used when an event's date/time/location
// changes, so attendees find out from the app rather than by surprise.
//
// Takes the caller's own supabaseAdmin (service-role) client rather than
// creating one itself, so it stays a plain function each API route can
// import without any extra env wiring.
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

  const rows = memberIds.map(member_id => ({ member_id, event_id, type, message }))
  try {
    await supabaseAdmin.from('notifications').insert(rows)
  } catch (_) {}
}
