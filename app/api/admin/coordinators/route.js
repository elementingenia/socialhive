import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"


async function requireAdmin(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "")
  if (!token) return { error: "Unauthenticated", status: 401 }
  const { data: { user } } = await supa.auth.getUser(token)
  if (!user) return { error: "Unauthenticated", status: 401 }
  const { data: member } = await supa
    .from("members")
    .select("id, is_admin")
    .eq("auth_id", user.id)
    .maybeSingle()
  if (!member?.is_admin) return { error: "Admin only", status: 403 }
  return { member }
}

// POST /api/admin/coordinators
// Body: { event_id, member_ids: [uuid, ...] } — sets coordinators (replaces all active)
export async function POST(req) {
  const { error, status, member: admin } = await requireAdmin(req)
  if (error) return NextResponse.json({ error }, { status })

  const body = await req.json()
  const { event_id, member_ids } = body
  if (!event_id) return NextResponse.json({ error: "event_id required" }, { status: 400 })
  if (!Array.isArray(member_ids) || member_ids.length > 3) {
    return NextResponse.json({ error: "member_ids must be array of max 3" }, { status: 400 })
  }

  const now = new Date().toISOString()

  // Get current active coordinators
  const { data: current } = await supa
    .from("event_coordinators")
    .select("id, member_id")
    .eq("event_id", event_id)
    .is("replaced_at", null)

  const currentIds = (current || []).map(r => r.member_id)
  const toAdd = member_ids.filter(id => !currentIds.includes(id))
  const toRemove = (current || []).filter(r => !member_ids.includes(r.member_id))

  // Mark removed as replaced
  if (toRemove.length > 0) {
    await supa
      .from("event_coordinators")
      .update({ replaced_at: now, replaced_by: admin.id })
      .in("id", toRemove.map(r => r.id))
  }

  // Add new coordinators
  if (toAdd.length > 0) {
    await supa.from("event_coordinators").insert(
      toAdd.map(mid => ({ event_id, member_id: mid, assigned_by: admin.id, assigned_at: now }))
    )
  }

  return NextResponse.json({ ok: true })
}

// GET /api/admin/coordinators?event_id=…
// Returns active coordinator member_ids for an event
export async function GET(req) {
  const { error, status } = await requireAdmin(req)
  if (error) return NextResponse.json({ error }, { status })

  const { searchParams } = new URL(req.url)
  const event_id = searchParams.get("event_id")
  if (!event_id) return NextResponse.json({ error: "event_id required" }, { status: 400 })

  const { data } = await supa
    .from("event_coordinators")
    .select("member_id, members!member_id(id, name, username)")
    .eq("event_id", event_id)
    .is("replaced_at", null)
    .order("assigned_at")

  return NextResponse.json({ coordinators: data || [] })
}
