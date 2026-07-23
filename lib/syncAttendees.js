import { supabaseAdmin } from "@/lib/supabaseAdmin"

// Keep an owner's named party (booking_attendees) in sync with their seat
// count for an event. Full replace -- simplest correct behaviour against
// seat changes and waitlist churn, since the set is small (a handful of
// rows). Originally lived only in app/api/bookings/route.js (member-owned,
// self-service bookings); extracted 2026-07-23 so app/api/coordinator's
// walk-up add_booking can share it for contact-owned bookings too (Iain:
// "let Lyn make a walk-up booking for 2 seats and set Geoff as the second
// seat"). Exactly one of ownerId/ownerContactId must be given, mirroring
// booking_attendees' own owner_id XOR owner_contact_id CHECK (migration 061).
export async function syncAttendees(eventId, { ownerId, ownerContactId }, attendees) {
  let del = supabaseAdmin.from("booking_attendees").delete().eq("event_id", eventId)
  del = ownerId ? del.eq("owner_id", ownerId) : del.eq("owner_contact_id", ownerContactId)
  await del
  if (attendees && attendees.length) {
    await supabaseAdmin.from("booking_attendees").insert(
      attendees.map(a => ({
        event_id: eventId, owner_id: ownerId || null, owner_contact_id: ownerContactId || null,
        member_id: a.member_id || null, contact_id: a.contact_id || null, guest_name: a.guest_name || null,
        bring_category_id: a.bring_category_id || null, bring_note: a.bring_note || null,
      }))
    )
  }
}
