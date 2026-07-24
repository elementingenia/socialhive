import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"

// Shared "admin OR this club's owner" eligibility check -- service-role,
// per the canonical standard (dynamic eligibility, not RLS; see
// app/api/series/route.js and app/api/clubs/events/route.js for the fuller
// admin/owner/EC variant those routes need). Club appearance (colour +
// watermark image) is deliberately narrower than that: Iain's ask
// (2026-07-24) was "Admins and Club Contact/Owners", not event coordinators
// -- being EC for one event in a club shouldn't hand you control over the
// club's branding.
export async function requireAdminOrClubOwner(req, clubId) {
  const token = (req.headers.get("authorization") || req.headers.get("Authorization") || "").replace("Bearer ", "")
  if (!token) return { error: "Unauthenticated", status: 401 }
  const { data: { user } } = await supa.auth.getUser(token)
  if (!user) return { error: "Unauthenticated", status: 401 }
  const { data: member } = await supa.from("members").select("id, is_admin").eq("auth_id", user.id).maybeSingle()
  if (!member) return { error: "Member not found", status: 403 }
  if (member.is_admin) return { member }
  const { data: owner } = await supa.from("space_owners")
    .select("id").eq("context_type", "club").eq("context_key", clubId).eq("member_id", member.id).maybeSingle()
  if (owner) return { member }
  return { error: "Admins and this club's owners only", status: 403 }
}
