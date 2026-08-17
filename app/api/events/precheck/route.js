import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { findSameDateEvents, needsSpaceValidation, fetchLocation } from "@/lib/eventClash"
import { findAnyRoomConflict, findSameDatePersonalBookings } from "@/lib/spaceBookings"

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
  const { data: member } = await supabaseAdmin
    .from("members").select("id, is_admin").eq("auth_id", user.id).maybeSingle()

  const {
    event_date, event_time, event_end_time, location_type, location_id, exclude_event_id,
    // Opt-in only -- the space booking form is the one caller that needs to
    // know about other residents' PERSONAL space_bookings too, not just
    // events. Screenings/Social/Clubs don't pass this, so their response
    // shape and behaviour are unchanged (Iain, 2026-08-04).
    include_space_bookings, exclude_booking_id,
  } = await req.json().catch(() => ({}))

  // The client now sends the location ID, not its name — the name is read back
  // from the row, so a renamed room still resolves (migration 071).
  const loc = location_type === "onsite" ? await fetchLocation(supabaseAdmin, location_id) : null

  let spaceConflict = null
  if (needsSpaceValidation({ location_type, bookable: loc?.bookable })) {
    const conflict = await findAnyRoomConflict(supabaseAdmin, {
      location_id, event_date, event_time, event_end_time, exclude_event_id, locationName: loc?.name,
      viewerId: member?.id, canManage: !!member?.is_admin,
    })
    if (conflict) spaceConflict = conflict
  }

  const sameDateEvents = spaceConflict ? [] : await findSameDateEvents(supabaseAdmin, { event_date, exclude_event_id })

  let sameDatePersonalBookings = []
  if (!spaceConflict && include_space_bookings) {
    sameDatePersonalBookings = await findSameDatePersonalBookings(supabaseAdmin, {
      event_date, exclude_booking_id, requesting_member_id: member?.id, canManage: !!member?.is_admin,
    })
  }

  return NextResponse.json({ sameDateEvents, sameDatePersonalBookings, spaceConflict })
}
