// Booking-party validation (workstream A, feedback round 2026-07-16; extended
// 2026-07-23 for contact-only residents).
//
// The booker holds one seat; the remaining (seats - 1) seats must each be
// named — a resident with an app account (member_id), a resident with no
// account who exists only as a Contacts-hub entry (contact_id), or, only
// when the event allows it, a non-resident guest (guest_name). A contact is a
// real resident, not a guest — kept as its own identity so the distinction
// (and the Contacts-hub row it points at) isn't lost. Pure logic so it can be
// shared by the server (app/api/bookings/route.js, the authoritative check)
// and unit-tested without a database. Returns a normalised attendee list on
// success.

export function validateParty({ seats, attendees, allowGuests, ownerId, ownerContactId, takenMemberIds, takenContactIds, required = true }) {
  const n = Math.max(1, parseInt(seats, 10) || 1)
  const need = n - 1
  const rawList = Array.isArray(attendees) ? attendees : []
  // Residents/contacts already attached to ANY OTHER booking for this event
  // (as the primary booker or as someone else's named party member) --
  // passed in by the caller, already excluding this booking's own owner, so
  // resubmitting an unchanged party (e.g. Modify) isn't blocked by itself.
  // Optional so existing pure unit tests that don't care about this still
  // work unchanged. Found live 2026-07-24 (Iain): the same resident could be
  // added to two different bookings for one event with nothing stopping it.
  const takenM = takenMemberIds || new Set()
  const takenC = takenContactIds || new Set()

  // Naming used to be mandatory on every multi-seat booking with no way to
  // turn it off. Iain, 2026-07-25: default should be the other way around --
  // naming is optional unless an event explicitly requires it
  // (events.require_attendee_names). `required` defaults to true so every
  // pre-existing caller/unit test that doesn't pass it keeps today's strict
  // behaviour; only the booking routes pass the real per-event value now.
  // When not required, a completely blank row (nothing picked, no guest name
  // typed) just means "not naming this seat" -- dropped rather than treated
  // as an error. When required, a blank row still falls through to the
  // per-entry "needs a resident or guest name" error below, same as always.
  const isFilled = a => !!(a && (a.member_id || a.contact_id || (typeof a.guest_name === "string" && a.guest_name.trim())))
  const list = required ? rawList : rawList.filter(isFilled)

  if (required && list.length !== need) {
    return { ok: false, error: `Please name all ${need} additional attendee${need !== 1 ? "s" : ""}.` }
  }
  if (list.length > need) {
    return { ok: false, error: `Too many attendees named — this booking only has room for ${need}.` }
  }

  const seenResidents = new Set()
  const seenContacts = new Set()
  const normalised = []
  for (const a of list) {
    if (a && a.member_id) {
      if (ownerId && a.member_id === ownerId) {
        return { ok: false, error: "You're already counted as the booker — pick someone else." }
      }
      if (seenResidents.has(a.member_id)) {
        return { ok: false, error: "Each resident can only be added once." }
      }
      if (takenM.has(a.member_id)) {
        return { ok: false, error: "That resident is already booked for this event — pick someone else." }
      }
      seenResidents.add(a.member_id)
      normalised.push({ member_id: a.member_id, contact_id: null, guest_name: null, bring_category_id: a.bring_category_id || null, bring_note: a.bring_note || null })
    } else if (a && a.contact_id) {
      if (ownerContactId && a.contact_id === ownerContactId) {
        return { ok: false, error: "You're already counted as the booker — pick someone else." }
      }
      if (seenContacts.has(a.contact_id)) {
        return { ok: false, error: "Each resident can only be added once." }
      }
      if (takenC.has(a.contact_id)) {
        return { ok: false, error: "That resident is already booked for this event — pick someone else." }
      }
      seenContacts.add(a.contact_id)
      normalised.push({ member_id: null, contact_id: a.contact_id, guest_name: null, bring_category_id: a.bring_category_id || null, bring_note: a.bring_note || null })
    } else if (a && typeof a.guest_name === "string" && a.guest_name.trim()) {
      if (!allowGuests) {
        return { ok: false, error: "This event is for residents only — please pick a resident." }
      }
      normalised.push({ member_id: null, contact_id: null, guest_name: a.guest_name.trim(), bring_category_id: a.bring_category_id || null, bring_note: a.bring_note || null })
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

// An event's stored bring_category_ids is a point-in-time snapshot of
// club_bring_categories row ids. If those categories are ever re-saved with
// fresh ids (the ClubForm churn bug fixed 2026-07-24, PR #15) an older
// event's snapshot goes stale. EventSlideOut.js already has a client-side
// fallback for this (show every current category rather than block booking
// entirely when the stored allow-list matches none of them) -- found live on
// Sydney Harbour Night both at the original 2026-07-24 fix and again
// 2026-07-25 when Iain hit "That option isn't available for this event" on
// submit: the client fallback fixed what's *displayed* but validateBring was
// still checking the raw stale ids, so anything the fallback let you pick
// was then rejected server-side. This resolves the allow-list the exact same
// way the client does, so the server accepts whatever the client is actually
// showing as pickable options -- total-mismatch treated as unrestricted,
// partial-mismatch narrowed to just the ids that still exist.
export function resolveBringCategoryIds({ allowedCategoryIds, currentCategoryIds }) {
  if (!Array.isArray(allowedCategoryIds) || allowedCategoryIds.length === 0) return null
  const current = new Set(currentCategoryIds || [])
  const stillValid = allowedCategoryIds.filter(id => current.has(id))
  if (stillValid.length === 0 && current.size > 0) return null // fully stale -- unrestricted, matches client fallback
  return stillValid
}
