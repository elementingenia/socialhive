import { supabaseAdmin } from "@/lib/supabaseAdmin"

// Server-side routing/eligibility for In-App Questions (see
// Social_Hive_Questions_Scope.md). All exported helpers use the service-role
// client; never call these from the browser.

export const HUB_LABELS = { movie: "Movies", social: "Social" }

export async function getAdminIds() {
  const { data } = await supabaseAdmin.from("members").select("id").eq("is_admin", true)
  return (data || []).map(m => m.id)
}

async function hubOwnerIds(hubKey) {
  const { data } = await supabaseAdmin.from("space_owners")
    .select("member_id").eq("context_type", "hub").eq("context_key", hubKey)
  return (data || []).map(r => r.member_id)
}

async function clubOwnerIds(clubId) {
  const { data } = await supabaseAdmin.from("space_owners")
    .select("member_id").eq("context_type", "club").eq("context_key", String(clubId))
  return (data || []).map(r => r.member_id)
}

async function eventECIds(eventId) {
  const { data } = await supabaseAdmin.from("event_coordinators")
    .select("member_id").eq("event_id", eventId).is("replaced_at", null)
  return (data || []).map(r => r.member_id)
}

async function eventParentOwnerIds(eventId) {
  const { data: ev } = await supabaseAdmin.from("events")
    .select("club_id, hub_type").eq("id", eventId).single()
  if (!ev) return []
  if (ev.club_id) return clubOwnerIds(ev.club_id)
  return hubOwnerIds(ev.hub_type)   // 'movie' | 'social'
}

// Who gets notified when a question is asked (and who may answer it). Falls
// back to admins so a question can never be unroutable.
export async function primaryAnswererIds(contextType, contextKey) {
  let ids = []
  if (contextType === "general") {
    ids = await getAdminIds()
  } else if (contextType === "hub") {
    ids = await hubOwnerIds(contextKey)
  } else if (contextType === "club") {
    ids = await clubOwnerIds(contextKey)
  } else if (contextType === "event") {
    ids = await eventECIds(contextKey)
    if (ids.length === 0) ids = await eventParentOwnerIds(contextKey)
  }
  if (ids.length === 0) ids = await getAdminIds()
  return [...new Set(ids)]
}

export async function contextLabel(contextType, contextKey) {
  if (contextType === "general") return "the Hive"
  if (contextType === "hub") return HUB_LABELS[contextKey] || "a hub"
  if (contextType === "club") {
    const { data } = await supabaseAdmin.from("clubs").select("name").eq("id", contextKey).single()
    return data?.name || "a club"
  }
  if (contextType === "event") {
    const { data } = await supabaseAdmin.from("events").select("title").eq("id", contextKey).single()
    return data?.title || "an event"
  }
  return "the Hive"
}

// Can this member view/answer this question? Admins always can (oversight).
export async function canAnswer(member, q) {
  if (member.is_admin) return true
  if (q.context_type === "general") return false // only admins
  if (q.context_type === "hub")  return (await hubOwnerIds(q.context_key)).includes(member.id)
  if (q.context_type === "club") return (await clubOwnerIds(q.context_key)).includes(member.id)
  if (q.context_type === "event") {
    const ec = await eventECIds(q.context_key)
    if (ec.includes(member.id)) return true
    return (await eventParentOwnerIds(q.context_key)).includes(member.id)
  }
  return false
}

// The set of questions a member is responsible for answering (their "To answer"
// box). Admins see everything; others see their hubs, their clubs, and events
// they EC or whose club/hub they own.
export async function answeringBoxQuestions(member) {
  if (member.is_admin) {
    const { data } = await supabaseAdmin.from("questions").select("*").order("updated_at", { ascending: false })
    return data || []
  }

  const [{ data: hubRows }, { data: clubRows }, { data: ecRows }] = await Promise.all([
    supabaseAdmin.from("space_owners").select("context_key").eq("context_type", "hub").eq("member_id", member.id),
    supabaseAdmin.from("space_owners").select("context_key").eq("context_type", "club").eq("member_id", member.id),
    supabaseAdmin.from("event_coordinators").select("event_id").eq("member_id", member.id).is("replaced_at", null),
  ])
  const myHubKeys = (hubRows || []).map(r => r.context_key)
  const myClubIds = (clubRows || []).map(r => r.context_key)
  const myEcEventIds = (ecRows || []).map(r => r.event_id)

  // Events I own via being a club/hub owner (oversight of that space's events).
  let ownedEventIds = []
  if (myClubIds.length || myHubKeys.length) {
    const { data: evs } = await supabaseAdmin.from("events")
      .select("id, club_id, hub_type")
    ownedEventIds = (evs || [])
      .filter(e => (e.club_id && myClubIds.includes(String(e.club_id))) || (!e.club_id && myHubKeys.includes(e.hub_type)))
      .map(e => e.id)
  }
  const myEventIds = [...new Set([...myEcEventIds, ...ownedEventIds])]

  const { data: all } = await supabaseAdmin.from("questions").select("*").order("updated_at", { ascending: false })
  return (all || []).filter(q =>
    (q.context_type === "hub"   && myHubKeys.includes(q.context_key)) ||
    (q.context_type === "club"  && myClubIds.includes(q.context_key)) ||
    (q.context_type === "event" && myEventIds.includes(q.context_key))
  )
}
