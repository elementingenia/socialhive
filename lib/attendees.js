// Booking-party validation (workstream A, feedback round 2026-07-16).
//
// The booker holds one seat; the remaining (seats - 1) seats must each be
// named — a resident (member_id) or, only when the event allows it, a
// non-resident guest (guest_name). Pure logic so it can be shared by the
// server (app/api/bookings/route.js, the authoritative check) and unit-tested
// without a database. Returns a normalised attendee list on success.

export function validateParty({ seats, attendees, allowGuests, ownerId }) {
  const n = Math.max(1, parseInt(seats, 10) || 1)
  const need = n - 1
  const list = Array.isArray(attendees) ? attendees : []

  if (list.length !== need) {
    return { ok: false, error: `Please name all ${need} additional attendee${need !== 1 ? "s" : ""}.` }
  }

  const seenResidents = new Set()
  const normalised = []
  for (const a of list) {
    if (a && a.member_id) {
      if (ownerId && a.member_id === ownerId) {
        return { ok: false, error: "You're already counted as the booker — pick someone else." }
      }
      if (seenResidents.has(a.member_id)) {
        return { ok: false, error: "Each resident can only be added once." }
      }
      seenResidents.add(a.member_id)
      normalised.push({ member_id: a.member_id, guest_name: null, bring_category_id: a.bring_category_id || null, bring_note: a.bring_note || null })
    } else if (a && typeof a.guest_name === "string" && a.guest_name.trim()) {
      if (!allowGuests) {
        return { ok: false, error: "This event is for residents only — please pick a resident." }
      }
      normalised.push({ member_id: null, guest_name: a.guest_name.trim(), bring_category_id: a.bring_category_id || null, bring_note: a.bring_note || null })
    } else {
      return { ok: false, error: "Every additional seat needs a resident or a guest name." }
    }
  }
  return { ok: true, attendees: normalised }
}

// "Attendees bring something" (scope §6). Iain's ruling: the BOOKER must pick a
// category; their additional attendees are optional (the booker is usually
// catering for the people they're booking for). Pure so the server and the
// booking UI enforce exactly the same rule.
export function validateBring({ required, bringCategoryId, allowedCategoryIds }) {
  if (!required) return { ok: true }
  if (!bringCategoryId) {
    return { ok: false, error: "Please choose what you're bringing." }
  }
  if (Array.isArray(allowedCategoryIds) && allowedCategoryIds.length && !allowedCategoryIds.includes(bringCategoryId)) {
    return { ok: false, error: "That option isn't available for this event." }
  }
  return { ok: true }
}
