import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"

// Shared "Owner" eligibility model — added 2026-08-10 per Iain: an Owner of a
// Hub (Show Time/Movies, Social) or a Group/Club should get the same
// create/edit/manage-event and EC-view options an admin has, but scoped to
// that one area only. The primitive this rides on (space_owners) already
// existed for the In-App Questions feature (migration 053) — this is the
// first thing to actually gate PERMISSIONS on it rather than just routing/
// display. Club events already checked space_owners ad hoc in three
// different places (app/api/clubs/events/route.js, app/api/series/route.js,
// lib/clubAuth.js) with copy-pasted queries — centralised here so hub routes
// can share the same check instead of drifting the way promoteWaitlist did
// (see session_summary_2026-07-15.md).
//
// contextType: 'hub' | 'club'
// contextKey:  'movie' | 'social' for a hub, or the club's id (string) for a club

async function resolveMember(req) {
  const token = (req.headers.get("authorization") || req.headers.get("Authorization") || "").replace("Bearer ", "")
  if (!token) return { error: "Unauthenticated", status: 401 }
  const { data: { user }, error: ue } = await supa.auth.getUser(token)
  if (ue || !user) return { error: "Unauthenticated", status: 401 }
  const { data: member } = await supa.from("members").select("id, is_admin").eq("auth_id", user.id).maybeSingle()
  if (!member) return { error: "Member not found", status: 403 }
  return { member }
}

export async function isAreaOwner(memberId, contextType, contextKey) {
  if (!memberId || !contextType || !contextKey) return false
  const { data } = await supa.from("space_owners")
    .select("id").eq("context_type", contextType).eq("context_key", String(contextKey)).eq("member_id", memberId).maybeSingle()
  return !!data
}

// Admin OR owner of the given hub/club. No event exists yet (or the action is
// area-wide, not tied to one event) — use for creating a new event, or for
// any area-wide action like appearance.
export async function requireAdminOrAreaOwner(req, contextType, contextKey) {
  const { error, status, member } = await resolveMember(req)
  if (error) return { error, status }
  if (member.is_admin) return { member }
  if (await isAreaOwner(member.id, contextType, contextKey)) return { member }
  return { error: "Admins and this area's owners only", status: 403 }
}

// Admin OR owner of the event's own hub/club OR this specific event's
// assigned EC. Looks the event up to resolve its area. Use for
// editing/cancelling/managing an EXISTING event (including the EC/attendee
// panel) — this is what makes EC view "area-wide" for an Owner instead of
// requiring them to be individually added as coordinator on every event.
export async function requireEventManage(req, eventId) {
  const { error, status, member } = await resolveMember(req)
  if (error) return { error, status }
  if (member.is_admin) return { member }

  const { data: event } = await supa.from("events").select("id, hub_type, club_id").eq("id", eventId).maybeSingle()
  if (!event) return { error: "Event not found", status: 404 }

  const contextType = event.club_id ? "club" : "hub"
  const contextKey = event.club_id ? event.club_id : event.hub_type
  if (await isAreaOwner(member.id, contextType, contextKey)) return { member }

  const { data: ec } = await supa.from("event_coordinators")
    .select("id").eq("event_id", eventId).eq("member_id", member.id).is("replaced_at", null).maybeSingle()
  if (ec) return { member }

  return { error: "Not allowed to manage this event", status: 403 }
}
