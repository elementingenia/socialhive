import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notifyClubMembers } from "@/lib/notifyAudience"
import { generateSeriesEvents } from "@/lib/generateSeriesEvents"
import { RULE_TYPES } from "@/lib/recurrence"

// Recurring event series — create / end. Occurrences are materialised as real
// events by generateSeriesEvents (scope §3). A series fires exactly ONE
// "new recurring event" notification, never one per occurrence (scope §9).
export const dynamic = "force-dynamic"

// Admin, or a coordinator/owner of the target club, may manage a series. Kept in
// a service-role route per the canonical standard (dynamic eligibility, not RLS).
async function resolve(req, clubId) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!token) return { error: "Unauthorised", status: 401 }
  const { data: { user } } = await supa.auth.getUser(token)
  if (!user) return { error: "Unauthorised", status: 401 }
  const { data: member } = await supa.from("members").select("id, is_admin").eq("auth_id", user.id).single()
  if (!member) return { error: "Member not found", status: 403 }
  if (member.is_admin) return { member }
  // club owner?
  const { data: owner } = await supa.from("space_owners")
    .select("id").eq("context_type", "club").eq("context_key", clubId).eq("member_id", member.id).maybeSingle()
  if (owner) return { member }
  // coordinator of any of this club's events?
  const { data: ec } = await supa.from("event_coordinators")
    .select("id, events!inner(club_id)").eq("member_id", member.id).eq("events.club_id", clubId).limit(1)
  if (ec?.length) return { member }
  return { error: "Not allowed for this club", status: 403 }
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const { club_id, rule_type, rule_config, mode = "series" } = body
  if (!club_id) return NextResponse.json({ error: "club_id required" }, { status: 400 })
  if (!RULE_TYPES.includes(rule_type)) return NextResponse.json({ error: "Invalid rule_type" }, { status: 400 })

  const { error, status, member } = await resolve(req, club_id)
  if (error) return NextResponse.json({ error }, { status })

  const row = {
    club_id, created_by: member.id, mode: mode === "pattern" ? "pattern" : "series",
    rule_type, rule_config: rule_config || {},
    month_end_policy: body.month_end_policy === "skip" ? "skip" : "clamp",
    horizon_months: [3, 6, 12].includes(Number(body.horizon_months)) ? Number(body.horizon_months) : 6,
    start_date: body.start_date, event_time: body.event_time || "00:00",
    title: body.title || null, description: body.description || null, welcome_message: body.welcome_message || null,
    location_type: body.location_type || "onsite", location: body.location || null,
    max_seats: body.max_seats ?? 20, max_seats_per_booking: body.max_seats_per_booking ?? 1,
    allow_nonresident_guests: !!body.allow_nonresident_guests,
    payment_required: !!body.payment_required, cost: body.payment_required ? (body.cost ?? 0) : 0,
    bring_category_ids: body.bring_category_ids || null, theme_name: body.theme_name || null,
    is_public: body.is_public !== false, show_attendee_names: body.show_attendee_names !== false,
    coordinator_ids: Array.isArray(body.coordinator_ids) ? body.coordinator_ids : [],
  }
  if (!row.start_date) return NextResponse.json({ error: "start_date required" }, { status: 400 })

  const { data: series, error: se } = await supa.from("event_series").insert(row).select("*").single()
  if (se) return NextResponse.json({ error: se.message }, { status: 500 })

  // Pattern series generate nothing (Book Club, §7a) — they only pre-fill dates.
  let created = 0
  if (series.mode === "series") {
    const res = await generateSeriesEvents(series)
    created = res.created
    // ONE notification for the whole series, excluding the creator (§9).
    const { data: club } = await supa.from("clubs").select("name").eq("id", club_id).single()
    await notifyClubMembers(supa, club_id, null, "event_added",
      `New recurring ${club?.name || "club"} event: ${series.title || "event"}`,
      { excludeMemberId: member.id })
  }

  return NextResponse.json({ ok: true, series, occurrences_created: created })
}

// End a series: stop future generation. Already-generated occurrences are left
// intact (residents keep their bookings). Scope §5.
export async function PATCH(req) {
  const body = await req.json().catch(() => ({}))
  const { series_id } = body
  if (!series_id) return NextResponse.json({ error: "series_id required" }, { status: 400 })
  const { data: s } = await supa.from("event_series").select("club_id").eq("id", series_id).single()
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const { error, status } = await resolve(req, s.club_id)
  if (error) return NextResponse.json({ error }, { status })
  await supa.from("event_series").update({ status: "ended", updated_at: new Date().toISOString() }).eq("id", series_id)
  return NextResponse.json({ ok: true })
}
