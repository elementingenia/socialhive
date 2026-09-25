import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { waitlistSummary } from "@/lib/waitlist"
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
// Read-only. Returns aggregate figures and the caller's own position only --
// never who else is on the waitlist.
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
    .select("id, event_id, member_id, status, seats, booked_at")
    .in("event_id", ids)
    .eq("status", "waitlist")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byEvent = {}
  for (const b of rows || []) (byEvent[b.event_id] ||= []).push(b)

  const result = {}
  for (const id of ids) {
    result[id] = waitlistSummary(byEvent[id] || [], b => b.member_id === member.id)
  }
  return NextResponse.json(result)
}
