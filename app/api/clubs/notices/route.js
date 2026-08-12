import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notify } from "@/lib/notify"
import { requireAdminOrAreaOwner } from "@/lib/areaAuth"

// Club notices (Phase 2c). Posting fans a notification out to everyone who has
// JOINED the club (club_members) — the deliberate reason join exists — so this
// must run server-side: the notifications INSERT policy is service-role only
// (migration 034), and only the service role can write for other members.
//
// Posting rights widened 2026-08-12 (Owner_SelfService_and_Library_Hub_Scope_v1
// Part A.2): this was admin-only, which was a real gap — an Owner should be
// able to post to their own club without needing an admin to do it for them.

export async function POST(req) {
  const { club_id, content } = await req.json()
  if (!club_id || !content?.trim()) {
    return NextResponse.json({ error: "club_id and content required" }, { status: 400 })
  }

  const { error, status, member } = await requireAdminOrAreaOwner(req, "club", club_id)
  if (error) return NextResponse.json({ error }, { status })

  const { data: club } = await supa.from("clubs").select("id, name").eq("id", club_id).single()
  if (!club) return NextResponse.json({ error: "Group/Club not found" }, { status: 404 })

  const { data: notice, error: insError } = await supa.from("club_notices")
    .insert({ club_id, content: content.trim(), created_by: member.id })
    .select("id").single()
  if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })

  // Notify every joined member except the author. event_id is null — this is a
  // club-level notice, not tied to an event.
  const { data: joined } = await supa.from("club_members").select("member_id").eq("club_id", club_id)
  const plain = content.trim().replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
  const snippet = plain.length > 90 ? plain.slice(0, 88) + "…" : plain
  const msg = `New ${club.name} notice: ${snippet}`
  let notified = 0
  for (const row of joined || []) {
    if (row.member_id === member.id) continue
    await notify(row.member_id, null, "club_notice_posted", msg)
    notified++
  }

  return NextResponse.json({ ok: true, id: notice.id, notified })
}

export async function DELETE(req) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { data: existing } = await supa.from("club_notices").select("club_id").eq("id", id).maybeSingle()
  if (!existing) return NextResponse.json({ error: "Notice not found" }, { status: 404 })

  const { error, status } = await requireAdminOrAreaOwner(req, "club", existing.club_id)
  if (error) return NextResponse.json({ error }, { status })

  const { error: delError } = await supa.from("club_notices").update({ archived: true }).eq("id", id)
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
