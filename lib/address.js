// House numbers and street names (migration 122, Iain 2026-10-03).
//
// House numbers are whole numbers only, with no upper limit (the app may be
// used by other communities). Streets come from an admin-managed list
// (Admin > Streets); residents pick theirs, they never type one in.
//
// Pure -- no DB access -- so the rules are unit-tested
// (tests/unit/address.test.mjs). The DB enforces the same house-number rule
// with a CHECK constraint (members/contacts_house_number_digits).

export const HOUSE_NUMBER_MAX_DIGITS = 6
export const STREET_NAME_MIN = 2
export const STREET_NAME_MAX = 60
export const HOUSE_NUMBER_ERROR = "House number must be a number only, e.g. 14. Choose your street from the Street list."

// Returns { ok: true, value } where value is a clean digits-only string or
// null (blank), or { ok: false, error }. Leading zeros are dropped ("007" is
// house 7), so sorting and matching treat them as the same house.
export function normaliseHouseNumber(input) {
  if (input === null || input === undefined) return { ok: true, value: null }
  const s = String(input).trim()
  if (s === "") return { ok: true, value: null }
  if (!/^\d+$/.test(s)) return { ok: false, error: HOUSE_NUMBER_ERROR }
  const v = s.replace(/^0+(?=\d)/, "")
  if (v === "0") return { ok: false, error: "House number can't be 0." }
  if (v.length > HOUSE_NUMBER_MAX_DIGITS) return { ok: false, error: "That house number is too long." }
  return { ok: true, value: v }
}

// What the house-number box allows while typing: digits only.
export function houseNumberInput(raw) {
  return String(raw ?? "").replace(/\D/g, "").slice(0, HOUSE_NUMBER_MAX_DIGITS)
}

export function normaliseStreetName(s) {
  return typeof s === "string" ? s.trim().replace(/\s+/g, " ") : ""
}

// Case- and spacing-insensitive key, so "Mosaic Street" and " mosaic  street"
// count as the same street (the DB unique index matches lower(btrim(name))).
export function streetKey(s) {
  return normaliseStreetName(s).toLowerCase()
}

export function validateStreetName(s) {
  const n = normaliseStreetName(s)
  if (n.length < STREET_NAME_MIN) return "Street name needs at least 2 characters."
  if (n.length > STREET_NAME_MAX) return `Street name can't be longer than ${STREET_NAME_MAX} characters.`
  return null
}

export function sortStreets(list) {
  return [...(list || [])].sort((a, b) => (a.name || "").localeCompare(b.name || "", "en", { sensitivity: "base" }))
}

// "92 Mosaic Street", "#92", "Mosaic Street" or "" -- one place so every
// screen reads the same.
export function formatAddress(houseNumber, streetName) {
  const h = houseNumber ? String(houseNumber).trim() : ""
  const s = streetName ? String(streetName).trim() : ""
  if (h && s) return `${h} ${s}`
  if (h) return `#${h}`
  return s
}

// Server-side check of a street_id sent by a form: blank clears it, anything
// else must be one of the current streets.
export function resolveStreetId(input, streets) {
  if (input === null || input === undefined || input === "") return { ok: true, value: null }
  const found = (streets || []).find(s => s.id === input)
  return found ? { ok: true, value: found.id } : { ok: false, error: "Choose a street from the list." }
}
