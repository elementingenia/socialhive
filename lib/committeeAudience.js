// Pure exclusion logic for the Committee broadcast-by-default, opt-out
// notification polarity (decision 3, supabase/migrations/097_committee_hub.sql).
// Kept dependency-free (no "@/..." imports) so it can be unit-tested under
// plain Node (tests/unit/committee.test.mjs), same reason lib/voting.js's
// computeVotingStatus() has none either.
//
// Given every active member id and every opted-out member id, returns the
// ids that should still be notified -- i.e. everyone EXCEPT those with an
// opt-out row. This is the inverse of every other audience helper in
// lib/notifyAudience.js (which select an opt-IN list); here, absence from
// the opt-out list is what means "still subscribed".
export function excludeOptedOut(activeMemberIds, optedOutMemberIds) {
  const optedOut = new Set(optedOutMemberIds || [])
  return [...new Set((activeMemberIds || []).filter(id => id && !optedOut.has(id)))]
}
