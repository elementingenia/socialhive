import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notify } from "@/lib/notify"
import { resolveMemberName } from "@/lib/memberName"
import {
  STATUS, THRESHOLD_SETTING_KEY, normaliseText, validateProposal, duplicateMessage,
  parseThreshold, visibleToResident, daysLeft, shouldAlertThreshold,
  newProposalMessage, thresholdReachedMessage,
} from "@/lib/groupProposals"

// Resident side of Propose a group / club (backlog B1, migration 126).
//   GET    -> live proposals (+ my own pending ones), counts, threshold
//   POST   {name, description} -> propose (pending until an admin approves)
//   PATCH  {id, action: "join"|"leave"|"withdraw"}
// group_proposals tables are service-role only (RLS, no policies), so every
// access goes through here or app/api/admin/group-proposals.
export const dynamic = "force-dynamic"

async function getMember(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "")
  if (!token) return null
  const { data: { user } } = await supa.auth.getUser(token)
  if (!user) return null
  const { data } = await supa.from("members").select("id, is_admin, status").eq("auth_id", user.id).single()
  return data?.status === "active" ? data : null
}

async function getThreshold() {
  const { data } = await supa.from("settings").select("value").eq("key", THRESHOLD_SETTING_KEY).maybeSingle()
  return parseThreshold(data?.value)
}

async function activeAdminIds() {
  const { data } = await supa.from("members").select("id")
    .eq("is_admin", true).eq("status", "active").eq("is_test", false)
  return (data || []).map(a => a.id)
}

async function supporterCount(proposalId) {
  const { count } = await supa.from("group_proposal_supporters")
    .select("member_id", { count: "exact", head: true }).eq("proposal_id", proposalId)
  return count || 0
}

export async function GET(req) {
  const me = await getMember(req)
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [threshold, { data: rows, error }] = await Promise.all([
    getThreshold(),
    supa.from("group_proposals")
      .select("id, name, description, proposed_by, status, live_at, created_at")
      .in("status", [STATUS.PENDING, STATUS.LIVE]),
  ])
  if (error) return NextResponse.json({ error: "Could not load proposals." }, { status: 500 })

  const now = new Date()
  const shown = (rows || []).filter(p => visibleToResident(p, me.id, now))
  const ids = shown.map(p => p.id)
  const proposerIds = [...new Set(shown.map(p => p.proposed_by).filter(Boolean))]

  const [{ data: links }, { data: people }] = await Promise.all([
    ids.length ? supa.from("group_proposal_supporters").select("proposal_id, member_id").in("proposal_id", ids) : { data: [] },
    proposerIds.length ? supa.from("members").select("id, name, display_name, hide_name").in("id", proposerIds) : { data: [] },
  ])
  const byId = Object.fromEntries((people || []).map(p => [p.id, p]))

  const proposals = shown.map(p => {
    const mine = (links || []).filter(l => l.proposal_id === p.id)
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      proposedBy: resolveMemberName(byId[p.proposed_by] || null, { viewerId: me.id, selfLabel: "You", canManage: me.is_admin }),
      isMine: p.proposed_by === me.id,
      count: mine.length,
      joined: mine.some(l => l.member_id === me.id),
      daysLeft: p.status === STATUS.LIVE ? daysLeft(p, now) : null,
      createdAt: p.created_at,
    }
  }).sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === STATUS.PENDING ? -1 : 1))

  return NextResponse.json({ threshold, proposals })
}

export async function POST(req) {
  const me = await getMember(req)
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const err = validateProposal(body)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  const name = normaliseText(body.name)
  const description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null

  const [{ data: clubs }, { data: open }] = await Promise.all([
    supa.from("clubs").select("name").eq("archived", false),
    supa.from("group_proposals").select("id, name, status, live_at").in("status", [STATUS.PENDING, STATUS.LIVE]),
  ])
  const dup = duplicateMessage(name, clubs || [], open || [])
  if (dup) return NextResponse.json({ error: dup }, { status: 409 })

  const { data: created, error } = await supa.from("group_proposals")
    .insert({ name, description, proposed_by: me.id, status: STATUS.PENDING })
    .select("id").single()
  if (error) return NextResponse.json({ error: "Could not send your proposal." }, { status: 500 })

  // The proposer is the first "I'd join".
  await supa.from("group_proposal_supporters").insert({ proposal_id: created.id, member_id: me.id })

  for (const adminId of await activeAdminIds()) {
    await notify(adminId, null, "group_proposal_review", newProposalMessage(name), "/admin?tab=Proposals", me.id)
  }
  return NextResponse.json({ ok: true, id: created.id })
}

export async function PATCH(req) {
  const me = await getMember(req)
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, action } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: "Missing proposal." }, { status: 400 })

  const { data: p } = await supa.from("group_proposals")
    .select("id, name, proposed_by, status, live_at, threshold_alerted_at").eq("id", id).maybeSingle()
  if (!p) return NextResponse.json({ error: "That proposal no longer exists." }, { status: 404 })
  const now = new Date()

  if (action === "withdraw") {
    if (p.proposed_by !== me.id) return NextResponse.json({ error: "Only the person who proposed it can withdraw it." }, { status: 403 })
    if (p.status !== STATUS.PENDING && p.status !== STATUS.LIVE) {
      return NextResponse.json({ error: "This proposal is already closed." }, { status: 409 })
    }
    await supa.from("group_proposals").update({ status: STATUS.WITHDRAWN }).eq("id", p.id)
    return NextResponse.json({ ok: true })
  }

  if (action !== "join" && action !== "leave") return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  if (!visibleToResident(p, me.id, now) || p.status !== STATUS.LIVE) {
    return NextResponse.json({ error: "This proposal isn't open for sign-ups." }, { status: 409 })
  }

  if (action === "leave") {
    await supa.from("group_proposal_supporters").delete().eq("proposal_id", p.id).eq("member_id", me.id)
    return NextResponse.json({ ok: true, count: await supporterCount(p.id) })
  }

  // join -- the primary key makes a second tap a no-op (decision 1: one per resident).
  const { error } = await supa.from("group_proposal_supporters")
    .upsert({ proposal_id: p.id, member_id: me.id }, { onConflict: "proposal_id,member_id", ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: "Could not record that." }, { status: 500 })

  const count = await supporterCount(p.id)
  const threshold = await getThreshold()
  if (shouldAlertThreshold(p, count, threshold, now)) {
    // Stamp first (only if still unstamped) so two simultaneous taps can't
    // both send the alert.
    const { data: stamped } = await supa.from("group_proposals")
      .update({ threshold_alerted_at: now.toISOString() })
      .eq("id", p.id).is("threshold_alerted_at", null).select("id")
    if (stamped?.length) {
      for (const adminId of await activeAdminIds()) {
        await notify(adminId, null, "group_proposal_ready", thresholdReachedMessage(p.name, count), "/admin?tab=Proposals")
      }
    }
  }
  return NextResponse.json({ ok: true, count })
}
