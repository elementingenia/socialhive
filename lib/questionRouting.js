import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { loginMemberIds, isCategoryAskable } from "@/lib/categoryQuestions"

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

// ─── Contact categories ──────────────────────────────────────────────────────
// A question can be addressed to a Contacts category (e.g. "Committee").
// context_key is the contact_categories.id as text, same as clubs.
//
// IMPORTANT (scope §3): the recipient set is members with an APP LOGIN, not
// everyone tagged in the category. Several real residents (Lyn, Geoff, Diane,
// ...) exist only as `contacts` rows with member_id = null -- they are genuine
// residents but have no account, so they can neither receive nor answer an
// in-app question. Routing to them would silently fall through to the admin
// fallback below and the asker would never know.
//
// Deliberately three plain queries rather than one embedded/dotted-path
// PostgREST filter: embedded-resource filters have already proven unreliable
// from a deployed route in this codebase (see the long comment in
// app/api/cron/book-return-check/route.js). These are all tiny result sets.
export async function categoryMemberIds(categoryId) {
  const { data: links } = await supabaseAdmin.from("contact_category_members")
    .select("contact_id").eq("category_id", String(categoryId))
  const contactIds = (links || []).map(l => l.contact_id)
  if (!contactIds.length) return []

  const { data: contacts } = await supabaseAdmin.from("contacts")
    .select("member_id, active").in("id", contactIds)
  const linked = loginMemberIds(contacts || [])
  if (!linked.length) return []

  const { data: active } = await supabaseAdmin.from("members")
    .select("id").in("id", linked).eq("status", "active")
  return loginMemberIds(contacts || [], (active || []).map(m => m.id))
}

// Categories a resident may actually send a question to. Two independent
// conditions, both required:
//   1. askable = true  -- admin policy (migration 065; Residents is false
//      because it is a directory of everyone, not an accountable group)
//   2. >= 1 active member with a login -- otherwise there is nobody to answer
// Returns [{ id, name, memberIds }]. A category failing either test is never
// offered and never accepted, so the picker can't present a dead end.
export async function askableCategories() {
  const { data: cats } = await supabaseAdmin.from("contact_categories")
    .select("id, name, display_order").eq("active", true).eq("askable", true)
    .order("display_order")
  if (!cats?.length) return []

  // Batched on purpose. This used to loop categoryMemberIds() per category --
  // 3 round-trips each, ~15 sequential queries in total, which showed up as a
  // ~5s wait the first time Home's picker opened (Iain, 2026-07-27). Now four
  // flat queries regardless of how many categories exist.
  const catIds = cats.map(c => c.id)
  const { data: links } = await supabaseAdmin.from("contact_category_members")
    .select("contact_id, category_id").in("category_id", catIds)
  const contactIds = [...new Set((links || []).map(l => l.contact_id))]
  if (!contactIds.length) return []

  const { data: contacts } = await supabaseAdmin.from("contacts")
    .select("id, member_id, active").in("id", contactIds)
  const byContact = Object.fromEntries((contacts || []).map(c => [c.id, c]))

  const candidateIds = loginMemberIds(contacts || [])
  if (!candidateIds.length) return []
  const { data: active } = await supabaseAdmin.from("members")
    .select("id").in("id", candidateIds).eq("status", "active")
  const activeIds = (active || []).map(m => m.id)

  const out = []
  for (const c of cats) {
    const rows = (links || [])
      .filter(l => String(l.category_id) === String(c.id))
      .map(l => byContact[l.contact_id])
      .filter(Boolean)
    const memberIds = loginMemberIds(rows, activeIds)
    if (isCategoryAskable({ ...c, active: true, askable: true }, memberIds)) {
      out.push({ id: String(c.id), name: c.name, memberIds })
    }
  }
  return out
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
  } else if (contextType === "category") {
    ids = await categoryMemberIds(contextKey)
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
  if (contextType === "category") {
    const { data } = await supabaseAdmin.from("contact_categories").select("name").eq("id", contextKey).single()
    return data?.name || "a contact group"
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
  // Keyed off CURRENT category membership, not askability -- if an admin later
  // flips a category to askable = false, its existing questions must stay
  // answerable by the people they were sent to.
  if (q.context_type === "category") return (await categoryMemberIds(q.context_key)).includes(member.id)
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

  const [{ data: hubRows }, { data: clubRows }, { data: ecRows }, { data: myContact }] = await Promise.all([
    supabaseAdmin.from("space_owners").select("context_key").eq("context_type", "hub").eq("member_id", member.id),
    supabaseAdmin.from("space_owners").select("context_key").eq("context_type", "club").eq("member_id", member.id),
    supabaseAdmin.from("event_coordinators").select("event_id").eq("member_id", member.id).is("replaced_at", null),
    supabaseAdmin.from("contacts").select("id, active").eq("member_id", member.id).maybeSingle(),
  ])
  const myHubKeys = (hubRows || []).map(r => r.context_key)
  const myClubIds = (clubRows || []).map(r => r.context_key)
  const myEcEventIds = (ecRows || []).map(r => r.event_id)

  // Contact categories I belong to, via my linked contacts row. A member only
  // has one if an admin has ever edited their card (migration 030) -- no row
  // simply means no extra categories, which is the common case.
  let myCategoryIds = []
  if (myContact?.id && myContact.active) {
    const { data: catRows } = await supabaseAdmin.from("contact_category_members")
      .select("category_id").eq("contact_id", myContact.id)
    myCategoryIds = (catRows || []).map(r => String(r.category_id))
  }

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
    (q.context_type === "hub"      && myHubKeys.includes(q.context_key)) ||
    (q.context_type === "club"     && myClubIds.includes(q.context_key)) ||
    (q.context_type === "event"    && myEventIds.includes(q.context_key)) ||
    (q.context_type === "category" && myCategoryIds.includes(q.context_key))
  )
}
