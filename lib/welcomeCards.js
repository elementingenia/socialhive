// Welcome cards & Sign-in Help (Iain, 2026-10-09, scope:
// claude/Element_Happenings_Welcome_Cards_Scope_Answered.md). Admin prints a
// card per resident: username, a fresh one-time password, a QR code to the
// sign-in page with the username filled in, and three steps. The cards
// themselves are drawn as one PDF by lib/welcomeCardsPdf.js. Pure logic only
// (no DB, no randomness source of its own) so the API route and the unit
// tests share it.

import { hasSignedIn } from "./signedIn.js"

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

/** House key: trimmed house number, "" when the resident has none. */
export function houseKey(m) {
  return String(m?.house_number ?? "").trim()
}

/**
 * Houses where nobody has signed in yet (Iain, 2026-11-12: "no way to know
 * which HOUSES have no logins yet"). A house counts once any one of its
 * residents has signed in. Only houses with at least one active resident on
 * file can be counted -- the app has no list of every home -- and residents
 * with no house number belong to no house. Returns { total, none: Set }.
 */
export function housesNotSignedIn(list, signedInAuthIds) {
  const anySignedIn = new Map()
  for (const m of list || []) {
    if (!m || m.status !== "active" || m.is_test) continue
    const k = houseKey(m)
    if (!k) continue
    anySignedIn.set(k, !!anySignedIn.get(k) || hasSignedIn(m, signedInAuthIds))
  }
  const none = new Set([...anySignedIn].filter(([, yes]) => !yes).map(([k]) => k))
  return { total: anySignedIn.size, none }
}

/**
 * House numbers at the top of Sign-in Help (Iain, 2026-11-12: "There are 122
 * homes. The stat should always be based on that"). homeRefs is every home in
 * the village (properties.ref). A house with any active resident on file is
 * occupied; the rest are empty. noSignIn = occupied houses where nobody has
 * signed in. total and empty are null when the home list could not be read,
 * never a guessed number.
 */
export function houseStats(list, signedInAuthIds, homeRefs) {
  const { total: occupied, none } = housesNotSignedIn(list, signedInAuthIds)
  if (!homeRefs) return { total: null, occupied, noSignIn: none.size, empty: null }
  const lived = new Set((list || []).filter(m => m && m.status === "active" && !m.is_test).map(houseKey).filter(Boolean))
  const refs = new Set(homeRefs.map(r => String(r ?? "").trim()).filter(Boolean))
  return { total: refs.size, occupied, noSignIn: none.size, empty: [...refs].filter(r => !lived.has(r)).length }
}

/**
 * scope "never" = residents who have never signed in; "houses" = residents
 * of houses where nobody has signed in; "all" = everyone (reprints).
 * signedInAuthIds comes from lib/signedIn.js: having a login (auth_id) is
 * NOT the same as having signed in (fixed 2026-11-12).
 */
export function filterForScope(list, scope, signedInAuthIds) {
  const active = (list || []).filter(m => m && m.status === "active" && !m.is_test)
  if (scope === "all") return active
  if (scope === "houses") {
    const { none } = housesNotSignedIn(active, signedInAuthIds)
    return active.filter(m => none.has(houseKey(m)))
  }
  return active.filter(m => !hasSignedIn(m, signedInAuthIds))
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
