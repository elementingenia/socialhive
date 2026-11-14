// Admin account-management validation (2026-07-16). An "account" is a members
// row (name, unique username, pin) linked to a Supabase Auth user. Pure logic
// so the admin API and unit tests share one source of truth. Mirrors the
// self-service register route's rules (username >= 3, pin >= 4).

export function validateUsername(username) {
  const u = (username || "").trim()
  if (u.length < 3) return "Username must be at least 3 characters."
  if (!/^[a-zA-Z0-9_]+$/.test(u)) return "Username can only contain letters, numbers and underscores."
  return null
}

export function validatePin(pin) {
  const p = pin == null ? "" : String(pin)
  if (p.length < 4) return "PIN must be at least 4 characters."
  if (/\s/.test(p)) return "PIN can't contain spaces."
  return null
}

export function validateNewAccount({ name, username, pin }) {
  if (!name || !name.trim()) return "Name is required."
  return validateUsername(username) || validatePin(pin)
}

/**
 * Details a new login takes over from the Contacts entry it is created from
 * (BUG-106, 2026-11-15: Create Login linked the contact but left the login
 * with no house number, so the welcome card and the house counts missed
 * them). Once linked, the members row is the source of truth for these
 * (migration 030), so they must be copied at creation. Blank values are left
 * out; a house number that isn't a plain number is left out, not guessed.
 */
export function memberFieldsFromContact(contact) {
  if (!contact) return {}
  const out = {}
  const house = String(contact.house_number ?? "").trim().replace(/^0+(?=\d)/, "")
  if (/^[1-9]\d{0,5}$/.test(house)) out.house_number = house
  if (contact.street_id) out.street_id = contact.street_id
  const phone = String(contact.phone ?? "").trim()
  if (phone) out.phone = phone
  const email = String(contact.email ?? "").trim()
  if (email) out.email = email
  return out
}
