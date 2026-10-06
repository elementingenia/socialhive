import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { resolveMember } from "@/lib/areaAuth"
import { notify } from "@/lib/notify"
import { resolveMemberName } from "@/lib/memberName"
import { withStreetNames } from "@/lib/streetsServer"
import { eventDeepLink } from "@/lib/eventNav"
import { canInviteToEvent, planInvites, inviteMessage, isInviteExcluded, isNotSignedIn, INVITE_CAP_PER_SENDER } from "@/lib/eventInvites"

export const dynamic = "force-dynamic"

// Invite a Neighbour (Iain, 2026-10-02). Any signed-in resident can invite
// other residents to an upcoming event. Fixed wording, no free text.
// Guards: once per resident per event (by anyone -- event_invites UNIQUE),
// max 10 per sender per event, never yourself / someone already booked /
// a test account. Residents who have never signed in are offered too, flagged
// not_signed_in so the picker greys them out (Iain, 2026-10-07): the invite
// sits in their alerts until their first sign-in. A Private (hide_name) resident is only
// offered to admins -- to anyone else they'd just show as "Resident",
// which is no use in a picker and would undercut their privacy choice.

const EVENT_FIELDS = "id, title, event_date, event_time, archived, reservation_cutoff, booking_required, hub_type, club_id, club:clubs!club_id(slug)"

async function loadContext(eventId, member) {
  const { data: event } = await supa.from("events").select(EVENT_FIELDS).eq("id", eventId).maybeSingle()
  if (!event) return { error: "Event not found", status: 404 }

  const [{ data: members }, { data: bookings }, { data: invites }] = await Promise.all([
    supa.from("members").select("id, name, display_name, hide_name, house_number, street_id, status, auth_id, is_test"),
    supa.from("bookings").select("member_id").eq("event_id", eventId).neq("status", "cancelled"),
    supa.from("event_invites").select("to_member_id, from_member_id").eq("event_id", eventId),
  ])
  const ineligibleIds = (members || [])
    .filter(m => isInviteExcluded(m, !!member.is_admin))
    .map(m => m.id)
  return {
    event,
    members: members || [],
    ineligibleIds,
    bookedIds: (bookings || []).map(b => b.member_id).filter(Boolean),
    alreadyInvitedIds: (invites || []).map(i => i.to_member_id),
    senderSentCount: (invites || []).filter(i => i.from_member_id === member.id).length,
  }
}

// GET ?event_id= -- who this resident can still invite, and how many invites
// they have left for this event.
export async function GET(req) {
  const { error, status, member } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })
  const eventId = new URL(req.url).searchParams.get("event_id")
  if (!eventId) return NextResponse.json({ error: "event_id required" }, { status: 400 })

  const ctx = await loadContext(eventId, member)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  if (!canInviteToEvent(ctx.event)) return NextResponse.json({ open: false, candidates: [], remaining: 0 })

  const blocked = new Set([...ctx.ineligibleIds, ...ctx.bookedIds, ...ctx.alreadyInvitedIds, member.id])
  const candidates = (await withStreetNames(supa, ctx.members.filter(m => !blocked.has(m.id))))
    .map(m => ({ id: m.id, name: resolveMemberName(m, { canManage: !!member.is_admin }), house_number: m.house_number || null, street_name: m.street_name || null, not_signed_in: isNotSignedIn(m) }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({
    open: true,
    candidates,
    remaining: Math.max(0, INVITE_CAP_PER_SENDER - ctx.senderSentCount),
    cap: INVITE_CAP_PER_SENDER,
  })
}

// POST { event_id, member_ids: [] }
export async function POST(req) {
  const { error, status, member } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })
  const body = await req.json().catch(() => ({}))
  const { event_id, member_ids } = body
  if (!event_id || !Array.isArray(member_ids) || member_ids.length === 0) {
    return NextResponse.json({ error: "Pick at least one neighbour to invite" }, { status: 400 })
  }

  const ctx = await loadContext(event_id, member)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  if (!canInviteToEvent(ctx.event)) {
    return NextResponse.json({ error: "This event isn't taking invites any more" }, { status: 409 })
  }

  const plan = planInvites({
    requestedIds: member_ids,
    senderId: member.id,
    ineligibleIds: ctx.ineligibleIds,
    bookedIds: ctx.bookedIds,
    alreadyInvitedIds: ctx.alreadyInvitedIds,
    senderSentCount: ctx.senderSentCount,
  })
  if (plan.toInvite.length === 0) {
    return NextResponse.json({
      error: plan.capReached ? `You've used all ${INVITE_CAP_PER_SENDER} invites for this event` : "Everyone you picked is already booked or invited",
    }, { status: 409 })
  }

  // ignoreDuplicates: if two people invite the same neighbour at the same
  // moment, the UNIQUE constraint keeps one row and we only notify for rows
  // actually inserted.
  const { data: inserted, error: insErr } = await supa.from("event_invites")
    .upsert(plan.toInvite.map(id => ({ event_id, from_member_id: member.id, to_member_id: id })),
      { onConflict: "event_id,to_member_id", ignoreDuplicates: true })
    .select("to_member_id")
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  const sender = ctx.members.find(m => m.id === member.id)
  const msg = inviteMessage(resolveMemberName(sender, { fallback: "A neighbour" }), ctx.event.title)
  const url = eventDeepLink({ hubType: ctx.event.hub_type, eventId: ctx.event.id, clubId: ctx.event.club_id, clubSlug: ctx.event.club?.slug })
  const sentTo = (inserted || []).map(r => r.to_member_id)
  await Promise.all(sentTo.map(id => notify(id, ctx.event.id, "event_invite", msg, url, member.id)))

  return NextResponse.json({ ok: true, sent: sentTo.length, skipped: member_ids.length - sentTo.length, remaining: plan.remaining })
}
