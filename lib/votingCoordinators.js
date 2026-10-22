import { supabaseAdmin } from "@/lib/supabaseAdmin"

// Voting coordinators (139_voting_coordinators_and_choice_images.sql).
// Same shape as survey_coordinators / event_coordinators: active rows have
// replaced_at IS NULL; a change soft-replaces rather than deletes.
// voting_events.coordinator_id is no longer read anywhere.

// Active coordinator member ids for one vote.
export async function votingCoordinatorIds(votingEventId) {
  const { data } = await supabaseAdmin.from("voting_coordinators")
    .select("member_id").eq("voting_event_id", votingEventId).is("replaced_at", null)
  return (data || []).map(r => r.member_id)
}

// { [voting_event_id]: [{ id, name }] } for many votes, names sorted A-Z.
export async function votingCoordinatorsByEvent(eventIds) {
  const out = {}
  if (!eventIds?.length) return out
  const { data } = await supabaseAdmin.from("voting_coordinators")
    .select("voting_event_id, member:members!member_id(id, name)")
    .in("voting_event_id", eventIds).is("replaced_at", null)
  for (const row of data || []) {
    if (!row.member) continue
    ;(out[row.voting_event_id] ||= []).push({ id: row.member.id, name: row.member.name })
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => (a.name || "").localeCompare(b.name || ""))
  return out
}

// Make the active set exactly `memberIds`: soft-replace anyone dropped,
// insert anyone new. Returns an error message or null.
export async function setVotingCoordinators(votingEventId, memberIds, byMemberId) {
  const current = await votingCoordinatorIds(votingEventId)
  const removed = current.filter(id => !memberIds.includes(id))
  const added = memberIds.filter(id => !current.includes(id))
  if (removed.length) {
    const { error } = await supabaseAdmin.from("voting_coordinators")
      .update({ replaced_at: new Date().toISOString(), replaced_by: byMemberId || null })
      .eq("voting_event_id", votingEventId).in("member_id", removed).is("replaced_at", null)
    if (error) return error.message
  }
  if (added.length) {
    const { error } = await supabaseAdmin.from("voting_coordinators")
      .insert(added.map(member_id => ({ voting_event_id: votingEventId, member_id, assigned_by: byMemberId || null })))
    if (error) return error.message
  }
  return null
}
