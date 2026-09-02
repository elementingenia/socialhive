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

// Exported (not just used internally) as of the Voting hub (2026-09-02) --
// routes that need more than "admin yes/no" (e.g. house_number for
// per-household eligibility) call this directly rather than duplicating an
// auth resolver. Widened to select house_number at the same time; every
// existing caller destructures only member.id/member.is_admin, so this is
// additive and doesn't change any existing behaviour.
export async function resolveMember(req) {
  const token = (req.headers.get("authorization") || req.headers.get("Authorization") || "").replace("Bearer ", "")
  if (!token) return { error: "Unauthenticated", status: 401 }
  const { data: { user }, error: ue } = await supa.auth.getUser(token)
  if (ue || !user) return { error: "Unauthenticated", status: 401 }
  const { data: member } = await supa.from("members").select("id, is_admin, house_number").eq("auth_id", user.id).maybeSingle()
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

// Admin OR this hub's Owner OR the specific voting event's own assigned
// Coordinator (voting_events.coordinator_id) -- added for migration 089,
// Iain's 2026-09-02 review: "There is no event coordinator option which
// should be in scope." Mirrors requireEventManage's admin -> Owner -> EC
// shape above, but voting_events is its own table (no hub_type/club_id, no
// event_coordinators join row) so it can't reuse that function directly --
// the coordinator is a single nullable FK column on the row itself instead.
export async function requireVotingEventManage(req, eventId) {
  const { error, status, member } = await resolveMember(req)
  if (error) return { error, status }
  if (member.is_admin) return { member }
  if (await isAreaOwner(member.id, "hub", "voting")) return { member }

  const { data: event } = await supa.from("voting_events").select("id, coordinator_id").eq("id", eventId).maybeSingle()
  if (!event) return { error: "Voting event not found", status: 404 }
  if (event.coordinator_id && event.coordinator_id === member.id) return { member }

  return { error: "Admins, Voting Owners, or this event's coordinator only", status: 403 }
}

// Any authenticated resident, full stop -- no Owner concept, no admin gate.
// Used only by the Book a Space hub's create/edit route: unlike every other
// hub (Show Time/Social/Clubs), this one is deliberately open to any
// resident per Iain's explicit decision (Book_a_Space_Scope_v2.md,
// "Any resident can create one, no approval gate"). Kept as its own function
// rather than folded into requireAdminOrAreaOwner so that hub's much wider
// permission stays untouched and this hub's narrower one can't accidentally
// drift to match it later.
export async function requireResidentOrAdmin(req) {
  const { error, status, member } = await resolveMember(req)
  if (error) return { error, status }
  return { member }
}
