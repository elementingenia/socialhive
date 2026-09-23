import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notify } from "@/lib/notify"
import { requireAdminOrAreaOwner } from "@/lib/areaAuth"
import { hubHasNotices, hubNoticeHome, noticeMessage, noticeRecipients } from "@/lib/hubNotices"

export const dynamic = "force-dynamic"

// Hub notices (Iain, 2026-09-23) -- the hub equivalent of
// app/api/clubs/notices/route.js. Posting fans a notification out to every
// member who has JOINED the hub (hub_followers), so it must run server-side:
// notifications INSERT is service-role only (migration 034). Posting rights:
// admin or that hub's Owner (space_owners, context 'hub').

export async function POST(req) {
  const { hub_type, content } = await req.json()
  if (!hub_type || !content?.trim()) {
    return NextResponse.json({ error: "hub_type and content required" }, { status: 400 })
  }
  if (!hubHasNotices(hub_type)) {
    return NextResponse.json({ error: "This hub has no members, so it has no notices" }, { status: 400 })
  }

  const { error, status, member } = await requireAdminOrAreaOwner(req, "hub", hub_type)
  if (error) return NextResponse.json({ error }, { status })

  const { data: notice, error: insError } = await supa.from("hub_notices")
    .insert({ hub_type, content: content.trim(), created_by: member.id })
    .select("id").single()
  if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })

  const { data: followers } = await supa.from("hub_followers").select("member_id").eq("hub_type", hub_type)
  const ids = noticeRecipients((followers || []).map(f => f.member_id), member.id)
  const msg = noticeMessage(hub_type, content)
  const url = hubNoticeHome(hub_type)
  await Promise.all(ids.map(id => notify(id, null, "hub_notice_posted", msg, url, member.id)))

  return NextResponse.json({ ok: true, id: notice.id, notified: ids.length })
}

export async function DELETE(req) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { data: existing } = await supa.from("hub_notices").select("hub_type").eq("id", id).maybeSingle()
  if (!existing) return NextResponse.json({ error: "Notice not found" }, { status: 404 })

  const { error, status } = await requireAdminOrAreaOwner(req, "hub", existing.hub_type)
  if (error) return NextResponse.json({ error }, { status })

  const { error: delError } = await supa.from("hub_notices").update({ archived: true }).eq("id", id)
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
