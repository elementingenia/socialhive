// Server-only fan-out helpers for "new event" notifications (Iain 2026-07-18).
// Each routes recipients through lib/notify.js so a push goes out with the
// in-app row. The author/creator is excluded — you don't alert yourself about
// the event you just made.
import { notify } from "@/lib/notify"
// Pure exclusion logic lives in its own dependency-free module so it can be
// unit-tested under plain Node (tests/unit/committee.test.mjs) -- this file
// itself can't be imported there, since "@/lib/notify" only resolves under
// Next.js's own module resolution. Re-exported here too so existing/future
// callers can keep importing it from lib/notifyAudience.js.
import { excludeOptedOut } from "@/lib/committeeAudience"
export { excludeOptedOut }

async function fanOut(memberIds, event_id, type, message, excludeMemberId, url) {
  const ids = [...new Set((memberIds || []).filter(id => id && id !== excludeMemberId))]
  if (!ids.length) return 0
  await Promise.all(ids.map(id => notify(id, event_id, type, message, url)))
  return ids.length
}

// Social: the whole community (every active member).
export async function notifyAllActiveMembers(supabaseAdmin, event_id, type, message, { excludeMemberId } = {}) {
  const { data } = await supabaseAdmin.from("members").select("id").eq("status", "active")
  return fanOut((data || []).map(m => m.id), event_id, type, message, excludeMemberId)
}

// Movies (or any hub): members who follow that hub.
export async function notifyHubFollowers(supabaseAdmin, hub_type, event_id, type, message, { excludeMemberId } = {}) {
  const { data } = await supabaseAdmin.from("hub_followers").select("member_id").eq("hub_type", hub_type)
  return fanOut((data || []).map(m => m.member_id), event_id, type, message, excludeMemberId)
}

// Clubs: members who have joined that club.
export async function notifyClubMembers(supabaseAdmin, club_id, event_id, type, message, { excludeMemberId } = {}) {
  const { data } = await supabaseAdmin.from("club_members").select("member_id").eq("club_id", club_id)
  return fanOut((data || []).map(m => m.member_id), event_id, type, message, excludeMemberId)
}

// Committee: every active member EXCEPT those who have opted out
// (committee_notification_optouts) -- broadcast-by-default, opt-out, the
// deliberate inverse of every helper above (decision 3, migration 097).
export async function notifyCommitteeSubscribers(supabaseAdmin, event_id, type, message, url, { excludeMemberId } = {}) {
  const [{ data: active }, { data: optedOut }] = await Promise.all([
    supabaseAdmin.from("members").select("id").eq("status", "active"),
    supabaseAdmin.from("committee_notification_optouts").select("member_id"),
  ])
  const ids = excludeOptedOut((active || []).map(m => m.id), (optedOut || []).map(o => o.member_id))
  return fanOut(ids, event_id, type, message, excludeMemberId, url)
}
