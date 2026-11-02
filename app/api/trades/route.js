// Recommend a Trade (Iain, 2026-11-03,
// Element_Happenings_Recommend_a_Trade_Scope_Answered).
//
// GET  /api/trades  -- the switch, the trade-type list, and per-trade
//                      details + recommendations for Info > Contacts > Trades.
// POST /api/trades  -- { action, ... }:
//   check     -- is this trade already listed?
//   add       -- add a trade (caller becomes the locked original recommender)
//   recommend -- "I recommend them too" (+ optional note)
//   withdraw  -- remove my own recommendation (never the original's)
//   edit      -- change a trade's details (original recommender or admin)
//   mode      -- admin: Off / Admins / Everyone
//   type_add / type_rename / type_active -- admin: the trade-type list
//
// Private residents can't add or recommend (Iain: Private residents don't
// get a voice here). All rules in lib/trades.js.
import { NextResponse } from "next/server"
import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { notify } from "@/lib/notify"
import { getAdminIds } from "@/lib/questionRouting"
import { resolveMemberName } from "@/lib/memberName"
import {
  TRADES_HUB_TYPE, TRADE_MODES, TRADE_NOTE_MAX, TRADE_TYPE_MAX, PRIVATE_NOTICE,
  canUseTrades, cleanText, validateTrade, findDuplicateTrade, visibleRecommendations,
  tradePermissions, unlistedTradeTypes, tradeAddedMessage,
} from "@/lib/trades"
import {
  loadTradesMode, tradesCategoryId, tradesViewer, loadTradeContacts,
  loadRecommendations, membersById, loadTradeTypes,
} from "@/lib/tradesServer"

export const dynamic = "force-dynamic"

const json = (body, status = 200) => NextResponse.json(body, { status })

export async function GET(req) {
  const v = await tradesViewer(req)
  if (v.error) return json({ error: v.error }, v.status)
  const { me } = v
  const isAdmin = !!me.is_admin
  const mode = await loadTradesMode()
  const canUse = canUseTrades(mode, { isAdmin })
  const catId = await tradesCategoryId()
  const trades = await loadTradeContacts(catId, { includeHidden: isAdmin })
  const types = await loadTradeTypes({ includeHidden: isAdmin })

  const out = {}
  const recs = canUse ? await loadRecommendations(trades.map(t => t.id)) : []
  const people = await membersById(recs.map(r => r.member_id))
  for (const t of trades) {
    const all = recs.filter(r => r.contact_id === t.id)
    const shown = visibleRecommendations(all, people)
    const perms = tradePermissions({ recs: all, meId: me.id, isAdmin, addedBy: t.added_by })
    out[t.id] = {
      trade_type: t.trade_type || null,
      business_name: t.business_name || null,
      added_by_resident: !!t.added_by,
      ...(canUse ? {
        recommendations: shown.map(r => ({
          member_id: r.member_id,
          name: r.member_id === me.id ? "You" : resolveMemberName(people[r.member_id], { viewerId: me.id, canManage: isAdmin }),
          note: r.note || null,
          is_original: r.is_original,
        })),
        count: shown.length,
        mine: perms.mine ? { note: perms.mine.note || null, is_original: perms.mine.is_original } : null,
        canEdit: perms.canEdit,
        canWithdraw: perms.canWithdraw,
      } : {}),
    }
  }

  return json({
    mode, canUse, isAdmin, isPrivate: !!me.hide_name,
    categoryId: catId,
    types: types.map(t => ({ id: t.id, name: t.name, active: t.active })),
    unlisted: isAdmin ? unlistedTradeTypes(trades, types.filter(t => t.active)) : [],
    trades: out,
  })
}

export async function POST(req) {
  const v = await tradesViewer(req)
  if (v.error) return json({ error: v.error }, v.status)
  const { me } = v
  const isAdmin = !!me.is_admin
  const body = await req.json().catch(() => ({}))
  const action = body.action

  // ── Admin settings ───────────────────────────────────────────────────────
  if (["mode", "type_add", "type_rename", "type_active"].includes(action)) {
    if (!isAdmin) return json({ error: "Admins only" }, 403)
    if (action === "mode") {
      if (!TRADE_MODES.includes(body.mode)) return json({ error: "mode must be off, admins or everyone" }, 400)
      const { error } = await supa.from("hub_settings")
        .upsert({ hub_type: TRADES_HUB_TYPE, trades_mode: body.mode, updated_at: new Date().toISOString(), updated_by: me.id }, { onConflict: "hub_type" })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, mode: body.mode })
    }
    if (action === "type_add") {
      const name = cleanText(body.name, TRADE_TYPE_MAX)
      if (!name) return json({ error: "Enter a name" }, 400)
      const { data: existing } = await supa.from("trade_types").select("id, active").ilike("name", name).maybeSingle()
      if (existing) {
        if (!existing.active) await supa.from("trade_types").update({ active: true }).eq("id", existing.id)
        return json({ ok: true })
      }
      const { error } = await supa.from("trade_types").insert({ name })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }
    if (action === "type_rename") {
      const name = cleanText(body.name, TRADE_TYPE_MAX)
      if (!name || !body.id) return json({ error: "Enter a name" }, 400)
      const { data: row } = await supa.from("trade_types").select("id, name").eq("id", body.id).maybeSingle()
      if (!row) return json({ error: "Not found" }, 404)
      const { data: clash } = await supa.from("trade_types").select("id").ilike("name", name).neq("id", row.id).maybeSingle()
      if (clash) return json({ error: `"${name}" is already on the list` }, 409)
      const { error } = await supa.from("trade_types").update({ name }).eq("id", row.id)
      if (error) return json({ error: error.message }, 500)
      // Trades are stored by type name, so they move with the rename.
      await supa.from("contacts").update({ trade_type: name, title: name }).ilike("trade_type", row.name)
      return json({ ok: true })
    }
    if (action === "type_active") {
      if (!body.id) return json({ error: "id required" }, 400)
      const { error } = await supa.from("trade_types").update({ active: !!body.active }).eq("id", body.id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }
  }

  // ── Resident actions ─────────────────────────────────────────────────────
  const mode = await loadTradesMode()
  if (!canUseTrades(mode, { isAdmin })) return json({ error: "Recommending trades isn't open yet" }, 403)
  const catId = await tradesCategoryId()
  if (!catId) return json({ error: "The Trades contact category is missing — ask an admin" }, 500)
  const isPrivate = !!me.hide_name

  if (action === "check") {
    const trades = await loadTradeContacts(catId)
    const dup = findDuplicateTrade(trades, body)
    return json({ duplicate: dup ? { id: dup.id, name: dup.name, trade_type: dup.trade_type } : null })
  }

  if (action === "add") {
    if (isPrivate) return json({ error: PRIVATE_NOTICE, private: true }, 403)
    const { ok, errors, value } = validateTrade(body)
    if (!ok) return json({ error: Object.values(errors)[0], errors }, 400)
    const trades = await loadTradeContacts(catId, { includeHidden: true })
    const dup = findDuplicateTrade(trades, value)
    if (dup) return json({ error: "That trade is already listed", duplicate: { id: dup.id, name: dup.name } }, 409)
    const { data: contact, error } = await supa.from("contacts").insert({
      name: value.name, title: value.trade_type, phone: value.phone, email: value.email,
      trade_type: value.trade_type, business_name: value.business_name, added_by: me.id, active: true,
    }).select("id").single()
    if (error) return json({ error: error.message }, 500)
    const { error: le } = await supa.from("contact_category_members").insert({ contact_id: contact.id, category_id: catId })
    const { error: re } = le ? { error: null } : await supa.from("trade_recommendations")
      .insert({ contact_id: contact.id, member_id: me.id, is_original: true, note: value.note })
    if (le || re) {
      await supa.from("contacts").delete().eq("id", contact.id)
      return json({ error: (le || re).message }, 500)
    }
    // Q7: admins only, so a bad entry is spotted quickly.
    const message = tradeAddedMessage({ ...value, by: resolveMemberName(me, { canManage: true }) })
    for (const id of (await getAdminIds()).filter(id => id !== me.id)) {
      await notify(id, null, "trade_added", message, "/info/contacts?cat=trades").catch(() => {})
    }
    return json({ ok: true, id: contact.id })
  }

  if (!body.contact_id) return json({ error: "contact_id required" }, 400)
  const trades = await loadTradeContacts(catId, { includeHidden: isAdmin })
  const trade = trades.find(t => t.id === body.contact_id)
  if (!trade) return json({ error: "Trade not found" }, 404)

  if (action === "recommend") {
    if (isPrivate) return json({ error: PRIVATE_NOTICE, private: true }, 403)
    const note = cleanText(body.note, TRADE_NOTE_MAX) || null
    const { error } = await supa.from("trade_recommendations")
      .insert({ contact_id: trade.id, member_id: me.id, is_original: false, note })
    if (error && error.code === "23505") return json({ error: "You already recommend them" }, 409)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  if (action === "withdraw") {
    const { data: mine } = await supa.from("trade_recommendations")
      .select("id, is_original").eq("contact_id", trade.id).eq("member_id", me.id).maybeSingle()
    if (!mine) return json({ ok: true })
    if (mine.is_original) return json({ error: "You added this trade, so your recommendation stays. Ask an admin if it needs removing." }, 403)
    const { error } = await supa.from("trade_recommendations").delete().eq("id", mine.id)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  if (action === "edit") {
    const perms = tradePermissions({ meId: me.id, isAdmin, addedBy: trade.added_by })
    if (!perms.canEdit) return json({ error: "Only the person who added this trade, or an admin, can change it" }, 403)
    const { ok, errors, value } = validateTrade(body)
    if (!ok) return json({ error: Object.values(errors)[0], errors }, 400)
    const all = await loadTradeContacts(catId, { includeHidden: true })
    const dup = findDuplicateTrade(all, { ...value, excludeId: trade.id })
    if (dup) return json({ error: `That matches ${dup.name}, already listed` }, 409)
    const { error } = await supa.from("contacts").update({
      name: value.name, title: value.trade_type, phone: value.phone, email: value.email,
      trade_type: value.trade_type, business_name: value.business_name,
    }).eq("id", trade.id)
    if (error) return json({ error: error.message }, 500)
    // Editing also updates the editor's own note, if they recommend this trade.
    if (body.note !== undefined) {
      await supa.from("trade_recommendations").update({ note: value.note })
        .eq("contact_id", trade.id).eq("member_id", me.id)
    }
    return json({ ok: true })
  }

  return json({ error: "Unknown action" }, 400)
}
