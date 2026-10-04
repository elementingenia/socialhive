import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notify } from "@/lib/notify"
import { notifyAllActiveMembers } from "@/lib/notifyAudience"
import { nextClubColour } from "@/lib/clubColours"
import {
  STATUS, THRESHOLD_SETTING_KEY, normaliseText, validateProposal, duplicateMessage,
  parseThreshold, validateThreshold, adminBucket, closedLabel, daysLeft, uniqueSlug,
  approvedMessage, declinedMessage, clubCreatedMessage, newProposalBroadcastMessage,
} from "@/lib/groupProposals"

// Admin > Group Proposals (backlog B1, migration 126). Admins only.
//   GET [?count=1] -> proposals bucketed (pending / ready / live / closed) +
//                     threshold, or just the count needing action (badge)
//   PATCH {action, id?, ...}
//     edit         {id, name, description}  -- tidy wording before/while live
//     approve      {id}                     -- pending -> live, broadcast to all residents
//     decline      {id, reason?}            -- pending/live -> declined
//     create_club  {id}                     -- live -> created: new club,
//                                              proposer = Owner, supporters joined
//     set_threshold {threshold}
export const dynamic = "force-dynamic"

async function requireAdmin(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "")
  if (!token) return null
  const { data: { user } } = await supa.auth.getUser(token)
  if (!user) return null
  const { data } = await supa.from("members").select("id, is_admin").eq("auth_id", user.id).single()
  return data?.is_admin ? data : null
}

async function getThreshold() {
  const { data } = await supa.from("settings").select("value").eq("key", THRESHOLD_SETTING_KEY).maybeSingle()
  return parseThreshold(data?.value)
}

async function supporterIds(proposalId) {
  const { data } = await supa.from("group_proposal_supporters").select("member_id").eq("proposal_id", proposalId)
  return (data || []).map(r => r.member_id)
}

export async function GET(req) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const [threshold, { data: rows, error }, { data: links }] = await Promise.all([
    getThreshold(),
    supa.from("group_proposals")
      .select("id, name, description, proposed_by, status, decline_reason, live_at, club_id, created_at, reviewed_at"),
    supa.from("group_proposal_supporters").select("proposal_id, member_id"),
  ])
  if (error) return NextResponse.json({ error: "Could not load proposals." }, { status: 500 })

  const counts = {}
  for (const l of links || []) counts[l.proposal_id] = (counts[l.proposal_id] || 0) + 1
  const now = new Date()

  if (new URL(req.url).searchParams.get("count") === "1") {
    const n = (rows || []).filter(p => ["pending", "ready"].includes(adminBucket(p, counts[p.id] || 0, threshold, now))).length
    return NextResponse.json({ actionCount: n })
  }

  const memberIds = [...new Set([
    ...(rows || []).map(p => p.proposed_by),
    ...(links || []).map(l => l.member_id),
  ].filter(Boolean))]
  const { data: people } = memberIds.length
    ? await supa.from("members").select("id, name, display_name").in("id", memberIds)
    : { data: [] }
  const nameOf = Object.fromEntries((people || []).map(p => [p.id, p.display_name || p.name]))
  const clubIds = (rows || []).map(p => p.club_id).filter(Boolean)
  const { data: clubs } = clubIds.length
    ? await supa.from("clubs").select("id, slug").in("id", clubIds)
    : { data: [] }
  const slugOf = Object.fromEntries((clubs || []).map(c => [c.id, c.slug]))

  const out = { pending: [], ready: [], live: [], closed: [] }
  for (const p of rows || []) {
    const count = counts[p.id] || 0
    const bucket = adminBucket(p, count, threshold, now)
    out[bucket].push({
      id: p.id, name: p.name, description: p.description, status: p.status,
      proposedBy: nameOf[p.proposed_by] || null,
      hasProposer: !!p.proposed_by,
      count,
      supporters: (links || []).filter(l => l.proposal_id === p.id).map(l => nameOf[l.member_id]).filter(Boolean).sort(),
      daysLeft: p.status === STATUS.LIVE ? daysLeft(p, now) : null,
      closedLabel: bucket === "closed" ? closedLabel(p, now) : null,
      declineReason: p.decline_reason || null,
      clubSlug: p.club_id ? slugOf[p.club_id] || null : null,
      createdAt: p.created_at,
      sortAt: p.reviewed_at || p.created_at,
    })
  }
  out.pending.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  out.ready.sort((a, b) => b.count - a.count)
  out.live.sort((a, b) => b.count - a.count)
  out.closed.sort((a, b) => b.sortAt.localeCompare(a.sortAt))
  return NextResponse.json({ threshold, ...out })
}

export async function PATCH(req) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { action, id } = body
  const now = new Date().toISOString()

  if (action === "set_threshold") {
    const err = validateThreshold(body.threshold)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
    const { error } = await supa.from("settings")
      .upsert({ key: THRESHOLD_SETTING_KEY, value: String(Number(body.threshold)), updated_at: now }, { onConflict: "key" })
    if (error) return NextResponse.json({ error: "Could not save the threshold." }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (!id) return NextResponse.json({ error: "Missing proposal." }, { status: 400 })
  const { data: p } = await supa.from("group_proposals")
    .select("id, name, description, proposed_by, status, live_at").eq("id", id).maybeSingle()
  if (!p) return NextResponse.json({ error: "That proposal no longer exists." }, { status: 404 })
  const open = p.status === STATUS.PENDING || p.status === STATUS.LIVE

  if (action === "edit") {
    if (!open) return NextResponse.json({ error: "This proposal is already closed." }, { status: 409 })
    const err = validateProposal(body)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
    const name = normaliseText(body.name)
    const [{ data: clubs }, { data: others }] = await Promise.all([
      supa.from("clubs").select("name").eq("archived", false),
      supa.from("group_proposals").select("id, name, status, live_at").in("status", [STATUS.PENDING, STATUS.LIVE]),
    ])
    const dup = duplicateMessage(name, clubs || [], others || [], p.id)
    if (dup) return NextResponse.json({ error: dup }, { status: 409 })
    const description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null
    const { error } = await supa.from("group_proposals").update({ name, description }).eq("id", p.id)
    if (error) return NextResponse.json({ error: "Could not save." }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === "approve") {
    if (p.status !== STATUS.PENDING) return NextResponse.json({ error: "Already reviewed." }, { status: 409 })
    const { error } = await supa.from("group_proposals")
      .update({ status: STATUS.LIVE, live_at: now, reviewed_by: admin.id, reviewed_at: now }).eq("id", p.id)
    if (error) return NextResponse.json({ error: "Could not approve." }, { status: 500 })
    if (p.proposed_by) await notify(p.proposed_by, null, "group_proposal_approved", approvedMessage(p.name), "/clubs", admin.id)
    // Broadcast to every resident so they know to consider it (Iain,
    // 2026-10-05: "else how do people know to consider it?"). Sent on
    // approval, never on submission, so nobody hears about a proposal that
    // might be declined. The proposer (own message above) and the approving
    // admin are left out.
    const broadcast = await notifyAllActiveMembers(supa, null, "group_proposal_new", newProposalBroadcastMessage(p.name),
      { excludeMemberId: [p.proposed_by, admin.id].filter(Boolean), url: "/clubs" })
    return NextResponse.json({ ok: true, notified: broadcast })
  }

  if (action === "decline") {
    if (!open) return NextResponse.json({ error: "This proposal is already closed." }, { status: 409 })
    const reason = normaliseText(body.reason).slice(0, 300) || null
    const { error } = await supa.from("group_proposals")
      .update({ status: STATUS.DECLINED, decline_reason: reason, reviewed_by: admin.id, reviewed_at: now }).eq("id", p.id)
    if (error) return NextResponse.json({ error: "Could not decline." }, { status: 500 })
    if (p.proposed_by) await notify(p.proposed_by, null, "group_proposal_declined", declinedMessage(p.name, reason, p.status === STATUS.LIVE), "/clubs", admin.id)
    return NextResponse.json({ ok: true })
  }

  if (action === "create_club") {
    if (p.status !== STATUS.LIVE) return NextResponse.json({ error: "Only a live proposal can become a club." }, { status: 409 })

    const { data: clubs } = await supa.from("clubs").select("name, slug, colour, archived")
    const dup = duplicateMessage(p.name, (clubs || []).filter(c => !c.archived), [])
    if (dup) return NextResponse.json({ error: dup }, { status: 409 })

    // Claim the proposal first so a double tap can't create two clubs.
    const { data: claimed } = await supa.from("group_proposals")
      .update({ status: STATUS.CREATED, reviewed_by: admin.id, reviewed_at: now })
      .eq("id", p.id).eq("status", STATUS.LIVE).select("id")
    if (!claimed?.length) return NextResponse.json({ error: "Already being created." }, { status: 409 })

    const { data: club, error: clubErr } = await supa.from("clubs").insert({
      name: p.name,
      slug: uniqueSlug(p.name, (clubs || []).map(c => c.slug)),
      description: p.description ? p.description.slice(0, 200) : null,
      colour: nextClubColour((clubs || []).filter(c => !c.archived).map(c => c.colour)),
    }).select("id, slug").single()
    if (clubErr) {
      await supa.from("group_proposals").update({ status: STATUS.LIVE }).eq("id", p.id)
      return NextResponse.json({ error: "Could not create the club." }, { status: 500 })
    }
    await supa.from("group_proposals").update({ club_id: club.id }).eq("id", p.id)

    // Proposer = first Owner (decision 3); they run it from there with the
    // existing Owner self-service tools.
    if (p.proposed_by) {
      await supa.from("space_owners").insert({
        context_type: "club", context_key: club.id, member_id: p.proposed_by, created_by: admin.id,
      })
    }
    // Everyone who tapped "I'd join" becomes a member (proposer included).
    const supporters = await supporterIds(p.id)
    if (supporters.length) {
      await supa.from("club_members").upsert(
        supporters.map(member_id => ({ club_id: club.id, member_id })),
        { onConflict: "club_id,member_id", ignoreDuplicates: true },
      )
    }
    const url = `/clubs/${club.slug}`
    for (const memberId of supporters) {
      await notify(memberId, null, "group_proposal_club_created", clubCreatedMessage(p.name, memberId === p.proposed_by), url, admin.id)
    }
    return NextResponse.json({ ok: true, slug: club.slug, owner: !!p.proposed_by, members: supporters.length })
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 })
}
