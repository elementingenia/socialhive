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
