// Pure decision logic for "Ask a Contact Category" (scope §3).
//
// Deliberately separated from lib/questionRouting.js: that file does the
// service-role I/O, this one holds the rules. The rules are the part that can
// be silently wrong (and the part a future change is most likely to break), so
// they live somewhere a unit test can reach without a database.
// Tested in tests/unit/categoryQuestions.test.mjs.

// ── The login gate ───────────────────────────────────────────────────────────
// Given the `contacts` rows linked to a category, return the member ids that
// can actually RECEIVE a question.
//
// This is the crux of the whole feature. Several real residents (Lyn Smith,
// Geoff Smith, Diane, Tony, Simon Hughes, Chloe Hughes as of 2026-07-27) exist
// only as contacts rows with member_id = null. They are genuine residents and
// they ARE in the Residents category -- but they have no app account, so they
// can neither be notified nor answer. Routing to them would fall through to
// the admin fallback and the asker would believe they'd reached the group.
//
// Hence: membership of the Residents category is NOT the test. Having a login
// is. Because every member is implicitly a Resident (migration 029), this is a
// strict subset of the original rule -- it never blocks anything that rule
// allowed, it only closes the hole.
export function loginMemberIds(contactRows = [], activeMemberIds = null) {
  const ids = [...new Set(
    contactRows.filter(c => c && c.active && c.member_id).map(c => c.member_id)
  )]
  if (!activeMemberIds) return ids
  const active = new Set(activeMemberIds)
  return ids.filter(id => active.has(id))
}

// ── Is this category offerable as a question target? ─────────────────────────
// Three independent conditions, ALL required:
//   1. active   -- the category hasn't been retired
//   2. askable  -- admin policy (migration 065). Residents is false: it holds
//      every member, so asking it is a community broadcast with nobody
//      accountable. That belongs to the Community Notice Hub, not here.
//   3. >= 1 member with a login -- otherwise there is literally nobody to
//      answer, and the question would silently divert to admins.
// Condition 2 alone is not enough, which is why "Trades" (askable by default,
// but only Joshua the electrician, who has no login) is correctly never shown.
export function isCategoryAskable(category, memberIdsWithLogin = []) {
  if (!category) return false
  return !!category.active && !!category.askable && memberIdsWithLogin.length > 0
}

// ── External-contact display rule (a DIFFERENT question) ─────────────────────
// Whether a contact is shown as "External" in Info > Contacts is about
// community membership, not app accounts: someone outside the community
// (tradesperson, supplier, Community Manager). A resident with no login is
// still a neighbour and is NOT external -- they simply can't be messaged.
//
// Both rules are correct; they answer different questions. Keeping them in one
// file, next to each other, is the cheapest way to stop a future change
// collapsing them back into one.
export function isExternalContact(categoryIds = [], residentsCategoryId = null) {
  if (!residentsCategoryId) return false
  return !categoryIds.some(id => String(id) === String(residentsCategoryId))
}

// ── Recipient naming ─────────────────────────────────────────────────────────
// "Julie A, Anita J and 2 others". Naming who a question reaches is the single
// highest-value line in this feature (scope §8.1) -- the old copy ("it goes
// privately to the right contact") told the resident nothing.
export function recipientSummary(names = []) {
  const list = names.filter(Boolean)
  if (!list.length) return ""
  if (list.length === 1) return list[0]
  if (list.length === 2) return `${list[0]} and ${list[1]}`
  if (list.length === 3) return `${list[0]}, ${list[1]} and ${list[2]}`
  return `${list[0]}, ${list[1]} and ${list.length - 2} others`
}

// ── Name privacy for the recipient list ──────────────────────────────────────
// Same masking as the Contacts list: a Private (hide_name) resident reads as
// "Resident" to a non-admin, but always sees their own real name. Being a
// category answerer is a role, not a licence to unmask.
export function displayRecipientName(member, viewer) {
  if (!member) return null
  if (member.hide_name && !viewer?.is_admin && member.id !== viewer?.id) return "Resident"
  return member.name
}
