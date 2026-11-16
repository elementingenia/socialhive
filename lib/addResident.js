// Add Resident (Iain, 2026-11-16): one step for a new resident -- their
// Contacts details and their login together, from Info > Contacts or the
// Committee page. Every resident added this way gets a login; the starting
// password is generated and handed over in the welcome pack.
//
// Pure -- no DB access -- so the rules are unit-tested
// (tests/unit/addResident.test.mjs). The route is
// app/api/residents/add/route.js.

// Relative imports: unit tests run under plain node with no "@/" alias.
import { validateUsername } from "./accounts.js"
import { isValidDisplayName } from "./memberName.js"
import { normaliseHouseNumber } from "./address.js"

/** Error string for the form, or null when it can be saved. */
export function validateAddResident({ name, display_name, username, house_number } = {}) {
  if (!String(name || "").trim()) return "Full name is required."
  const dn = String(display_name ?? "").trim()
  if (dn && !isValidDisplayName(dn)) return "Display name must be at least 3 letters."
  const u = validateUsername(username)
  if (u) return u
  const h = normaliseHouseNumber(house_number ?? "")
  if (!h.ok) return h.error
  return null
}

/**
 * The categories a new resident's Contacts entry is filed under: Residents
 * always first, then any others chosen, each once, and only ids that exist.
 */
export function residentCategoryIds(chosen, residentsId, validIds) {
  const valid = new Set(validIds || [])
  const out = residentsId ? [residentsId] : []
  for (const id of chosen || []) {
    if (id && id !== residentsId && valid.has(id) && !out.includes(id)) out.push(id)
  }
  return out
}

const sameName = (a, b) => {
  const x = String(a || "").trim().toLowerCase().replace(/\s+/g, " ")
  return !!x && x === String(b || "").trim().toLowerCase().replace(/\s+/g, " ")
}
const sameHouse = (a, b) => {
  const x = String(a ?? "").trim()
  return !!x && x === String(b ?? "").trim()
}

/**
 * People already on file who may be the one being added, so the form can
 * warn before a duplicate is made. A resident in Contacts with no login and
 * the same name comes back as `canUse`: the form offers to give THAT entry
 * the login instead of making a second one.
 *  members:  [{ id, name, house_number }]  (active logins)
 *  contacts: [{ id, name, house_number, member_id, categoryIds }]
 */
export function possibleDuplicates({ name, house_number } = {}, members = [], contacts = [], residentsId = null) {
  const out = []
  for (const m of members) {
    if (sameName(m.name, name)) out.push({ kind: "login", id: m.id, name: m.name, house_number: m.house_number || null, reason: "name" })
    else if (sameHouse(m.house_number, house_number)) out.push({ kind: "login", id: m.id, name: m.name, house_number: m.house_number, reason: "house" })
  }
  for (const c of contacts) {
    if (c.member_id) continue
    const isResident = !residentsId || (c.categoryIds || []).includes(residentsId)
    if (!isResident) continue
    if (sameName(c.name, name)) out.push({ kind: "contact", id: c.id, name: c.name, house_number: c.house_number || null, reason: "name", canUse: true })
    else if (sameHouse(c.house_number, house_number)) out.push({ kind: "contact", id: c.id, name: c.name, house_number: c.house_number, reason: "house" })
  }
  // Same name first: those are the likely duplicates.
  return out.sort((a, b) => (a.reason === b.reason ? 0 : a.reason === "name" ? -1 : 1))
}
