import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { resolveMember, isAreaOwner } from "@/lib/areaAuth"
import { sydneyTodayStr } from "@/lib/date"

// Show Time repeating showings (migration 135, Iain 2026-10-10).
//   GET   -> { following, muted: [series_id] } for the signed-in resident
//   POST  { action: "mute" | "unmute", series_id }
//   PATCH { action: "end", series_id }  -- coordinators, Show Time Owners, admins
//
// Muting stops only that series' "what's showing" alerts; the resident stays
// a Show Time member for everything else (agreed scope). Mutes are read and
// written here with the service role only -- the table has no client policy.
export const dynamic = "force-dynamic"

async function loadShowtimeSeries(seriesId) {
  if (!seriesId) return null
  const { data } = await supabaseAdmin.from("event_series")
    .select("id, hub_type, status, coordinator_ids, created_by").eq("id", seriesId).maybeSingle()
  return data && data.hub_type === "movie" ? data : null
}

export async function GET(req) {
  const { error, status, member } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })
  const [{ data: follow }, { data: mutes }] = await Promise.all([
    supabaseAdmin.from("hub_followers").select("member_id").eq("hub_type", "movie").eq("member_id", member.id).maybeSingle(),
    supabaseAdmin.from("showtime_series_mutes").select("series_id").eq("member_id", member.id),
  ])
  return NextResponse.json({ following: !!follow, muted: (mutes || []).map(m => m.series_id) })
}

export async function POST(req) {
  const { error, status, member } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })
  const { action, series_id } = await req.json().catch(() => ({}))
  const series = await loadShowtimeSeries(series_id)
  if (!series) return NextResponse.json({ error: "That repeating showing couldn't be found" }, { status: 404 })

  if (action === "mute") {
    const { error: e } = await supabaseAdmin.from("showtime_series_mutes")
      .upsert({ member_id: member.id, series_id }, { onConflict: "member_id,series_id", ignoreDuplicates: true })
    if (e) return NextResponse.json({ error: e.message }, { status: 500 })
    return NextResponse.json({ ok: true, muted: true })
  }
  if (action === "unmute") {
    await supabaseAdmin.from("showtime_series_mutes").delete().eq("member_id", member.id).eq("series_id", series_id)
    return NextResponse.json({ ok: true, muted: false })
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

// End a run: no more dates are added. Future dates nobody else has booked are
// removed; a date someone has booked stays, so nobody loses a seat. The
// creator's own kept seats don't count as "someone else".
export async function PATCH(req) {
  const { error, status, member } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })
  const { action, series_id } = await req.json().catch(() => ({}))
  if (action !== "end") return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  const series = await loadShowtimeSeries(series_id)
  if (!series) return NextResponse.json({ error: "That repeating showing couldn't be found" }, { status: 404 })

  const today = sydneyTodayStr()
  const { data: future } = await supabaseAdmin.from("events")
    .select("id, bookings(member_id, status)").eq("series_id", series_id).eq("archived", false).gte("event_date", today)
  const futureIds = (future || []).map(e => e.id)

  let allowed = !!member.is_admin || await isAreaOwner(member.id, "hub", "movie")
    || (series.coordinator_ids || []).includes(member.id)
  if (!allowed && futureIds.length) {
    const { data: ec } = await supabaseAdmin.from("event_coordinators")
      .select("id").in("event_id", futureIds).eq("member_id", member.id).is("replaced_at", null).limit(1)
    allowed = (ec || []).length > 0
  }
  if (!allowed) return NextResponse.json({ error: "Only its coordinators, Show Time Owners or admins can end this" }, { status: 403 })

  await supabaseAdmin.from("event_series").update({ status: "ended", updated_at: new Date().toISOString() }).eq("id", series_id)

  const coordIds = new Set([...(series.coordinator_ids || []), series.created_by].filter(Boolean))
  const othersBooked = (ev) => (ev.bookings || []).some(b => b.status !== "cancelled" && !coordIds.has(b.member_id))
  const remove = (future || []).filter(ev => !othersBooked(ev)).map(ev => ev.id)
  if (remove.length) {
    await supabaseAdmin.from("events").update({ archived: true }).in("id", remove)
    await supabaseAdmin.from("bookings").update({ status: "cancelled" }).in("event_id", remove).neq("status", "cancelled")
  }
  return NextResponse.json({ ok: true, removed: remove.length, kept: futureIds.length - remove.length })
}
