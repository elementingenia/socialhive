// Username generation for The Social Hive.
//
// Scheme (Iain, 2026-07-29): FirstName + first letter of surname -- Doris Sacco
// becomes "DorisS". On a collision, take more of the surname: DorisS -> DorisSa
// -> DorisSac ... and finally append a digit if the whole surname is exhausted.
//
// The scheme has no natural headroom -- 20 first names are already shared by
// 2-3 residents -- so the tie-break is not a rare path and is unit-tested.
//
// Usernames are now renameable (migration 066 decoupled the Auth email), so a
// bad one is no longer permanent. Generating a sane one up front is still
// worth doing: the username is what the resident types to log in.

// Relative, not the "@/" alias: the unit tests run these libs under plain node
// (see package.json test:unit), which has no bundler to resolve the alias.
import { validateUsername } from "./accounts.js"

// Letters only, so hyphens/apostrophes/bracketed notes can't leak in:
// "Susan Ellis-Crewe" -> ["Susan","Ellis","Crewe"], "Joe O'Hehir" -> ["Joe","O","Hehir"].
export function nameParts(fullName) {
  return (fullName || "").split(/[^A-Za-z]+/).filter(Boolean)
}

// Every candidate for a name, in preference order.
export function candidates(fullName) {
  const parts = nameParts(fullName)
  if (!parts.length) return []
  const first = parts[0]
  if (parts.length === 1) return [first]           // no surname on file
  const surname = parts[parts.length - 1]
  const out = []
  for (let i = 1; i <= surname.length; i++) {
    out.push(first + surname[0].toUpperCase() + surname.slice(1, i).toLowerCase())
  }
  return out
}

// Pick the first candidate not already taken. `taken` is any iterable of
// existing usernames; comparison is case-insensitive because both the login
// lookup and the uniqueness check use ilike.
export function suggestUsername(fullName, taken = []) {
  const used = new Set([...taken].map(u => (u || "").toLowerCase()))
  for (const c of candidates(fullName)) {
    if (!used.has(c.toLowerCase()) && !validateUsername(c)) return c
  }
  // Surname exhausted (or too short to be valid) -- fall back to numbering.
  const base = candidates(fullName)[0] || nameParts(fullName)[0] || "resident"
  for (let n = 2; n < 1000; n++) {
    const c = `${base}${n}`
    if (!used.has(c.toLowerCase()) && !validateUsername(c)) return c
  }
  return null
}
