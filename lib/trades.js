// Recommend a Trade (Iain, 2026-11-03,
// Element_Happenings_Recommend_a_Trade_Scope_Answered). Pure rules -- no
// I/O, unit-tested in tests/unit/trades.test.mjs. Server side is
// lib/tradesServer.js + app/api/trades.

export const TRADES_HUB_TYPE = "trades"
export const TRADES_CATEGORY_NAME = "Trades"
export const TRADE_MODES = ["off", "admins", "everyone"]
export const TRADE_NOTE_MAX = 150
export const TRADE_NAME_MAX = 80
export const TRADE_TYPE_MAX = 40

export const PRIVATE_NOTICE =
  "Your profile is set to Private, so you can't recommend trades. To recommend, turn Private off in your Profile."

export const TRADES_DISCLAIMER =
  "Recommendations come from residents. The committee and Ingenia don't vouch for any trade — check licences and insurance yourself."

export function normaliseMode(mode) {
  return TRADE_MODES.includes(mode) ? mode : "off"
}

// Who can see and use recommending, from the switch (Q2).
//   off      -- nobody
//   admins   -- admins only (trial)
//   everyone -- every resident
export function canUseTrades(mode, { isAdmin = false } = {}) {
  const m = normaliseMode(mode)
  if (m === "everyone") return true
  if (m === "admins") return !!isAdmin
  return false
}

export function isTradesCategory(name) {
  return String(name || "").trim().toLowerCase() === TRADES_CATEGORY_NAME.toLowerCase()
}

export function cleanText(v, max) {
  const s = String(v ?? "").replace(/\s+/g, " ").trim()
  return max ? s.slice(0, max) : s
}

// Same storage standard as every other phone field (lib/phone.js): 10
// digits, shown 4-3-3. +61 is turned into a leading 0.
export function normalisePhone(raw) {
  let d = String(raw || "").replace(/\D/g, "")
  if (d.startsWith("61") && d.length === 11) d = "0" + d.slice(2)
  return d
}

export function isValidTradePhone(raw) {
  return /^0\d{9}$/.test(normalisePhone(raw)) || /^1[38]00\d{6}$/.test(normalisePhone(raw))
}

export function formatTradePhone(raw) {
  const d = normalisePhone(raw)
  return [d.slice(0, 4), d.slice(4, 7), d.slice(7, 10)].filter(Boolean).join(" ")
}

export function isValidEmail(v) {
  const s = cleanText(v)
  return !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

// Check everything a trade needs. Returns { ok, errors, value }.
// Name: at least one of person name or business name (scope 3.2).
export function validateTrade(input = {}) {
  const errors = {}
  const trade_type = cleanText(input.trade_type, TRADE_TYPE_MAX)
  const name = cleanText(input.name, TRADE_NAME_MAX)
  const business_name = cleanText(input.business_name, TRADE_NAME_MAX)
  const email = cleanText(input.email, 120)
  const note = cleanText(input.note, TRADE_NOTE_MAX)
  if (!trade_type) errors.trade_type = "Choose the kind of trade"
  if (!name && !business_name) errors.name = "Enter their name or business name"
  if (!isValidTradePhone(input.phone)) errors.phone = "Enter a 10-digit Australian phone number"
  if (!isValidEmail(email)) errors.email = "That email doesn't look right"
  const ok = Object.keys(errors).length === 0
  return {
    ok, errors,
    value: ok ? {
      trade_type, business_name: business_name || null, email: email || null,
      // contacts.name is NOT NULL; with only a business name, use it as the name.
      name: name || business_name,
      phone: formatTradePhone(input.phone),
      note: note || null,
    } : null,
  }
}

// Already listed? Same phone, or same name + same trade type (scope 3.2 step 4).
export function findDuplicateTrade(trades = [], { phone, name, business_name, trade_type, excludeId = null } = {}) {
  const p = normalisePhone(phone)
  const names = [name, business_name].map(n => cleanText(n).toLowerCase()).filter(Boolean)
  const type = cleanText(trade_type).toLowerCase()
  return trades.find(t => {
    if (excludeId && t.id === excludeId) return false
    if (p && normalisePhone(t.phone) === p) return true
    if (!type || cleanText(t.trade_type).toLowerCase() !== type) return false
    const theirs = [t.name, t.business_name].map(n => cleanText(n).toLowerCase()).filter(Boolean)
    return names.some(n => theirs.includes(n))
  }) || null
}

// Order on the Trades list (Q6): grouped by trade type A-Z, then most
// recommended first, ties A-Z by name. Trades with no type go last.
export function sortTrades(trades = [], countOf = () => 0) {
  return [...trades].sort((a, b) => {
    const at = cleanText(a.trade_type), bt = cleanText(b.trade_type)
    if (at && !bt) return -1
    if (!at && bt) return 1
    const byType = at.localeCompare(bt, "en", { sensitivity: "base" })
    if (byType) return byType
    const byCount = countOf(b) - countOf(a)
    if (byCount) return byCount
    return cleanText(a.name).localeCompare(cleanText(b.name), "en", { sensitivity: "base" })
  })
}

// Recommendations shown on a card: Private recommenders are left out
// (Iain: Private residents don't get a voice here), original first, then
// oldest first.
export function visibleRecommendations(recs = [], membersById = {}) {
  return recs
    .filter(r => {
      const m = membersById[r.member_id]
      return m && !m.hide_name && !m.is_test && m.status !== "inactive"
    })
    .sort((a, b) => (b.is_original ? 1 : 0) - (a.is_original ? 1 : 0) ||
      new Date(a.created_at) - new Date(b.created_at))
}

// "Recommended by Jane, Bob +3"
export function recommendedByLine(names = [], shown = 2) {
  if (!names.length) return ""
  const head = names.slice(0, shown).join(", ")
  const more = names.length - shown
  return `Recommended by ${head}${more > 0 ? ` +${more}` : ""}`
}

// What a resident may do on one trade card.
//   canEdit      -- original recommender or admin (Q3)
//   canRecommend -- not already recommending, not Private (shown a notice instead)
//   canWithdraw  -- recommending but not the locked original (Q4)
export function tradePermissions({ recs = [], meId = null, isAdmin = false, addedBy = null } = {}) {
  const mine = recs.find(r => r.member_id === meId) || null
  return {
    mine,
    canEdit: !!isAdmin || (!!meId && addedBy === meId),
    canRecommend: !mine,
    canWithdraw: !!mine && !mine.is_original,
  }
}

// Free-text trade types residents typed that aren't on the admin list.
export function unlistedTradeTypes(trades = [], types = []) {
  const listed = new Set(types.map(t => cleanText(t.name).toLowerCase()))
  const out = new Map()
  for (const t of trades) {
    const v = cleanText(t.trade_type)
    const key = v.toLowerCase()
    if (!v || listed.has(key)) continue
    if (!out.has(key)) out.set(key, { name: v, count: 0 })
    out.get(key).count++
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function tradeAddedMessage({ trade_type, name, business_name, by }) {
  const who = business_name && business_name !== name ? `${name} (${business_name})` : name
  return `${by} recommended a new ${String(trade_type).toLowerCase()}: ${who}. Check it in Info › Contacts › Trades.`
}
