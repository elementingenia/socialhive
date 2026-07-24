import { supabaseAdmin } from "@/lib/supabaseAdmin"

// Every resident (member) or contact already attached to a live booking for
// this event -- either as the primary booker (bookings.member_id/contact_id,
// any non-cancelled status) or as someone else's named party member
// (booking_attendees). Used to stop the same resident being added to two
// different bookings for one event (Iain found this live 2026-07-24: Annie
// Pallot was bookable into both Scampi's party and Iain's own party for the
// same screening).
//
// excludeOwnerId/excludeOwnerContactId should be the booking owner making
// THIS request, so resubmitting their own unchanged party (e.g. Modify
// seats) never trips over their own existing rows.
export async function fetchTakenResidentIds(eventId, { excludeOwnerId = null, excludeOwnerContactId = null } = {}) {
  const [{ data: bookingRows }, { data: attendeeRows }] = await Promise.all([
    supabaseAdmin.from("bookings").select("member_id, contact_id")
      .eq("event_id", eventId).neq("status", "cancelled"),
    supabaseAdmin.from("booking_attendees").select("member_id, contact_id, owner_id, owner_contact_id")
      .eq("event_id", eventId),
  ])

  const memberIds = new Set()
  const contactIds = new Set()

  for (const b of bookingRows || []) {
    if (b.member_id && b.member_id !== excludeOwnerId) memberIds.add(b.member_id)
    if (b.contact_id && b.contact_id !== excludeOwnerContactId) contactIds.add(b.contact_id)
  }
  for (const r of attendeeRows || []) {
    if (excludeOwnerId && r.owner_id === excludeOwnerId) continue
    if (excludeOwnerContactId && r.owner_contact_id === excludeOwnerContactId) continue
    if (r.member_id) memberIds.add(r.member_id)
    if (r.contact_id) contactIds.add(r.contact_id)
  }

  return { memberIds, contactIds }
}
