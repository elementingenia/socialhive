import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"

// Records that a signed-in member is using the app (members.last_active_at),
// which drives the 14-day inactivity sign-out in app/(app)/layout.js.
//
// Bug fixed 2026-10-09 (BUG-086): the layout used to write last_active_at
// straight from the browser. members has no self-update RLS policy -- only
// members_admin_write -- so for every non-admin the update matched no rows
// and failed silently. last_active_at only moved at login, and residents
// were signed out 14 days after their last LOGIN however often they used
// the app. Confirmed live: 126 of 128 residents' last_active_at equalled
// their last Auth sign-in to within 2 minutes; admins' didn't. A self-update
// policy is not the fix -- it would let a resident edit any column of their
// own row, is_admin included -- so the write happens here, service-role,
// for the caller's own row and this one column only.
export const dynamic = "force-dynamic"

export async function POST(request) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: "Session expired" }, { status: 401 })

  const { error: upErr } = await supabaseAdmin
    .from("members")
    .update({ last_active_at: new Date().toISOString() })
    .eq("auth_id", user.id)
  if (upErr) return NextResponse.json({ error: "Could not record activity" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
