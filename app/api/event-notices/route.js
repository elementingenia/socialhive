import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notify } from "@/lib/notify"
import { resolveMember, requireEventManage } from "@/lib/areaAuth"
import { eventDeepLink } from "@/lib/eventNav"
import {
  ACTIVE_BOOKING_STATUSES, eventNoticeMessage, eventNoticeRecipients,
  viewableEventIds, eventTakesNotices,
} from "@/lib/eventNotices"

export const dynamic = "force-dynamic"

// Event notices (Iain, 2026-10-06) -- a coordinator's message to the people
// attending ONE event (confirmed + waitlisted, plus residents named in a
// party). The table (130_event_notices.sql) has no client read policy:
// notices are only for that event's attendees and its managers, so reads go
// through GET here too.
//
// Managing (post / edit / remove) uses requireEventManage: admin, the area's
// Owner, or this event's own coordinator. Edits do not re-notify (same
// reasoning as hub notices / BUG-058).

const MAX_EVENTS_PER_GET = 60

// Which of these events can this member manage? Batched version of
// requireEventManage for the list view.
async function managedEventIds(member, events) {
  if (member.is_admin) return events.map(e => e.id)
  const ids = events.map(e => e.id)
  const [{ data: owners }, { data: ecs }] = await Promise.all([
    supa.from("space_owners").select("context_type, context_key").eq("member_id", member.id),
    supa.from("event_coordinators").select("event_id").eq("member_id", member.id).is("replaced_at", null).in("event_id", ids),
  ])
  const ownerKeys = new Set((owners || []).map(o => `${o.context_type}:${o.context_key}`))
  const ecIds = new Set((ecs || []).map(r => r.event_id))
  return events.filter(e =>
    ecIds.has(e.id) ||
    ownerKeys.has(e.club_id ? `club:${e.club_id}` : `hub:${e.hub_type}`)
  ).map(e => e.id)
}

// Which of these events is this member attending (own active booking, or
// named in an active party)?
async function attendingEventIds(memberId, ids) {
  const [{ data: own }, { data: party }] = await Promise.all([
    supa.from("bookings").select("event_id").eq("member_id", memberId)
      .in("status", ACTIVE_BOOKING_STATUSES).in("event_id", ids),
    supa.from("booking_attendees").select("event_id, owner_id, owner_contact_id")
      .eq("member_id", memberId).in("event_id", ids),
  ])
  const out = new Set((own || []).map(b => b.event_id))
  const partyRows = (party || []).filter(p => !out.has(p.event_id))
  if (partyRows.length) {
    const { data: ownerBookings } = await supa.from("bookings")
      .select("event_id, member_id, contact_id")
      .in("event_id", [...new Set(partyRows.map(p => p.event_id))])
      .in("status", ACTIVE_BOOKING_STATUSES)
    const active = new Set((ownerBookings || []).map(b =>
      `${b.event_id}:${b.member_id || ""}:${b.contact_id || ""}`))
    for (const p of partyRows) {
      if (active.has(`${p.event_id}:${p.owner_id || ""}:`) ||
          active.has(`${p.event_id}::${p.owner_contact_id || ""}`)) out.add(p.event_id)
    }
  }
  return [...out]
}

// GET /api/event-notices?event_ids=a,b,c
// -> { byEvent: { [eventId]: { notices: [...], canPost: bool } } }
// Events the viewer can neither manage nor is attending come back empty.
export async function GET(req) {
  const { error, status, member } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })

  const raw = new URL(req.url).searchParams.get("event_ids") || ""
  const ids = [...new Set(raw.split(",").map(s => s.trim()).filter(Boolean))].slice(0, MAX_EVENTS_PER_GET)
  if (!ids.length) return NextResponse.json({ byEvent: {} })

  const { data: events } = await supa.from("events").select("id, hub_type, club_id, booking_required").in("id", ids)
  const evs = events || []
  const [managed, attending] = await Promise.all([
    managedEventIds(member, evs),
    attendingEventIds(member.id, evs.map(e => e.id)),
  ])
  const managedSet = new Set(managed)
  const viewable = viewableEventIds(evs.map(e => e.id), managed, attending)

  let notices = []
  if (viewable.size) {
    const { data } = await supa.from("event_notices")
      .select("id, event_id, content, created_at, updated_at")
      .in("event_id", [...viewable]).eq("archived", false)
      .order("created_at", { ascending: false })
    notices = data || []
  }

  const byEvent = {}
  for (const e of evs) {
    byEvent[e.id] = {
      canPost: managedSet.has(e.id) && eventTakesNotices(e),
      notices: viewable.has(e.id) ? notices.filter(n => n.event_id === e.id) : [],
    }
  }
  return NextResponse.json({ byEvent })
}

// POST { event_id, content } -- post + notify every attendee.
export async function POST(req) {
  const { event_id, content } = await req.json().catch(() => ({}))
  if (!event_id || !content?.trim()) {
    return NextResponse.json({ error: "event_id and content required" }, { status: 400 })
  }

  const { error, status, member } = await requireEventManage(req, event_id)
  if (error) return NextResponse.json({ error }, { status })

  const { data: event } = await supa.from("events")
    .select("id, title, hub_type, club_id, booking_required, club:clubs!club_id(slug)")
    .eq("id", event_id).maybeSingle()
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 })
  if (!eventTakesNotices(event)) {
    return NextResponse.json({ error: "This event has no bookings, so there's no one to send a notice to" }, { status: 400 })
  }

  const { data: notice, error: insError } = await supa.from("event_notices")
    .insert({ event_id, content: content.trim(), created_by: member.id })
    .select("id").single()
  if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })

  const [{ data: bookings }, { data: party }] = await Promise.all([
    supa.from("bookings").select("member_id, contact_id, status").eq("event_id", event_id),
    supa.from("booking_attendees").select("owner_id, owner_contact_id, member_id, contact_id").eq("event_id", event_id),
  ])
  const { memberIds, noAppCount } = eventNoticeRecipients(bookings, party, member.id)

  const msg = eventNoticeMessage(event.title, content)
  const url = eventDeepLink({ hubType: event.hub_type, eventId: event.id, clubId: event.club_id, clubSlug: event.club?.slug })
  await Promise.all(memberIds.map(id => notify(id, event_id, "event_notice_posted", msg, url, member.id)))

  return NextResponse.json({ ok: true, id: notice.id, notified: memberIds.length, noApp: noAppCount })
}

async function loadNoticeForManage(req, id) {
  const { data: existing } = await supa.from("event_notices").select("event_id, archived").eq("id", id).maybeSingle()
  if (!existing || existing.archived) return { error: "Notice not found", status: 404 }
  const auth = await requireEventManage(req, existing.event_id)
  if (auth.error) return auth
  return { existing }
}

// PATCH { id, content } -- edit quietly (no re-notify).
export async function PATCH(req) {
  const { id, content } = await req.json().catch(() => ({}))
  if (!id || !content?.trim()) return NextResponse.json({ error: "id and content required" }, { status: 400 })

  const { error, status } = await loadNoticeForManage(req, id)
  if (error) return NextResponse.json({ error }, { status })

  const { error: updError } = await supa.from("event_notices")
    .update({ content: content.trim(), updated_at: new Date().toISOString() }).eq("id", id)
  if (updError) return NextResponse.json({ error: updError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE { id } -- remove from the event (soft: archived).
export async function DELETE(req) {
  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { error, status } = await loadNoticeForManage(req, id)
  if (error) return NextResponse.json({ error }, { status })

  const { error: delError } = await supa.from("event_notices").update({ archived: true }).eq("id", id)
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
