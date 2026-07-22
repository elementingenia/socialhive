import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notifyClubMembers } from "@/lib/notifyAudience"
import { generateSeriesEvents } from "@/lib/generateSeriesEvents"
import { notifyEventAttendees } from "@/lib/notifyEventAttendees"
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


// Template fields a "this and future" edit propagates to later occurrences.
// Never event_date (rule-driven) or book_id (per-occurrence, Book Club).
const PROPAGATE = ["title","description","welcome_message","event_time","location_type","location",
  "max_seats","max_seats_per_booking","allow_nonresident_guests","payment_required","cost",
  "bring_category_ids","theme_name","is_public","show_attendee_names"]

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

  // Only one active pattern per club (Book Club, §7a): a new one supersedes the old.
  if (row.mode === "pattern") {
    await supa.from("event_series").update({ status: "ended" }).eq("club_id", club_id).eq("mode", "pattern").eq("status", "active")
  }

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

// Series edit / cancel actions (scope §5/§6). action:
//   end               — stop generation; archive future UNBOOKED occurrences,
//                        keep booked ones (residents keep their seat).
//   update_future     — apply the edited template to this + future occurrences
//                        that have no bookings and aren't exceptions; also update
//                        the series template so newly generated ones match.
//   cancel_occurrence — archive a single occurrence and notify only its bookers.
export async function PATCH(req) {
  const body = await req.json().catch(() => ({}))
  const { action, series_id, event_id } = body
  const today = new Date().toISOString().slice(0, 10)

  // Resolve the club (via series or event) for the role check.
  let clubId = null, series = null
  if (series_id) {
    const { data } = await supa.from("event_series").select("*").eq("id", series_id).single()
    if (!data) return NextResponse.json({ error: "Series not found" }, { status: 404 })
    series = data; clubId = data.club_id
  } else if (event_id) {
    const { data } = await supa.from("events").select("id, club_id, series_id, title").eq("id", event_id).single()
    if (!data) return NextResponse.json({ error: "Event not found" }, { status: 404 })
    clubId = data.club_id
  } else {
    return NextResponse.json({ error: "series_id or event_id required" }, { status: 400 })
  }
  const { error, status } = await resolve(req, clubId)
  if (error) return NextResponse.json({ error }, { status })

  if (action === "cancel_occurrence") {
    if (!event_id) return NextResponse.json({ error: "event_id required" }, { status: 400 })
    const { data: ev } = await supa.from("events").select("title").eq("id", event_id).single()
    await supa.from("events").update({ archived: true }).eq("id", event_id)
    // Only this occurrence's bookers are told (scope §6).
    await notifyEventAttendees(supa, event_id, "event_cancelled",
      `${ev?.title || "An event you booked"} has been cancelled.`)
    return NextResponse.json({ ok: true })
  }

  if (action === "change_recurrence") {
    if (!series_id) return NextResponse.json({ error: "series_id required" }, { status: 400 })
    // Update the series rule, then regenerate the FUTURE unbooked dates to match.
    // Booked future dates are left intact (protected) even if off the new pattern.
    const rulePatch = {}
    for (const k of ["rule_type", "rule_config", "month_end_policy", "horizon_months"]) if (k in body) rulePatch[k] = body[k]
    const { data: updated } = await supa.from("event_series")
      .update({ ...rulePatch, updated_at: new Date().toISOString() }).eq("id", series_id).select("*").single()
    const { data: future } = await supa.from("events")
      .select("id, bookings(id)").eq("series_id", series_id).eq("archived", false)
      .eq("is_series_exception", false).gte("event_date", today)
    const toArchive = (future || []).filter(e => !(e.bookings || []).length).map(e => e.id)
    if (toArchive.length) await supa.from("events").update({ archived: true }).in("id", toArchive)
    const gen = await generateSeriesEvents(updated)
    return NextResponse.json({ ok: true, archived: toArchive.length, regenerated: gen.created })
  }

  if (action === "update_future") {
    if (!series_id) return NextResponse.json({ error: "series_id required" }, { status: 400 })
    const fromDate = body.from_date || today
    const patch = {}
    for (const k of PROPAGATE) if (k in body) patch[k] = body[k]
    // Update the series template so future GENERATED occurrences match.
    if (Object.keys(patch).length) {
      await supa.from("event_series").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", series_id)
    }
    // Future occurrences that are safe to rewrite: same series, on/after the
    // edited date, not an exception, and with NO bookings (protect booked ones).
    const { data: future } = await supa.from("events")
      .select("id, bookings(id)").eq("series_id", series_id).eq("archived", false)
      .eq("is_series_exception", false).gte("event_date", fromDate)
    const safeIds = (future || []).filter(e => !(e.bookings || []).length).map(e => e.id)
    if (safeIds.length && Object.keys(patch).length) {
      await supa.from("events").update(patch).in("id", safeIds)
    }
    const protectedCount = (future || []).filter(e => (e.bookings || []).length).length
    return NextResponse.json({ ok: true, updated: safeIds.length, protected: protectedCount })
  }

  // default: end the series
  await supa.from("event_series").update({ status: "ended", updated_at: new Date().toISOString() }).eq("id", series_id)
  const { data: future } = await supa.from("events")
    .select("id, bookings(id)").eq("series_id", series_id).eq("archived", false).gte("event_date", today)
  const unbooked = (future || []).filter(e => !(e.bookings || []).length).map(e => e.id)
  if (unbooked.length) await supa.from("events").update({ archived: true }).in("id", unbooked)
  return NextResponse.json({ ok: true, removed_unbooked: unbooked.length, kept_booked: (future || []).length - unbooked.length })
}
