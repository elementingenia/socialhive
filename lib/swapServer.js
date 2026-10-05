// lib/swapServer.js — Swap & Sell server helpers (DB access). Pure decisions
// live in lib/swap.js; this file only fetches and hands rows to them.
import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { notify } from "@/lib/notify"
import { isSwapLive, canUseSwap, isValidListingCap, DEFAULT_LISTING_CAP, HUB_TYPE } from "@/lib/swap"

const MEMBER_COLS = "id, name, display_name, hide_name, is_admin, is_test, status, swap_privacy_ack_at"

export async function getSwapSettings() {
  const { data } = await supa.from("hub_settings")
    .select("hub_type, enabled, production_enabled, swap_listing_cap")
    .eq("hub_type", HUB_TYPE).maybeSingle()
  const cap = isValidListingCap(data?.swap_listing_cap) ? Number(data.swap_listing_cap) : DEFAULT_LISTING_CAP
  return { row: data || null, live: isSwapLive(data), cap }
}

/**
 * Resolve the caller from the bearer token and check they may use Swap &
 * Sell (live in this deployment, or an admin trialling it). Returns
 * { member, settings, blocked } or { error, status }.
 */
export async function requireSwapMember(req) {
  const token = (req.headers.get("authorization") || req.headers.get("Authorization") || "").replace("Bearer ", "")
  if (!token) return { error: "Please sign in", status: 401 }
  const { data: { user }, error: ue } = await supa.auth.getUser(token)
  if (ue || !user) return { error: "Please sign in", status: 401 }
  const { data: member } = await supa.from("members").select(MEMBER_COLS).eq("auth_id", user.id).maybeSingle()
  if (!member || member.status !== "active") return { error: "Member not found", status: 403 }
  const settings = await getSwapSettings()
  if (!canUseSwap({ live: settings.live, isAdmin: member.is_admin })) {
    return { error: "Swap & Sell isn't available yet", status: 403 }
  }
  const { data: block } = await supa.from("swap_blocks").select("member_id").eq("member_id", member.id).maybeSingle()
  return { member, settings, blocked: !!block }
}

export async function requireSwapAdmin(req) {
  const ctx = await requireSwapMember(req)
  if (ctx.error) return ctx
  if (!ctx.member.is_admin) return { error: "Admins only", status: 403 }
  return ctx
}

/** id -> member row, for naming sellers/buyers. */
export async function membersById(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))]
  if (!unique.length) return {}
  const { data } = await supa.from("members").select("id, name, display_name, is_test").in("id", unique)
  return Object.fromEntries((data || []).map(m => [m.id, m]))
}

export async function notifyAdmins(type, message, url) {
  const { data: admins } = await supa.from("members")
    .select("id").eq("is_admin", true).eq("status", "active").eq("is_test", false)
  await Promise.all((admins || []).map(a => notify(a.id, null, type, message, url)))
}

/** Everyone who Joined Swap & Sell, minus the poster and test accounts. */
export async function notifySwapFollowers(type, message, url, excludeMemberId) {
  const { data } = await supa.from("hub_followers").select("member_id, members(status, is_test)").eq("hub_type", HUB_TYPE)
  const ids = (data || [])
    .filter(r => r.member_id !== excludeMemberId && r.members?.status === "active" && !r.members?.is_test)
    .map(r => r.member_id)
  await Promise.all(ids.map(id => notify(id, null, type, message, url)))
  return ids.length
}

export const LISTING_COLS =
  "id, member_id, type, title, description, price_dollars, price_is_offers, category, condition, status, main_photo_id, expires_at, expiry_reminded_at, gone_at, hidden_at, created_at, updated_at"

/** Attach photos (ordered, main first) to listing rows. */
export async function withPhotos(listings) {
  const ids = (listings || []).map(l => l.id)
  if (!ids.length) return []
  const { data: photos } = await supa.from("swap_listing_photos")
    .select("id, listing_id, url, position").in("listing_id", ids).order("position")
  const byListing = {}
  for (const p of photos || []) (byListing[p.listing_id] ||= []).push(p)
  return listings.map(l => {
    const list = byListing[l.id] || []
    const main = list.find(p => p.id === l.main_photo_id) || list[0] || null
    const ordered = main ? [main, ...list.filter(p => p.id !== main.id)] : list
    return { ...l, photos: ordered.map(p => ({ id: p.id, url: p.url })), main_photo_url: main?.url || null }
  })
}
