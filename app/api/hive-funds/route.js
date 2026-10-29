// app/api/hive-funds/route.js
//
// Hive Funds ledger (Iain, 2026-10-23, Element_Happenings_Hive_Funds_
// Transparency_Scope_Answered). All sums live in lib/hiveFunds.js; this
// route only loads the rows, checks permissions and writes.
//
// The three tables (migration 141) are service-role only, so every read and
// write comes through here.
//
// GET  ?fund=social              -> whole fund: summary, events, between lines
// POST { action, fund, ... }     -> set_audience | set_opening | add_line |
//                                   update_line | delete_line | set_adjustment |
//                                   finalise | reopen | sign_receipt

import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { resolveMember, isAreaOwner } from "@/lib/areaAuth"
import {
  FUNDS, isValidAudience, canSeeFund, canEditEvent, canManageFund, eventFigures,
  eventCounts, openingLine, betweenLines, fundSummary, eventCarry,
  openingFromCashCount, parseAmount, eventMoney,
} from "@/lib/hiveFunds"
import { sydneyTodayStr } from "@/lib/date"
import { resolveContentType } from "@/lib/mimeFallback"
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_MB } from "@/lib/attachmentLimits"

export const dynamic = "force-dynamic"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const json = (body, status = 200) => Response.json(body, { status })

// Who is this person, relative to this fund?
async function rolesFor(member, fund) {
  const isAdmin = !!member.is_admin
  const isOwner = await isAreaOwner(member.id, fund.ownerContext.type, fund.ownerContext.key)
  const { data: ecRows } = await supa.from("event_coordinators")
    .select("event_id, events!inner(hub_type, club_id)")
    .eq("member_id", member.id).is("replaced_at", null)
    .eq("events.hub_type", fund.hubType)
  const ecEventIds = new Set((ecRows || []).filter(r => !r.events?.club_id).map(r => r.event_id))
  return { isAdmin, isOwner, isEC: ecEventIds.size > 0, ecEventIds }
}

async function loadFundRow(fundKey) {
  const { data, error } = await supa.from("hive_funds").select("fund_key, audience").eq("fund_key", fundKey).maybeSingle()
  if (error) return { error: error.message }
  return { row: data }
}

// Every row the sums need. openingOverride lets set_opening work out the
// in-progress money for a starting balance that hasn't been saved yet.
async function loadState(fund, openingOverride = null) {
  const { data: lineRows, error: lErr } = await supa.from("hive_ledger")
    .select("id, kind, amount, entry_date, description, event_id, receipt_url, receipt_file_name, created_at, created_by, updated_at, creator:members!created_by(name, display_name)")
    .eq("fund_key", fund.key).is("deleted_at", null)
  if (lErr) return { error: lErr.message }
  const lines = lineRows || []
  const opening = openingOverride || openingLine(lines)
  if (!opening) return { lines, opening: null, items: [] }

  const { data: evRows, error: eErr } = await supa.from("events")
    .select("id, title, event_date, event_time, cost, payment_required, archived, has_bus, bus_driver_id, bus_driver_free")
    .eq("hub_type", fund.hubType).is("club_id", null)
    .gte("event_date", opening.entry_date)
    .order("event_date", { ascending: true })
  if (eErr) return { error: eErr.message }
  const events = (evRows || []).filter(e => eventCounts(e, opening))
  const ids = events.map(e => e.id)

  let bookings = [], finance = []
  if (ids.length) {
    const [bRes, fRes] = await Promise.all([
      supa.from("bookings").select("event_id, member_id, status, seats, payment_status, amount_paid, refund_due, refund_paid_at").in("event_id", ids),
      supa.from("hive_event_finance").select("*").in("event_id", ids),
    ])
    if (bRes.error) return { error: bRes.error.message }
    if (fRes.error) return { error: fRes.error.message }
    bookings = bRes.data || []
    finance = fRes.data || []
  }
  const bByEvent = {}
  for (const b of bookings) (bByEvent[b.event_id] ||= []).push(b)
  const fByEvent = Object.fromEntries(finance.map(f => [f.event_id, f]))
  const lineEventIds = new Set(lines.filter(l => l.event_id).map(l => l.event_id))

  const items = []
  for (const event of events) {
    const figures = eventFigures({ event, bookings: bByEvent[event.id] || [], lines, finance: fByEvent[event.id] || null })
    // A cancelled (archived) event only stays on the books if money moved.
    if (event.archived && !lineEventIds.has(event.id) && !fByEvent[event.id] && !figures.liveCollected && !figures.refundsOwed) continue
    items.push({ event, figures, finance: fByEvent[event.id] || null })
  }
  return { lines, opening, items }
}

function publicLine(l, showNames) {
  const out = {
    id: l.id, kind: l.kind, amount: Number(l.amount), entry_date: l.entry_date,
    description: l.description, event_id: l.event_id,
    receipt_url: l.receipt_url, receipt_file_name: l.receipt_file_name,
  }
  if (showNames) out.entered_by = l.creator?.display_name || l.creator?.name || null
  return out
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const fund = FUNDS[searchParams.get("fund") || "social"]
  if (!fund) return json({ error: "Unknown fund" }, 400)

  const { error, status, member } = await resolveMember(req)
  if (error) return json({ error }, status)

  const { row, error: fErr } = await loadFundRow(fund.key)
  // Migration 141 not run yet: behave as switched off, never 500 the page.
  if (fErr || !row) return json({ visible: false, ready: false })

  const roles = await rolesFor(member, fund)
  const visible = canSeeFund(row.audience, roles)
  const base = { fund: fund.key, label: fund.label, ready: true, audience: roles.isAdmin ? row.audience : undefined }
  if (!visible) return json({ ...base, visible: false })

  const state = await loadState(fund)
  if (state.error) return json({ error: state.error }, 500)
  const canManage = canManageFund(roles)
  const showNames = canManage || roles.isEC

  const events = state.items.map(({ event, figures, finance }) => ({
    id: event.id, title: event.title, event_date: event.event_date, event_time: event.event_time,
    archived: !!event.archived, payment_required: !!event.payment_required,
    ...figures,
    outgoings: figures.outgoings.map(l => publicLine(l, showNames)),
    ...eventCarry(state.lines, state.items, figures),
    reopenReason: finance?.reopened_at ? finance.reopen_reason : null,
    canEdit: !figures.finalised && canEditEvent({ ...roles, isEventEC: roles.ecEventIds.has(event.id) }),
  }))

  return json({
    ...base,
    visible: true,
    isAdmin: roles.isAdmin,
    canManage,
    canEnterAny: canManage || roles.isEC,
    opening: state.opening ? publicLine(state.opening, showNames) : null,
    summary: fundSummary(state.lines, state.items),
    events,
    between: betweenLines(state.lines)
      .sort((a, b) => String(b.entry_date).localeCompare(String(a.entry_date)))
      .map(l => publicLine(l, showNames)),
  })
}

async function loadFundEvent(fund, eventId) {
  if (!eventId) return { error: "event_id required", status: 400 }
  const { data: event } = await supa.from("events")
    .select("id, title, event_date, hub_type, club_id, cost, payment_required").eq("id", eventId).maybeSingle()
  if (!event || event.hub_type !== fund.hubType || event.club_id) return { error: "Event not in this fund", status: 404 }
  const { data: finance } = await supa.from("hive_event_finance").select("*").eq("event_id", eventId).maybeSingle()
  return { event, finance }
}

function cleanText(v, max = 300) {
  const s = String(v || "").trim()
  return s ? s.slice(0, max) : ""
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const fund = FUNDS[body.fund || "social"]
  if (!fund) return json({ error: "Unknown fund" }, 400)

  const { error, status, member } = await resolveMember(req)
  if (error) return json({ error }, status)

  const { row, error: fErr } = await loadFundRow(fund.key)
  if (fErr || !row) return json({ error: "Hive Funds isn't set up yet (migration 141)" }, 503)

  const roles = await rolesFor(member, fund)
  const now = new Date().toISOString()
  const action = body.action

  // ── Admin-only fund settings (work even while hidden) ─────────────────
  if (action === "set_audience") {
    if (!roles.isAdmin) return json({ error: "Admins only" }, 403)
    if (!isValidAudience(body.audience)) return json({ error: "Invalid audience" }, 400)
    const { error: uErr } = await supa.from("hive_funds")
      .update({ audience: body.audience, updated_at: now, updated_by: member.id }).eq("fund_key", fund.key)
    if (uErr) return json({ error: uErr.message }, 500)
    return json({ ok: true, audience: body.audience })
  }

  if (action === "set_opening") {
    if (!roles.isAdmin) return json({ error: "Admins only can declare the starting balance" }, 403)
    const entryDate = body.entry_date || sydneyTodayStr()
    if (!DATE_RE.test(entryDate)) return json({ error: "Invalid date" }, 400)
    const note = cleanText(body.note, 300)

    let amount, description
    if (body.cash_counted !== undefined && body.cash_counted !== null && body.cash_counted !== "") {
      const cash = parseAmount(body.cash_counted, { allowZero: true })
      if (cash === null) return json({ error: "Enter the cash counted as a number" }, 400)
      // Money already taken for events from this date on, and refunds still
      // owed, are counted from the booking records -- leave them out here.
      const state = await loadState(fund, { entry_date: entryDate, amount: 0, kind: "opening" })
      if (state.error) return json({ error: state.error }, 500)
      let collected = 0, refunds = 0
      for (const it of state.items) {
        if (!it.figures.finalised) collected += it.figures.collected + it.figures.adjustment
        refunds += it.figures.refundsOwed
      }
      amount = openingFromCashCount(cash, collected, refunds)
      description = `Starting balance: cash counted $${cash.toFixed(2)}` +
        (collected ? `, less $${collected.toFixed(2)} already taken for upcoming events` : "") +
        (refunds ? `, less $${refunds.toFixed(2)} refunds owed` : "") +
        (note ? ` — ${note}` : "")
    } else {
      amount = parseAmount(body.amount, { allowZero: true, allowNegative: true })
      if (amount === null) return json({ error: "Enter the starting balance as a number" }, 400)
      description = `Starting balance${note ? ` — ${note}` : ""}`
    }
    if (amount < 0) return json({ error: `That works out at ${amount.toFixed(2)} — less than nothing. Check the cash count.` }, 400)

    // Replace any existing starting balance; the old row stays on record.
    await supa.from("hive_ledger").update({ deleted_at: now, deleted_by: member.id })
      .eq("fund_key", fund.key).eq("kind", "opening").is("deleted_at", null)
    const { data, error: iErr } = await supa.from("hive_ledger").insert({
      fund_key: fund.key, kind: "opening", amount, entry_date: entryDate, description,
      created_by: member.id, updated_by: member.id,
    }).select("id, amount, entry_date, description").single()
    if (iErr) return json({ error: iErr.message }, 500)
    return json({ ok: true, opening: data })
  }

  // Everything below needs the ledger to be visible to this person.
  if (!canSeeFund(row.audience, roles)) return json({ error: "Hive Funds is not switched on for you" }, 403)
  const canManage = canManageFund(roles)

  // Can this person write a line for this event (or between events)?
  async function lineGate(eventId, kind) {
    if (!eventId) {
      if (!canManage) return { error: "Only admins and Social Owners can enter money between events", status: 403 }
      if (!["income", "expense"].includes(kind)) return { error: "Invalid type", status: 400 }
      return {}
    }
    if (kind !== "expense") return { error: "Event lines are outgoings only — use the adjustment for extra money in", status: 400 }
    const { event, finance, error: e, status: s } = await loadFundEvent(fund, eventId)
    if (e) return { error: e, status: s }
    if (!canEditEvent({ ...roles, isEventEC: roles.ecEventIds.has(eventId) })) return { error: "Only admins, Social Owners and this event's coordinators can enter its outgoings", status: 403 }
    if (finance?.finalised_at) return { error: "This event's finances are finalised", status: 409 }
    const { data: op } = await supa.from("hive_ledger").select("entry_date")
      .eq("fund_key", fund.key).eq("kind", "opening").is("deleted_at", null).maybeSingle()
    if (!op) return { error: "The starting balance hasn't been declared yet", status: 409 }
    if (String(event.event_date) < String(op.entry_date)) return { error: "This event is before the starting balance date — its money is already in the starting balance", status: 409 }
    return {}
  }

  function readLineFields() {
    const amount = parseAmount(body.amount)
    if (amount === null) return { error: "Enter an amount greater than 0" }
    const entryDate = body.entry_date || sydneyTodayStr()
    if (!DATE_RE.test(entryDate)) return { error: "Invalid date" }
    const description = cleanText(body.description, 300)
    if (!description) return { error: "Say what it was for" }
    const fields = { amount, entry_date: entryDate, description }
    if (body.receipt_url !== undefined) {
      fields.receipt_url = body.receipt_url || null
      fields.receipt_file_name = body.receipt_url ? cleanText(body.receipt_file_name, 200) || null : null
    }
    return { fields }
  }

  if (action === "add_line") {
    const eventId = body.event_id || null
    const kind = eventId ? "expense" : body.kind
    const g = await lineGate(eventId, kind)
    if (g.error) return json({ error: g.error }, g.status)
    const { fields, error: vErr } = readLineFields()
    if (vErr) return json({ error: vErr }, 400)
    const { data, error: iErr } = await supa.from("hive_ledger").insert({
      fund_key: fund.key, kind, event_id: eventId, ...fields, created_by: member.id, updated_by: member.id,
    }).select("id").single()
    if (iErr) return json({ error: iErr.message }, 500)
    return json({ ok: true, id: data.id })
  }

  if (action === "update_line" || action === "delete_line") {
    if (!body.id) return json({ error: "id required" }, 400)
    const { data: line } = await supa.from("hive_ledger").select("id, kind, event_id, fund_key, deleted_at")
      .eq("id", body.id).maybeSingle()
    if (!line || line.fund_key !== fund.key || line.deleted_at) return json({ error: "Line not found" }, 404)
    if (line.kind === "opening") return json({ error: "Change the starting balance from Declare starting balance" }, 400)
    const g = await lineGate(line.event_id, line.kind)
    if (g.error) return json({ error: g.error }, g.status)
    if (action === "delete_line") {
      const { error: dErr } = await supa.from("hive_ledger").update({ deleted_at: now, deleted_by: member.id }).eq("id", line.id)
      if (dErr) return json({ error: dErr.message }, 500)
      return json({ ok: true })
    }
    const { fields, error: vErr } = readLineFields()
    if (vErr) return json({ error: vErr }, 400)
    const { error: uErr } = await supa.from("hive_ledger").update({ ...fields, updated_by: member.id, updated_at: now }).eq("id", line.id)
    if (uErr) return json({ error: uErr.message }, 500)
    return json({ ok: true })
  }

  if (action === "set_adjustment") {
    const g = await lineGate(body.event_id, "expense")
    if (g.error) return json({ error: g.error }, g.status)
    const adjustment = body.adjustment === "" || body.adjustment == null ? 0 : parseAmount(body.adjustment, { allowNegative: true, allowZero: true })
    if (adjustment === null) return json({ error: "Enter the adjustment as a number, e.g. 40 or -15" }, 400)
    const note = cleanText(body.note, 300)
    if (adjustment !== 0 && !note) return json({ error: "Explain the adjustment" }, 400)
    const { error: uErr } = await supa.from("hive_event_finance").upsert({
      event_id: body.event_id, fund_key: fund.key, adjustment, adjustment_note: adjustment === 0 ? null : note,
      adjustment_by: member.id, adjustment_at: now, updated_at: now,
    }, { onConflict: "event_id" })
    if (uErr) return json({ error: uErr.message }, 500)
    return json({ ok: true })
  }

  if (action === "finalise") {
    if (!canManage) return json({ error: "Only admins and Social Owners can finalise" }, 403)
    const { event, finance, error: e, status: s } = await loadFundEvent(fund, body.event_id)
    if (e) return json({ error: e }, s)
    if (finance?.finalised_at) return json({ error: "Already finalised" }, 409)
    const { data: bk } = await supa.from("bookings")
      .select("status, seats, payment_status, amount_paid, refund_due, refund_paid_at").eq("event_id", event.id)
    const { collected } = eventMoney(event, bk || [])
    const { error: uErr } = await supa.from("hive_event_finance").upsert({
      event_id: event.id, fund_key: fund.key, finalised_at: now, finalised_by: member.id,
      collected_snapshot: collected, updated_at: now,
    }, { onConflict: "event_id" })
    if (uErr) return json({ error: uErr.message }, 500)
    return json({ ok: true, collected })
  }

  if (action === "reopen") {
    if (!roles.isAdmin) return json({ error: "Admins only can reopen finalised finances" }, 403)
    const reason = cleanText(body.reason, 300)
    if (!reason) return json({ error: "Give a reason for reopening" }, 400)
    const { finance, error: e, status: s } = await loadFundEvent(fund, body.event_id)
    if (e) return json({ error: e }, s)
    if (!finance?.finalised_at) return json({ error: "Not finalised" }, 409)
    const { error: uErr } = await supa.from("hive_event_finance").update({
      finalised_at: null, finalised_by: null, collected_snapshot: null,
      reopened_at: now, reopened_by: member.id, reopen_reason: reason, updated_at: now,
    }).eq("event_id", body.event_id)
    if (uErr) return json({ error: uErr.message }, 500)
    return json({ ok: true })
  }

  if (action === "sign_receipt") {
    if (!canManage && !roles.isEC) return json({ error: "Not allowed" }, 403)
    const fileName = cleanText(body.file_name, 200) || "receipt"
    const type = resolveContentType(body.content_type, fileName)
    if (!(type.startsWith("image/") || type === "application/pdf")) return json({ error: "Receipts must be a photo or PDF" }, 400)
    if (typeof body.file_size === "number" && body.file_size > MAX_ATTACHMENT_BYTES) {
      return json({ error: `Files over ${MAX_ATTACHMENT_MB}MB are not supported.` }, 400)
    }
    const ext = (fileName.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg"
    const path = `hive-receipts/${fund.key}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { data, error: sErr } = await supa.storage.from("community-docs").createSignedUploadUrl(path)
    if (sErr) return json({ error: sErr.message }, 500)
    const { data: { publicUrl } } = supa.storage.from("community-docs").getPublicUrl(data.path)
    return json({ path: data.path, token: data.token, content_type: type, public_url: publicUrl })
  }

  return json({ error: "Unknown action" }, 400)
}
