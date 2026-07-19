// Server-only fan-out helpers for "new event" notifications (Iain 2026-07-18).
// Each routes recipients through lib/notify.js so a push goes out with the
// in-app row. The author/creator is excluded — you don't alert yourself about
// the event you just made.
import { notify } from "@/lib/notify"

async function fanOut(memberIds, event_id, type, message, excludeMemberId) {
  const ids = [...new Set((memberIds || []).filter(id => id && id !== excludeMemberId))]
  if (!ids.length) return 0
  await Promise.all(ids.map(id => notify(id, event_id, type, message)))
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
