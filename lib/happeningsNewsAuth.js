import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { requireEventManage } from "@/lib/areaAuth"
import { isEventPast } from "@/lib/date"

// Posting/editing/deleting a Happenings News post rides on the SAME
// admin -> area-Owner -> this-event's-current-EC gate every other
// event-management action already uses (lib/areaAuth.js's
// requireEventManage) -- confirmed 2026-09-21 via direct repo research that
// event_coordinators is one shared, cross-hub primitive (Show Time, Social,
// Special Events, Groups & Clubs, Book a Space all participate identically),
// so no new auth primitive was needed here, only a new caller.
//
// The one extra rule Happenings News adds on top: you can only CREATE a
// post once the event has actually happened (Iain, 2026-09-21: "after it
// has ended" -- confirmed as "event date/time has passed", automatic, no
// manual step). Editing/deleting an existing post has no such gate -- if a
// post exists, the event was past when it was made.
export async function requireHappeningsNewsCreate(req, eventId) {
  const gate = await requireEventManage(req, eventId)
  if (gate.error) return gate

  const { data: event } = await supa.from("events").select("id, event_date, event_time").eq("id", eventId).maybeSingle()
  if (!event) return { error: "Event not found", status: 404 }
  if (!isEventPast(event)) {
    return { error: "You can only post about this event once it has ended.", status: 400 }
  }

  const { data: existing } = await supa.from("happenings_news_posts").select("id").eq("event_id", eventId).maybeSingle()
  if (existing) {
    return { error: "This event already has a Happenings News post -- edit the existing one instead.", status: 409 }
  }

  return gate
}

// Editing or deleting an EXISTING post -- same admin/Owner/EC gate, no
// event-ended check needed (the post already proves the event was past).
export async function requireHappeningsNewsManage(req, postId) {
  const { data: post } = await supa.from("happenings_news_posts").select("id, event_id").eq("id", postId).maybeSingle()
  if (!post) return { error: "Post not found", status: 404 }
  const gate = await requireEventManage(req, post.event_id)
  if (gate.error) return gate
  return { ...gate, post }
}
