import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { findSameDateEvents, findSpaceConflict, needsSpaceValidation, spaceConflictMessage } from "@/lib/eventClash"

// Read-only pre-flight for the event form's save-time UX: any member can call
// this (same visibility as the calendar) to populate the same-date warning (A)
// and preview a space conflict (B) before hitting save. NOT the enforcement
// point — every create/edit route (clubs, social, screenings) re-runs
// findSpaceConflict itself and is the authoritative source of truth, so a
// client skipping this call still gets blocked on the real save.
export const dynamic = "force-dynamic"

export async function POST(req) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  const { event_date, event_time, event_end_time, location_type, location_id, location_name, exclude_event_id } = await req.json().catch(() => ({}))

  const sameDateEvents = await findSameDateEvents(supabaseAdmin, { event_date, exclude_event_id })

  let spaceConflict = null
  if (needsSpaceValidation({ location_type, locationName: location_name })) {
    const conflict = await findSpaceConflict(supabaseAdmin, { location_id, event_date, event_time, event_end_time, exclude_event_id })
    if (conflict) spaceConflict = { ...conflict, message: spaceConflictMessage(location_name, conflict) }
  }

  return NextResponse.json({ sameDateEvents, spaceConflict })
}
