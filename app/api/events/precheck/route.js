import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { findSameDateEvents, findSpaceConflict, needsSpaceValidation, spaceConflictMessage, resolveLocationId } from "@/lib/eventClash"

// Read-only pre-flight for the event form's save-time UX: any member can call
// this (same visibility as the calendar) to populate the same-date warning (A)
// and preview a space conflict (B) before hitting save. NOT the enforcement
// point — every create/edit route (clubs, social, screenings) re-runs
// findSpaceConflict itself and is the authoritative source of truth, so a
// client skipping this call still gets blocked on the real save.
//
// Priority (Iain, 2026-07-23): the hard block must be the FIRST thing a user
// sees, never the soft warning followed by a hard rejection on save -- if the
// space is unavailable, that's the only message, full stop. So when a space
// conflict exists, sameDateEvents isn't even computed/returned.
export const dynamic = "force-dynamic"

export async function POST(req) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  const { event_date, event_time, event_end_time, location_type, location_name, exclude_event_id } = await req.json().catch(() => ({}))

  let spaceConflict = null
  if (needsSpaceValidation({ location_type, locationName: location_name })) {
    const location_id = await resolveLocationId(supabaseAdmin, location_name)
    const conflict = await findSpaceConflict(supabaseAdmin, { location_id, event_date, event_time, event_end_time, exclude_event_id })
    if (conflict) spaceConflict = { ...conflict, message: spaceConflictMessage(location_name, conflict) }
  }

  const sameDateEvents = spaceConflict ? [] : await findSameDateEvents(supabaseAdmin, { event_date, exclude_event_id })

  return NextResponse.json({ sameDateEvents, spaceConflict })
}
