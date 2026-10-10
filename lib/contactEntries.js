// Builds the Info › Contacts list entries, shared with My Stuff (Iain,
// 2026-10-10) so a pinned person shows exactly as on Contacts. Moved here
// unchanged from app/(app)/info/contacts/page.js. Pure: no I/O.
import { isExternalContact } from "./categoryQuestions.js"
import { resolveMemberName } from "./memberName.js"

export function buildContactEntries({ members = [], displayContacts = [], contactByMemberId = {}, residentsId = null, isAdmin = false, interests = {}, skills = {}, me = null } = {}) {
  const memberEntries = members.filter(m => !m.is_test).map(m => {
    const linked = contactByMemberId[m.id]
    const isSelf = m.id === me?.id
    const maskedForViewer = m.hide_name && !isAdmin && !isSelf
    // display_name (2026-08-14): preferred fallback ahead of the real name
    // once unmasked -- masking itself (maskedForViewer) is unchanged.
    // searchName carries BOTH raw name and display_name, unmasked, so a
    // viewer who only knows one of the two names can still find the card
    // -- but only when this entry isn't masked for them (never leak the
    // real name of a Private resident into search for a non-admin).
    //
    // realName (2026-08-15, Iain): Display Name is front-and-centre for
    // everyone, but an admin specifically needs the Real Name reachable
    // without a click -- fire-warden/register accuracy means an admin
    // scanning this list has to be able to tell "Coastal Jane" is really
    // "Jane Doe" at a glance, not just search for either. Admin-only
    // (canManage), and only shown when it actually differs from what's
    // already on the card -- Private residents already collapse to
    // "Resident" for non-admins with nothing further revealed, unchanged.
    return {
      key: `m-${m.id}`,
      name: maskedForViewer ? "Resident" : resolveMemberName(m, { viewerId: me?.id, canManage: isAdmin }),
      realName: (!maskedForViewer && isAdmin && m.display_name && m.display_name !== m.name) ? m.name : null,
      searchName: maskedForViewer ? null : [m.name, m.display_name].filter(Boolean).join(" "),
      email: maskedForViewer ? null : m.email,
      house_number: maskedForViewer ? null : m.house_number,
      street_name: maskedForViewer ? null : (m.street_name || null),
      phone: maskedForViewer ? null : (m.phone || null),
      title: maskedForViewer ? null : (linked?.title || null),
      interests: maskedForViewer ? null : (interests[m.id] || null),
      skills: maskedForViewer ? null : (skills[m.id] || null),
      categoryIds: [residentsId, ...((linked?.contact_category_members) || []).map(x => x.category_id)].filter(Boolean),
      isMember: true, member: m,
      // Every active member is implicitly a Resident (migration 029), so a
      // member is never external.
      external: false,
      isResident: true,   // members are implicitly Residents (migration 029)
    badges: [isAdmin && m.is_admin && "Admin", isAdmin && m.hide_name && "Private"].filter(Boolean),
    }
  })
  const contactEntries = displayContacts.map(c => ({
    key: `c-${c.id}`, name: c.name, email: c.email, house_number: c.house_number,
    street_name: c.street_name || null,
    phone: c.phone, title: c.title,
    categoryIds: (c.contact_category_members || []).map(x => x.category_id),
    isMember: false, contact: c,
    // External = not in the Residents category (Iain's rule, 2026-07-27).
    // NOTE this is deliberately a DIFFERENT test from the one that decides
    // whether a category can be asked a question (that one requires an app
    // login -- see lib/questionRouting.js). A resident with no account, like
    // Lyn or Diane, is still a neighbour and is NOT marked external; they
    // just can't be messaged in-app.
    external: isExternalContact((c.contact_category_members || []).map(x => x.category_id), residentsId),
    // House number is a resident's detail. A tradesperson or the Community
    // Manager has one on file sometimes, but showing it implies they live
    // here (Iain, 2026-07-29), so it is hidden unless they're a Resident.
    isResident: !!residentsId && (c.contact_category_members || []).some(x => x.category_id === residentsId),
    badges: isAdmin && !c.active ? ["Hidden"] : [],
  }))
  return [...memberEntries, ...contactEntries].sort((a, b) => a.name.localeCompare(b.name))
}
