import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { requireEventManage, resolveMember } from "@/lib/areaAuth"
import { buildResidentPicker } from "@/lib/directoryPrivacy"

// Resident pickers in EventSlideOut (walk-up booking, "who else is
// coming?"). Moved server-side for BUG-072 (2026-10-03): the browser used
// to read every member's house number directly, and migration 121 now
// blocks that. A Private resident's house number is only sent to admins,
// the resident themself, or someone who manages this event (admin, the
// event's hub/club Owner, or its EC -- requireEventManage).
export const dynamic = "force-dynamic"

export async function GET(req) {
  const { error, status, member: viewer } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })

  const eventId = new URL(req.url).searchParams.get("event_id")
  let canManageEvent = !!viewer.is_admin
  if (!canManageEvent && eventId) canManageEvent = !(await requireEventManage(req, eventId)).error

  const [{ data: members, error: e1 }, { data: contacts, error: e2 }] = await Promise.all([
    supa.from("members").select("id, name, username, house_number, hide_name")
      .eq("status", "active").eq("is_test", false).order("name"),
    supa.from("contacts").select("id, name, house_number")
      .eq("active", true).is("member_id", null).order("name"),
  ])
  if (e1 || e2) return NextResponse.json({ error: "Could not load residents." }, { status: 500 })

  return NextResponse.json({ residents: buildResidentPicker({ members: members || [], contacts: contacts || [], viewer, canManageEvent }) })
}
