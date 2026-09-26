import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { waitlistSummary, waitlistQueue } from "@/lib/waitlist"
import { resolveMember } from "@/lib/areaAuth"

// GET /api/events/waitlist?event_ids=<id>,<id>,...
//
// Waitlist position + waitlist totals for the calling member, per event.
// (Iain, 2026-09-26 -- Fire Pit special event showed no waitlist position.)
//
// Why this has to be server-side: bookings RLS (migration 020) only lets a
// non-admin resident read their OWN rows plus other people's CONFIRMED rows
// -- other residents' waitlist rows are invisible to the browser client.
// Every client-side "count waitlist rows booked before mine" query therefore
// silently returned 0 for residents (everyone read as #1, and "N waiting"
// undercounted), while looking correct to admins, who can see every row.
// Show Time never had this problem because /api/screenings already computed
// it with the service role; this gives every other hub the same thing.
//
// Read-only. Residents get aggregate figures and their own position only.
// The named queue (`queue`) is added ONLY for events the caller can manage
// -- admin, that hub/club's Owner, or the event's active EC, the same rule
// as lib/areaAuth.js requireEventManage (Iain, 2026-09-26: ECs should see
// the Waitlist list on event cards, not just admins). A non-admin EC's
// browser can't read waitlist rows either, so it has to come from here.
export const dynamic = "force-dynamic"

export async function GET(req) {
  const { error: authError, status, member } = await resolveMember(req)
  if (authError) return NextResponse.json({ error: authError }, { status })

  const { searchParams } = new URL(req.url)
  const ids = [...new Set((searchParams.get("event_ids") || "").split(",").map(s => s.trim()).filter(Boolean))]
  if (!ids.length) return NextResponse.json({})
  if (ids.length > 200) return NextResponse.json({ error: "Too many events" }, { status: 400 })

  const { data: rows, error } = await supabaseAdmin
    .from("bookings")
    .select("id, event_id, member_id, contact_id, status, seats, booked_at, bus_passenger, member:members!member_id(id, name, display_name, username, hide_name), contact:contacts!contact_id(id, name)")
    .in("event_id", ids)
    .eq("status", "waitlist")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byEvent = {}
  for (const b of rows || []) (byEvent[b.event_id] ||= []).push(b)

  const manageable = await manageableEventIds(member, ids.filter(id => byEvent[id]?.length))

  const result = {}
  for (const id of ids) {
    const evRows = byEvent[id] || []
    const summary = waitlistSummary(evRows, b => b.member_id === member.id)
    if (manageable.has(id)) {
      // Same shape as a client-side event.bookings row, so tiles can drop it
      // straight into their existing Waitlist list / attendee export.
      summary.queue = waitlistQueue(evRows).map((b, i) => ({
        id: b.id, status: "waitlist", position: i + 1, seats: b.seats || 1, booked_at: b.booked_at,
        member_id: b.member_id, contact_id: b.contact_id, bus_passenger: !!b.bus_passenger,
        member: b.member || null, contact: b.contact || null,
      }))
    }
    result[id] = summary
  }
  return NextResponse.json(result)
}

// Events (of `ids`) this member can manage: admin -> all; otherwise the
// event's hub/club Owner (space_owners) or its active EC. Mirrors
// requireEventManage, batched so a list page costs 3 queries, not 3 per event.
async function manageableEventIds(member, ids) {
  if (!ids.length) return new Set()
  if (member.is_admin) return new Set(ids)
  const [{ data: evs }, { data: owned }, { data: ecs }] = await Promise.all([
    supabaseAdmin.from("events").select("id, hub_type, club_id").in("id", ids),
    supabaseAdmin.from("space_owners").select("context_type, context_key").eq("member_id", member.id),
    supabaseAdmin.from("event_coordinators").select("event_id").eq("member_id", member.id).in("event_id", ids).is("replaced_at", null),
  ])
  const ownedKeys = new Set((owned || []).map(o => `${o.context_type}:${o.context_key}`))
  const out = new Set((ecs || []).map(e => e.event_id))
  for (const e of evs || []) {
    const key = e.club_id ? `club:${e.club_id}` : `hub:${e.hub_type}`
    if (ownedKeys.has(key)) out.add(e.id)
  }
  return out
}
