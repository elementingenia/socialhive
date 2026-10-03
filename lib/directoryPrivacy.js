// Server-side masking for the resident directory (BUG-072, 2026-10-03).
//
// Before this, Info > Contacts, Info > Interests and the resident pickers
// read members/contacts straight from the browser and hid Private
// (hide_name) residents' details on screen only -- the real values were
// still in the network response. Migration 121 now stops the browser
// reading those columns at all; these helpers decide, on the server, what
// each viewer is allowed to receive.
//
// Pure -- no DB access -- so the rules are unit-tested
// (tests/unit/directoryPrivacy.test.mjs).

// Fields a viewer must not receive for a Private resident they aren't
// allowed to see. Same set Info > Contacts already hid on screen.
const MASKED_MEMBER = {
  name: "Resident",
  display_name: "Resident",
  username: null,
  email: null,
  phone: null,
  house_number: null,
  street_id: null,      // migration 122 -- street is part of the address
  street_name: null,
}

// A Private resident is visible in full to admins and to themselves only
// (Contacts rule, Iain 2026-07-12).
export function canSeePrivateMember(row, viewer) {
  if (!row?.hide_name) return true
  if (!viewer) return false
  return !!viewer.is_admin || row.id === viewer.id
}

export function maskMemberRow(row, viewer) {
  if (canSeePrivateMember(row, viewer)) return { ...row, masked: false }
  return { ...row, ...MASKED_MEMBER, masked: true }
}

// A contacts row linked to a member (member_id set) whose member is masked
// for this viewer must not leak that resident's details through the
// contacts table either.
export function maskLinkedContact(contact, maskedMemberIds) {
  if (!contact?.member_id || !maskedMemberIds.has(contact.member_id)) return contact
  return { ...contact, name: "Resident", title: null, phone: null, email: null, house_number: null, street_id: null, street_name: null }
}

// Info > Contacts payload. Non-admins only ever get active contacts (the
// old contacts_read RLS rule); admins get hidden ones too (they manage them).
export function buildContactsDirectory({ members = [], contacts = [], viewer }) {
  const maskedMembers = members.map(m => maskMemberRow(m, viewer))
  const maskedIds = new Set(maskedMembers.filter(m => m.masked).map(m => m.id))
  const visibleContacts = viewer?.is_admin ? contacts : contacts.filter(c => c.active)
  return {
    members: maskedMembers,
    contacts: visibleContacts.map(c => maskLinkedContact(c, maskedIds)),
  }
}

// Resident pickers.
//   purpose "party"  -- a resident naming who else is coming on their own
//                       booking. Private residents are left out entirely
//                       (Iain, 2026-10-03: "If a resident is set as Private,
//                       then they simply cannot be added by another user").
//   purpose "walkup" -- the coordinator panel (walk-up booking / Modify on
//                       someone's behalf). Coordinators may "assist" a Private
//                       resident, so they are included -- but only when the
//                       viewer actually manages this event.
// A Private resident's address is only sent to admins, the resident
// themself, or someone who manages this event.
export function buildResidentPicker({ members = [], contacts = [], viewer, canManageEvent = false, purpose = "party" }) {
  const includePrivate = purpose === "walkup" && (canManageEvent || !!viewer?.is_admin)
  const list = [
    ...members.filter(m => !m.hide_name || includePrivate || m.id === viewer?.id).map(m => {
      const showAddress = !m.hide_name || canManageEvent || canSeePrivateMember(m, viewer)
      return {
        id: m.id, name: m.name, username: m.username,
        house_number: showAddress ? (m.house_number || null) : null,
        street_name: showAddress ? (m.street_name || null) : null,
        type: "member",
      }
    }),
    ...contacts.map(c => ({ id: c.id, name: c.name, username: null, house_number: c.house_number || null, street_name: c.street_name || null, type: "contact" })),
  ]
  list.sort((a, b) => (a.name || "").localeCompare(b.name || ""))
  return list
}
