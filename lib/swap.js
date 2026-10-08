// lib/swap.js — Swap & Sell pure logic (no Supabase import), unit tested
// directly under plain Node (tests/unit/swap.test.mjs). Same pure/DB split
// as lib/happeningsNewsTier.js + lib/happeningsNewsAuth.js: decisions live
// here, anything that touches the database lives in lib/swapServer.js.
//
// Scope: Element_Happenings_Swap_and_Sell_Scope_Answered (Iain 2026-10-05).

import { sydneyTodayStr, isoToSydneyDateStr } from "./date.js"

export const HUB_TYPE = "swap"
export const PHOTOS_BUCKET = "swap-and-sell-images"

export const TYPES = ["sale", "free", "wanted"]
export const TYPE_LABELS = { sale: "For sale", free: "Free", wanted: "Wanted" }

// Short fixed list, A–Z (UI standard: every dropdown sorts A–Z).
export const CATEGORIES = [
  "Books & media",
  "Clothing & accessories",
  "Craft & hobbies",
  "Electronics",
  "Furniture",
  "Garden & outdoor",
  "Health & mobility aids",
  "Household & kitchen",
  "Sport & leisure",
  "Tools & DIY",
  "Toys & games",
  "Other",
]

export const CONDITIONS = ["new", "like_new", "good", "fair"]
export const CONDITION_LABELS = { new: "New", like_new: "Like new", good: "Good", fair: "Fair" }

export const STATUSES = ["available", "reserved", "gone"]

export const MAX_PHOTOS = 4
export const MAX_TITLE = 80
export const MAX_DESCRIPTION = 1000
export const MAX_MESSAGE = 1000
export const MAX_REPORT_REASON = 500
export const MAX_PRICE = 100000
export const EXPIRY_DAYS = 30
export const REMINDER_DAYS = 3
export const CONVERSATION_CLOSE_DAYS = 14
export const DEFAULT_LISTING_CAP = 2
export const MIN_LISTING_CAP = 1
export const MAX_LISTING_CAP = 20

// Shown on the create form (decision 9) -- a declaration, not a word filter.
export const NOT_ALLOWED_TEXT = "Not allowed: food or drink, alcohol, medicines, animals, weapons."

export const PRIVACY_NOTE =
  "Swap & Sell shows your display name to other residents so buyers and sellers know who they're dealing with. Your Private setting doesn't apply here."

export const PAYMENT_FOOTER = "Element Happenings doesn't handle payments. Pay and collect between yourselves."

const DAY_MS = 24 * 60 * 60 * 1000

function toDate(v) {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Preview/Production independence -- same two-flag pattern as Happenings
 * News (lib/happeningsNewsTier.js's isHappeningsNewsLive). `row` is the
 * hub_settings 'swap' row: { enabled, production_enabled }.
 */
export function isSwapLive(row, env = process.env.VERCEL_ENV) {
  if (!row) return false
  return env === "production" ? !!row.production_enabled : !!row.enabled
}

/** Can this member use Swap & Sell right now? Admins can always, to trial it. */
export function canUseSwap({ live, isAdmin }) {
  return !!isAdmin || !!live
}

export function isValidListingCap(n) {
  const v = Number(n)
  return Number.isInteger(v) && v >= MIN_LISTING_CAP && v <= MAX_LISTING_CAP
}

export function expiryFrom(now = new Date()) {
  return new Date(now.getTime() + EXPIRY_DAYS * DAY_MS)
}

export function isExpired(listing, now = new Date()) {
  const exp = toDate(listing?.expires_at)
  return !!exp && now.getTime() >= exp.getTime()
}

/**
 * Active = shows on Browse and counts toward the per-resident cap: not Gone,
 * not hidden by an admin, not past its expiry. Reserved still counts.
 */
export function isListingActive(listing, now = new Date()) {
  if (!listing) return false
  if (listing.status === "gone") return false
  if (listing.hidden_at) return false
  return !isExpired(listing, now)
}

export function countActive(listings, now = new Date()) {
  return (listings || []).filter(l => isListingActive(l, now)).length
}

export function capReached(activeCount, cap) {
  const c = isValidListingCap(cap) ? Number(cap) : DEFAULT_LISTING_CAP
  return activeCount >= c
}

/** Seller gets one reminder in the last REMINDER_DAYS before expiry. */
export function expiryReminderDue(listing, now = new Date()) {
  if (!isListingActive(listing, now)) return false
  if (listing.expiry_reminded_at) return false
  const exp = toDate(listing.expires_at)
  if (!exp) return false
  return exp.getTime() - now.getTime() <= REMINDER_DAYS * DAY_MS
}

/**
 * A conversation goes read-only CONVERSATION_CLOSE_DAYS after its listing
 * goes Gone, expires, or is hidden by an admin.
 */
export function isConversationClosed(listing, now = new Date()) {
  if (!listing) return true
  let endedAt = null
  if (listing.status === "gone") endedAt = toDate(listing.gone_at) || toDate(listing.updated_at)
  else if (listing.hidden_at) endedAt = toDate(listing.hidden_at)
  else if (isExpired(listing, now)) endedAt = toDate(listing.expires_at)
  if (!endedAt) return false
  return now.getTime() >= endedAt.getTime() + CONVERSATION_CLOSE_DAYS * DAY_MS
}

/** Can a NEW conversation be started about this listing? */
export function canStartConversation(listing, viewerId, now = new Date()) {
  if (!listing || !viewerId) return false
  if (listing.member_id === viewerId) return false
  return isListingActive(listing, now)
}

/**
 * Who can read a conversation's messages: its buyer, its seller, or an
 * admin once it has been reported (decision 5) -- never an admin otherwise.
 */
export function canReadConversation(conversation, { memberId, isAdmin }) {
  if (!conversation || !memberId) return false
  if (conversation.buyer_id === memberId || conversation.seller_id === memberId) return true
  return !!isAdmin && !!conversation.reported_at
}

export function isParty(conversation, memberId) {
  return !!conversation && !!memberId &&
    (conversation.buyer_id === memberId || conversation.seller_id === memberId)
}

export function otherPartyId(conversation, memberId) {
  if (!isParty(conversation, memberId)) return null
  return conversation.buyer_id === memberId ? conversation.seller_id : conversation.buyer_id
}

/** Unread for this viewer = a message newer than the viewer's last read. */
export function isUnreadFor(conversation, memberId) {
  if (!isParty(conversation, memberId)) return false
  const lastRead = toDate(conversation.buyer_id === memberId ? conversation.buyer_last_read_at : conversation.seller_last_read_at)
  const lastMsg = toDate(conversation.last_message_at)
  if (!lastMsg) return false
  if (conversation.last_sender_id && conversation.last_sender_id === memberId) return false
  return !lastRead || lastMsg.getTime() > lastRead.getTime()
}

export function priceLabel(listing) {
  if (!listing) return ""
  if (listing.type === "free") return "Free"
  if (listing.type === "wanted") return "Wanted"
  if (listing.price_is_offers) return "Offers"
  const n = Number(listing.price_dollars)
  return Number.isFinite(n) ? `$${n.toLocaleString("en-AU")}` : ""
}

/** Status words -- a Wanted post that's sorted reads "Found", not "Gone". */
export function statusLabel(type, status) {
  if (status === "gone") return type === "wanted" ? "Found" : "Gone"
  if (status === "reserved") return "Reserved"
  return "Available"
}

export function contactButtonLabel(type) {
  return type === "wanted" ? "I have one" : "Message seller"
}

/**
 * Validate + normalise a create/edit payload. `partial` = an edit, where
 * omitted fields stay as they were (but whatever IS sent must be valid, and
 * the type/price combination is checked against `existing`).
 * Returns { error } or { value }.
 */
export function validateListing(input, { partial = false, existing = null } = {}) {
  const v = {}
  const has = k => input && Object.prototype.hasOwnProperty.call(input, k)

  if (!partial || has("type")) {
    if (!TYPES.includes(input?.type)) return { error: "Choose For sale, Free or Wanted." }
    v.type = input.type
  }
  if (!partial || has("title")) {
    const t = typeof input?.title === "string" ? input.title.trim() : ""
    if (!t) return { error: "Give it a title." }
    if (t.length > MAX_TITLE) return { error: `Keep the title to ${MAX_TITLE} characters.` }
    v.title = t
  }
  if (!partial || has("description")) {
    const d = typeof input?.description === "string" ? input.description.trim() : ""
    if (d.length > MAX_DESCRIPTION) return { error: `Keep the description to ${MAX_DESCRIPTION} characters.` }
    v.description = d || null
  }
  if (!partial || has("category")) {
    if (!CATEGORIES.includes(input?.category)) return { error: "Choose a category." }
    v.category = input.category
  }
  if (!partial || has("condition")) {
    const c = input?.condition || null
    if (c !== null && !CONDITIONS.includes(c)) return { error: "Choose a valid condition." }
    v.condition = c
  }

  const type = v.type || existing?.type
  const touchesPrice = !partial || has("type") || has("price_dollars") || has("price_is_offers")
  if (touchesPrice) {
    if (type === "sale") {
      const offers = has("price_is_offers") ? !!input.price_is_offers : (partial ? !!existing?.price_is_offers : false)
      const rawPrice = has("price_dollars") ? input.price_dollars : (partial ? existing?.price_dollars : null)
      if (offers) {
        v.price_is_offers = true
        v.price_dollars = null
      } else {
        if (rawPrice === null || rawPrice === undefined || rawPrice === "") return { error: "Enter a price in whole dollars, or choose Offers." }
        const n = Number(rawPrice)
        if (!Number.isInteger(n) || n < 0 || n > MAX_PRICE) return { error: "Price must be whole dollars (no cents)." }
        v.price_is_offers = false
        v.price_dollars = n
      }
    } else {
      v.price_is_offers = false
      v.price_dollars = null
    }
  }

  return { value: v }
}

export function validateMessage(body) {
  const b = typeof body === "string" ? body.trim() : ""
  if (!b) return { error: "Write a message first." }
  if (b.length > MAX_MESSAGE) return { error: `Keep messages to ${MAX_MESSAGE} characters.` }
  return { value: b }
}

/**
 * Does this member need to see the one-time privacy note before posting or
 * messaging? Only Private (hide_name) residents who haven't acknowledged it.
 */
export function needsPrivacyAck(member) {
  return !!member?.hide_name && !member?.swap_privacy_ack_at
}

/** Display name in Swap & Sell -- privacy deliberately ignored (decision 4). */
export function swapName(member) {
  if (!member) return "Resident"
  return member.display_name || member.name || "Resident"
}

// ── Notification wording ────────────────────────────────────────────────────
export function newListingMessage(listing, sellerName) {
  const what = TYPE_LABELS[listing?.type] || "New"
  const price = listing?.type === "sale" ? ` (${priceLabel(listing)})` : ""
  if (listing?.type === "wanted") return `🔄 Swap & Sell — ${sellerName || "A resident"} is looking for: ${listing.title}`
  return `🔄 Swap & Sell — ${what}: ${listing?.title || "an item"}${price}`
}

export function messageNotification(listing, senderName) {
  return `💬 ${senderName || "A resident"} sent you a message about "${listing?.title || "your listing"}"`
}

export function goneNotification(listing) {
  const word = listing?.type === "wanted" ? "has been found" : "is no longer available"
  return `"${listing?.title || "An item"}" ${word}.`
}

// States the actual Sydney date it comes down. The daily cron fires with
// anywhere between 2 and 3 days left, so "in 3 days" was usually wrong.
export function expiringNotification(listing) {
  const on = sydneyShortDate(listing?.expires_at)
  return `⏳ Your Swap & Sell listing "${listing?.title || "item"}" comes down ${on ? `on ${on}` : "soon"}. Open My Listings and tap Keep it listed to keep it up.`
}

export function reportNotification(kind) {
  return kind === "conversation"
    ? "🚩 A Swap & Sell conversation has been reported. Review it in Manage Swap & Sell."
    : "🚩 A Swap & Sell listing has been reported. Review it in Manage Swap & Sell."
}

/** Filter + search for Browse (client side, over the active list). */
export function filterListings(listings, { type = "all", category = "all", query = "" } = {}) {
  const q = (query || "").trim().toLowerCase()
  return (listings || []).filter(l => {
    if (type !== "all" && l.type !== type) return false
    if (category !== "all" && l.category !== category) return false
    if (q.length >= 2) {
      const hay = `${l.title || ""} ${l.description || ""}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

/** Whole Sydney calendar days between two 'YYYY-MM-DD' strings (b - a). */
function sydneyDayDiff(a, b) {
  const [ay, am, ad] = a.split("-").map(Number)
  const [by, bm, bd] = b.split("-").map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS)
}

/**
 * "Listed today / yesterday / N days ago" by Sydney CALENDAR day, not
 * elapsed 24-hour blocks -- listed 11pm yesterday and viewed 7am today is
 * "yesterday", not "today" (fixed 2026-10-09).
 */
export function daysListedLabel(createdAt, now = new Date()) {
  const c = toDate(createdAt)
  if (!c) return ""
  const days = sydneyDayDiff(isoToSydneyDateStr(c.toISOString()), sydneyTodayStr(now))
  if (days <= 0) return "Listed today"
  if (days === 1) return "Listed yesterday"
  return `Listed ${days} days ago`
}

/** Sydney date as "Sat 12 Oct" -- for when a listing comes down. */
export function sydneyShortDate(v) {
  const d = toDate(v)
  if (!d) return ""
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Sydney" }).replace(",", "")
}
