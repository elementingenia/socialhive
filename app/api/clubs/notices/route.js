import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { notify } from "@/lib/notify"

// Club notices (Phase 2c). Posting fans a notification out to everyone who has
// JOINED the club (club_members) — the deliberate reason join exists — so this
// must run server-side: the notifications INSERT policy is service-role only
// (migration 034), and only the service role can write for other members.
const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function requireAdmin(req) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!token) return null
  const { data: { user } } = await supa.auth.getUser(token)
  if (!user) return null
  const { data: m } = await supa.from("members").select("id, is_admin").eq("auth_id", user.id).single()
  return m?.is_admin ? m : null
}

export async function POST(req) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { club_id, content } = await req.json()
  if (!club_id || !content?.trim()) {
    return NextResponse.json({ error: "club_id and content required" }, { status: 400 })
  }

  const { data: club } = await supa.from("clubs").select("id, name").eq("id", club_id).single()
  if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 })

  const { data: notice, error } = await supa.from("club_notices")
    .insert({ club_id, content: content.trim(), created_by: admin.id })
    .select("id").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify every joined member except the author. event_id is null — this is a
  // club-level notice, not tied to an event.
  const { data: joined } = await supa.from("club_members").select("member_id").eq("club_id", club_id)
  const plain = content.trim().replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
  const snippet = plain.length > 90 ? plain.slice(0, 88) + "…" : plain
  const msg = `New ${club.name} notice: ${snippet}`
  let notified = 0
  for (const row of joined || []) {
    if (row.member_id === admin.id) continue
    await notify(row.member_id, null, "club_notice_posted", msg)
    notified++
  }

  return NextResponse.json({ ok: true, id: notice.id, notified })
}

export async function DELETE(req) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 })
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const { error } = await supa.from("club_notices").update({ archived: true }).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
