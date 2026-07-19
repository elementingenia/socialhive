import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { notifyClubMembers } from "@/lib/notifyAudience"

// Notify a club's joined members about a NEW club event. Club events are
// created client-side (ClubHome), but the notification fan-out must be
// server-side (notifications INSERT is service-role only, migration 034), so
// the client calls this after a successful create. Admin-gated.
const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(req) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  const { data: { user } } = await supa.auth.getUser(token)
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  const { data: member } = await supa.from("members").select("id, is_admin").eq("auth_id", user.id).single()
  if (!member?.is_admin) return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { club_id, event_id, title, event_date } = await req.json()
  if (!club_id || !event_id) return NextResponse.json({ error: "club_id and event_id required" }, { status: 400 })

  const { data: club } = await supa.from("clubs").select("name").eq("id", club_id).single()
  const when = event_date ? new Date(event_date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) : ""
  const notified = await notifyClubMembers(supa, club_id, event_id, "event_added",
    `New ${club?.name || "club"} event: ${title || "event"}${when ? ` — ${when}` : ""}`, { excludeMemberId: member.id })

  return NextResponse.json({ ok: true, notified })
}
