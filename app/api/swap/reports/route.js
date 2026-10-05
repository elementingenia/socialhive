import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { requireSwapMember, requireSwapAdmin, membersById, notifyAdmins } from "@/lib/swapServer"
import { isParty, isListingActive, swapName, reportNotification, MAX_REPORT_REASON } from "@/lib/swap"

export const dynamic = "force-dynamic"

// POST { listing_id } or { conversation_id }, optional { reason } -- any
// resident can report a listing they can see; only the two people in a
// conversation can report it. Reporting a conversation is what lets admins
// read it (decision 5).
export async function POST(req) {
  const ctx = await requireSwapMember(req)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { member } = ctx
  const { listing_id, conversation_id, reason } = await req.json().catch(() => ({}))
  const why = typeof reason === "string" ? reason.trim().slice(0, MAX_REPORT_REASON) : ""

  if (conversation_id) {
    const { data: convo } = await supa.from("swap_conversations").select("id, buyer_id, seller_id, listing_id, reported_at").eq("id", conversation_id).maybeSingle()
    if (!convo || !isParty(convo, member.id)) return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
    const { error } = await supa.from("swap_reports").insert({ conversation_id: convo.id, listing_id: convo.listing_id, reporter_id: member.id, reason: why || null })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!convo.reported_at) await supa.from("swap_conversations").update({ reported_at: new Date().toISOString() }).eq("id", convo.id)
    await notifyAdmins("swap_report", reportNotification("conversation"), "/swap/manage")
    return NextResponse.json({ ok: true })
  }

  if (listing_id) {
    const { data: listing } = await supa.from("swap_listings").select("id, member_id, status, hidden_at, expires_at").eq("id", listing_id).maybeSingle()
    if (!listing || (!isListingActive(listing) && listing.member_id !== member.id)) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 })
    }
    const { error } = await supa.from("swap_reports").insert({ listing_id: listing.id, reporter_id: member.id, reason: why || null })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await notifyAdmins("swap_report", reportNotification("listing"), "/swap/manage")
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "listing_id or conversation_id required" }, { status: 400 })
}

// GET -- admin: open reports (and the last 20 resolved), plus hidden
// listings so they can be put back.
export async function GET(req) {
  const ctx = await requireSwapAdmin(req)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  const [{ data: open }, { data: resolved }, { data: hidden }] = await Promise.all([
    supa.from("swap_reports").select("*").is("resolved_at", null).order("created_at", { ascending: false }),
    supa.from("swap_reports").select("*").not("resolved_at", "is", null).order("resolved_at", { ascending: false }).limit(20),
    supa.from("swap_listings").select("id, title, member_id, hidden_at").not("hidden_at", "is", null).order("hidden_at", { ascending: false }),
  ])
  const reports = [...(open || []), ...(resolved || [])]
  const listingIds = [...new Set(reports.map(r => r.listing_id).filter(Boolean))]
  const { data: listings } = listingIds.length
    ? await supa.from("swap_listings").select("id, title, member_id, hidden_at, status").in("id", listingIds)
    : { data: [] }
  const byId = Object.fromEntries((listings || []).map(l => [l.id, l]))
  const people = await membersById([
    ...reports.map(r => r.reporter_id),
    ...(listings || []).map(l => l.member_id),
    ...(hidden || []).map(l => l.member_id),
  ])

  const shape = r => {
    const l = byId[r.listing_id]
    return {
      id: r.id,
      kind: r.conversation_id ? "conversation" : "listing",
      conversation_id: r.conversation_id,
      listing_id: r.listing_id,
      listing_title: l?.title || "(removed)",
      listing_hidden: !!l?.hidden_at,
      seller_id: l?.member_id || null,
      seller_name: l ? swapName(people[l.member_id]) : null,
      reporter_name: swapName(people[r.reporter_id]),
      reason: r.reason,
      created_at: r.created_at,
      resolved_at: r.resolved_at,
    }
  }
  return NextResponse.json({
    open: (open || []).map(shape),
    resolved: (resolved || []).map(shape),
    hidden: (hidden || []).map(l => ({ id: l.id, title: l.title, seller_name: swapName(people[l.member_id]), hidden_at: l.hidden_at })),
  })
}

// PATCH { id } -- admin: mark a report dealt with.
export async function PATCH(req) {
  const ctx = await requireSwapAdmin(req)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const { error } = await supa.from("swap_reports")
    .update({ resolved_at: new Date().toISOString(), resolved_by: ctx.member.id }).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
