// Welcome cards & Sign-in Help (Iain, 2026-10-09, scope:
// claude/Element_Happenings_Welcome_Cards_Scope_Answered.md). Admin prints a
// card per resident: username, a fresh one-time password, a QR code to the
// sign-in page with the username filled in, and three steps. The cards
// themselves are drawn as one PDF by lib/welcomeCardsPdf.js. Pure logic only
// (no DB, no randomness source of its own) so the API route and the unit
// tests share it.

export const HELP_SETTING_KEY = "welcome_card_help"
export const CARDS_PER_SHEET = 4

// Easy to read aloud and type for an older audience: 4 digits. Rejects the
// guessable ones (all the same digit, straight runs up or down). It is a
// one-time password: the resident must replace it at first sign-in.
export function isWeakStartingPin(pin) {
  const p = String(pin)
  if (!/^\d{4}$/.test(p)) return true
  if (/^(\d)\1{3}$/.test(p)) return true
  const d = p.split("").map(Number)
  const up = d.every((n, i) => i === 0 || n === (d[i - 1] + 1) % 10)
  const down = d.every((n, i) => i === 0 || n === (d[i - 1] + 9) % 10)
  return up || down
}

/** randomInt(min, maxExclusive) is injected (crypto.randomInt in the route). */
export function generateStartingPin(randomInt) {
  for (let i = 0; i < 50; i++) {
    const pin = String(randomInt(0, 10000)).padStart(4, "0")
    if (!isWeakStartingPin(pin)) return pin
  }
  return "4826"
}

function houseNum(m) {
  const n = parseInt(m?.house_number, 10)
  return Number.isFinite(n) ? n : Infinity
}

/** Walking order: house number ascending (numeric), then name. */
export function sortForWalking(list) {
  return [...(list || [])].sort((a, b) =>
    houseNum(a) - houseNum(b) ||
    String(a.name || "").localeCompare(String(b.name || ""), "en", { sensitivity: "base" }))
}

/** scope "never" = residents with no login yet; "all" = everyone (reprints). */
export function filterForScope(list, scope) {
  return (list || []).filter(m => m && m.status === "active" && !m.is_test &&
    (scope === "all" || !m.auth_id))
}

export function firstName(name) {
  const n = String(name || "").trim()
  return n ? n.split(/\s+/)[0] : ""
}

export function cardLoginUrl(origin, username) {
  return `${String(origin || "").replace(/\/+$/, "")}/login?u=${encodeURIComponent(username || "")}`
}

/** Hostname as printed on the card ("elementhappenings.com.au"). */
export function siteLabel(origin) {
  try { return new URL(origin).hostname.replace(/^www\./, "") } catch { return String(origin || "") }
}

export function chunk(list, size = CARDS_PER_SHEET) {
  const out = []
  for (let i = 0; i < (list || []).length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** Login page ?u= prefill: same rules as a username, else ignored. */
export function prefillUsername(raw) {
  const u = String(raw || "").trim()
  return /^[a-zA-Z0-9_]{3,40}$/.test(u) ? u : ""
}

/**
 * Sign-in Help search (Iain, 2026-10-19: "find residents by name or house
 * number specifically"). Digits (optionally "#77") match the house number
 * exactly, so 7 doesn't also bring up 17 and 77. Anything else matches the
 * name or username, ignoring case.
 */
export function matchesResidentSearch(m, query) {
  const q = String(query || "").trim().toLowerCase()
  if (!q) return true
  const num = q.replace(/^#\s*/, "")
  if (/^\d+$/.test(num)) return parseInt(m?.house_number, 10) === parseInt(num, 10)
  return String(m?.name || "").toLowerCase().includes(q) ||
    String(m?.username || "").toLowerCase().includes(q)
}
