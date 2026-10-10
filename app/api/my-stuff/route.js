import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { resolveMember } from "@/lib/areaAuth"
import { sydneyTodayStr } from "@/lib/date"
import { validatePin, bookedSeries } from "@/lib/myStuff"

// My Stuff (migration 136, Iain 2026-10-10).
//   GET  -> { pins, clubs, series }  -- the signed-in resident's own only
//   POST { action: "pin" | "unpin", item_type, item_id }
//
// Fully private (agreed): every query is scoped to the caller's own member
// id, nothing here can read anyone else's pins, and pinning tells nobody.
export const dynamic = "force-dynamic"

export async function GET(req) {
  const { error, status, member } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })
  const today = sydneyTodayStr()

  const [{ data: pins }, { data: joins }, { data: booked }] = await Promise.all([
    supabaseAdmin.from("member_pins").select("item_type, item_id, created_at")
      .eq("member_id", member.id).order("created_at", { ascending: false }),
    supabaseAdmin.from("club_members").select("club:clubs!club_id(id, name, slug, archived)")
      .eq("member_id", member.id),
    supabaseAdmin.from("bookings")
      .select("event:events!event_id(id, series_id, event_date, event_time, hub_type, title, showing_name, content_tba, archived, club_id, club:clubs!club_id(name, slug))")
      .eq("member_id", member.id).in("status", ["confirmed", "waitlist"]),
  ])

  const clubs = (joins || []).map(j => j.club).filter(c => c && !c.archived)
    .map(c => ({ id: c.id, name: c.name, slug: c.slug }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const rows = (booked || []).map(b => b.event)
    .filter(e => e && e.series_id && !e.archived && e.event_date >= today)
    .map(e => ({ ...e, club_name: e.club?.name || null, club_slug: e.club?.slug || null }))

  return NextResponse.json({ pins: pins || [], clubs, series: bookedSeries(rows) })
}

export async function POST(req) {
  const { error, status, member } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })
  const body = await req.json().catch(() => ({}))
  const invalid = validatePin(body)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
  const { action, item_type, item_id } = body

  if (action === "unpin") {
    await supabaseAdmin.from("member_pins").delete()
      .eq("member_id", member.id).eq("item_type", item_type).eq("item_id", item_id)
    return NextResponse.json({ ok: true, pinned: false })
  }
  const { error: e } = await supabaseAdmin.from("member_pins")
    .upsert({ member_id: member.id, item_type, item_id }, { onConflict: "member_id,item_type,item_id", ignoreDuplicates: true })
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ ok: true, pinned: true })
}
