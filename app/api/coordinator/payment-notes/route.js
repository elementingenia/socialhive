import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { requireEventManage } from "@/lib/areaAuth"
import { resolveMemberName } from "@/lib/memberName"

// force-dynamic + the shared no-store client: the reconciliation report is
// a state-of-play snapshot and must read live data.
export const dynamic = "force-dynamic"

// GET /api/coordinator/payment-notes?event_id=…
// Payment notes for every booking on one event, with the recorder's name
// resolved, for the Payment Reconciliation PDF (2026-11-19). Same access
// as the rest of the coordinator panel: admin, this event's hub/club
// Owner, or one of its coordinators.
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get("event_id")
  if (!eventId) return NextResponse.json({ error: "event_id required" }, { status: 400 })

  const { error, status } = await requireEventManage(req, eventId)
  if (error) return NextResponse.json({ error }, { status })

  const { data: bookings, error: bErr } = await supa
    .from("bookings").select("id, payment_notes").eq("event_id", eventId)
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })

  const withNotes = (bookings || []).filter(b => Array.isArray(b.payment_notes) && b.payment_notes.length > 0)
  const recorderIds = [...new Set(withNotes.flatMap(b => b.payment_notes.map(n => n?.recorded_by).filter(Boolean)))]

  const names = {}
  if (recorderIds.length) {
    const { data: people } = await supa
      .from("members").select("id, name, display_name, username, hide_name").in("id", recorderIds)
    for (const m of (people || [])) {
      names[m.id] = resolveMemberName(m, { canManage: true, fallback: m.username || "—" })
    }
  }

  const notes = {}
  for (const b of withNotes) {
    notes[b.id] = b.payment_notes.map(n => ({
      amount: n?.amount ?? null,
      note: n?.note || "",
      recorded_at: n?.recorded_at || null,
      recorded_by: n?.recorded_by || null,
      by_name: n?.recorded_by ? (names[n.recorded_by] || null) : null,
    }))
  }
  return NextResponse.json({ notes })
}
