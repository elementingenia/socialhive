// Recommend a Trade -- server helpers (service role). Rules live in
// lib/trades.js; this file only loads and saves.
import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { TRADES_HUB_TYPE, isTradesCategory, normaliseMode } from "@/lib/trades"

export async function loadTradesMode() {
  const { data } = await supa.from("hub_settings").select("trades_mode").eq("hub_type", TRADES_HUB_TYPE).maybeSingle()
  return normaliseMode(data?.trades_mode)
}

export async function tradesCategoryId() {
  const { data } = await supa.from("contact_categories").select("id, name").eq("active", true)
  return (data || []).find(c => isTradesCategory(c.name))?.id || null
}

// The caller, with the fields this feature needs (Private, admin).
export async function tradesViewer(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "")
  if (!token) return { error: "Unauthenticated", status: 401 }
  const { data: { user }, error } = await supa.auth.getUser(token)
  if (error || !user) return { error: "Unauthenticated", status: 401 }
  const { data: me } = await supa.from("members")
    .select("id, name, display_name, hide_name, is_admin, is_test").eq("auth_id", user.id).maybeSingle()
  if (!me) return { error: "Member not found", status: 403 }
  return { me }
}

// Every contact in the Trades category. includeHidden for admins.
export async function loadTradeContacts(categoryId, { includeHidden = false } = {}) {
  if (!categoryId) return []
  const { data: links } = await supa.from("contact_category_members").select("contact_id").eq("category_id", categoryId)
  const ids = (links || []).map(l => l.contact_id)
  if (!ids.length) return []
  let q = supa.from("contacts")
    .select("id, name, title, phone, email, active, member_id, trade_type, business_name, added_by")
    .in("id", ids).is("member_id", null)
  if (!includeHidden) q = q.eq("active", true)
  const { data } = await q
  return data || []
}

export async function loadRecommendations(contactIds) {
  if (!contactIds.length) return []
  const { data } = await supa.from("trade_recommendations")
    .select("id, contact_id, member_id, is_original, note, created_at").in("contact_id", contactIds)
  return data || []
}

export async function membersById(ids) {
  const uniq = [...new Set(ids.filter(Boolean))]
  if (!uniq.length) return {}
  const { data } = await supa.from("members")
    .select("id, name, display_name, hide_name, is_test, status").in("id", uniq)
  return Object.fromEntries((data || []).map(m => [m.id, m]))
}

export async function loadTradeTypes({ includeHidden = false } = {}) {
  let q = supa.from("trade_types").select("id, name, active").order("name")
  if (!includeHidden) q = q.eq("active", true)
  const { data } = await q
  return data || []
}
