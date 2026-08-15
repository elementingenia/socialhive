// Unit tests for lib/categoryQuestions.js -- the decision rules behind
// "Ask a Contact Category" (Social_Hive_Category_Questions_Scope.md).
//
// These rules are the part of the feature most likely to be silently wrong:
// the gate looks like a one-liner but conflates two genuinely different
// questions (who can RECEIVE a question vs who is EXTERNAL to the community),
// and getting it wrong doesn't throw -- it just quietly misroutes to admins.
// Fixtures below mirror real production data as of 2026-07-27.
import {
  loginMemberIds, isCategoryAskable, isExternalContact,
  recipientSummary, displayRecipientName,
} from '../../lib/categoryQuestions.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗', m)) }
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

const RESIDENTS = '4a8fb50d-557a-4a81-998c-58dc45888b0b'
const SOCIALHIVE = '5ca10ed3-9c27-43e3-b755-26085e5b7171'
const TRADES = '8cace631-cc1c-46ab-a6a2-f11b595daf44'

// ── loginMemberIds: the login gate ───────────────────────────────────────────
{
  // Real "Social Hive" category shape: 4 members with logins + Diane, a real
  // resident with no account.
  const rows = [
    { member_id: 'm-anita',  active: true },
    { member_id: 'm-janelle', active: true },
    { member_id: 'm-suzannah', active: true },
    { member_id: 'm-juliea', active: true },
    { member_id: null, active: true },            // Diane -- contact only
  ]
  eq(loginMemberIds(rows).sort(), ['m-anita', 'm-janelle', 'm-juliea', 'm-suzannah'],
     'login gate: contact-only residents are excluded, members kept')

  // Real "Trades" category: one external contact, no login.
  eq(loginMemberIds([{ member_id: null, active: true }]), [],
     'login gate: a category of only login-less contacts yields nobody')

  ok(loginMemberIds([]).length === 0, 'login gate: empty category yields nobody')

  eq(loginMemberIds([{ member_id: 'm-x', active: false }]), [],
     'login gate: an INACTIVE (hidden) contact row never counts')

  eq(loginMemberIds([{ member_id: 'm-x', active: true }, { member_id: 'm-x', active: true }]), ['m-x'],
     'login gate: duplicate contact rows for one member de-duplicate')

  // Second stage: member row must also be status=active. A deactivated
  // member's contacts row survives, so without this they'd still be notified.
  eq(loginMemberIds([{ member_id: 'm-a', active: true }, { member_id: 'm-gone', active: true }], ['m-a']),
     ['m-a'], 'login gate: members no longer active are dropped even if their contact row remains')

  eq(loginMemberIds([{ member_id: 'm-a', active: true }], []), [],
     'login gate: nobody active means nobody, not everybody')

  ok(loginMemberIds([null, undefined, { active: true }]).length === 0,
     'login gate: malformed rows are ignored rather than throwing')
}

// ── isCategoryAskable: all three conditions required ─────────────────────────
{
  ok(isCategoryAskable({ active: true, askable: true }, ['m-a']),
     'askable: active + askable + a login-holder = offerable')

  // Residents: askable=false by migration 065, even though it is full of members.
  ok(!isCategoryAskable({ active: true, askable: false }, ['m-a', 'm-b', 'm-c']),
     'askable: Residents (askable=false) is never offerable despite having members')

  // Trades: askable defaults true, but nobody has a login. This is the case
  // Iain's original rule would have let through.
  ok(!isCategoryAskable({ active: true, askable: true }, []),
     'askable: a category with no login-holders is NOT offerable (the hole in the original rule)')

  ok(!isCategoryAskable({ active: false, askable: true }, ['m-a']),
     'askable: a retired category is never offerable')

  ok(!isCategoryAskable(null, ['m-a']), 'askable: missing category is not offerable')
  ok(!isCategoryAskable(undefined, []), 'askable: undefined category does not throw')

  // Empty "Committee" -- exists, askable, but nobody in it yet.
  ok(!isCategoryAskable({ active: true, askable: true }, []),
     'askable: an empty category (real Committee state) is not offerable')
}

// ── isExternalContact: a DIFFERENT question from the gate above ──────────────
{
  ok(isExternalContact([TRADES], RESIDENTS),
     'external: a Trades-only contact (Joshua the electrician) is external')

  ok(!isExternalContact([RESIDENTS], RESIDENTS),
     'external: Lyn/Geoff/Diane -- residents with NO login -- are NOT external')

  ok(!isExternalContact([RESIDENTS, SOCIALHIVE], RESIDENTS),
     'external: a resident who is also on a committee is not external')

  ok(!isExternalContact([], null),
     'external: with no Residents category resolved yet, nothing is marked external (no flash of wrong state)')

  ok(isExternalContact([String(TRADES)], RESIDENTS),
     'external: id comparison is string-safe')

  // The distinction this whole file exists to protect: someone can be
  // un-askable (no login) yet not external (a real neighbour).
  const dianeCategories = [RESIDENTS]
  ok(!isExternalContact(dianeCategories, RESIDENTS) && loginMemberIds([{ member_id: null, active: true }]).length === 0,
     'the two rules are independent: Diane is not external AND cannot receive a question')
}

// ── recipientSummary ─────────────────────────────────────────────────────────
{
  eq(recipientSummary([]), '', 'summary: empty list renders nothing (no dangling "Goes to")')
  eq(recipientSummary(['Julie A']), 'Julie A', 'summary: one name')
  eq(recipientSummary(['Julie A', 'Anita J']), 'Julie A and Anita J', 'summary: two names')
  eq(recipientSummary(['Julie A', 'Anita J', 'Sue B']), 'Julie A, Anita J and Sue B', 'summary: three names listed in full')
  eq(recipientSummary(['Julie A', 'Anita J', 'Sue B', 'Ann C']), 'Julie A, Anita J and 2 others', 'summary: four names collapse to "and 2 others"')
  eq(recipientSummary(['A', 'B', 'C', 'D', 'E', 'F']), 'A, B and 4 others', 'summary: six names collapse correctly')
  eq(recipientSummary([null, 'Julie A', undefined]), 'Julie A', 'summary: unresolved names are dropped, not rendered as "null"')
}

// ── displayRecipientName: privacy ────────────────────────────────────────────
{
  const priv = { id: 'm-priv', name: 'Jane Doe', hide_name: true }
  const open = { id: 'm-open', name: 'John Smith', hide_name: false }

  eq(displayRecipientName(priv, { id: 'm-other', is_admin: false }), 'Resident',
     'privacy: a Private resident is masked from a non-admin viewer')
  eq(displayRecipientName(priv, { id: 'm-other', is_admin: true }), 'Jane Doe',
     'privacy: an admin sees the real name')
  eq(displayRecipientName(priv, { id: 'm-priv', is_admin: false }), 'Jane Doe',
     'privacy: you always see your OWN name, even with Private set')
  eq(displayRecipientName(open, { id: 'm-other', is_admin: false }), 'John Smith',
     'privacy: a non-Private resident is shown normally')
  eq(displayRecipientName(null, { id: 'm-other' }), null,
     'privacy: an unresolved member yields null (filtered out upstream)')

  // display_name (2026-08-14): preferred fallback ahead of the real name,
  // but never overrides masking -- Hide My Name still wins outright.
  const openWithDisplay = { id: 'm-open2', name: 'John Smith', display_name: 'Johnny', hide_name: false }
  const privWithDisplay = { id: 'm-priv2', name: 'Jane Doe', display_name: 'Coastal Jane', hide_name: true }

  eq(displayRecipientName(openWithDisplay, { id: 'm-other', is_admin: false }), 'Johnny',
     'display_name: shown ahead of the real name when not masked')
  eq(displayRecipientName(privWithDisplay, { id: 'm-other', is_admin: false }), 'Resident',
     'display_name: Hide My Name still wins outright, display_name is irrelevant here')
  eq(displayRecipientName(privWithDisplay, { id: 'm-other', is_admin: true }), 'Coastal Jane',
     'display_name: an admin (unmasked) sees the display name ahead of the real name')
  eq(displayRecipientName(privWithDisplay, { id: 'm-priv2', is_admin: false }), 'Coastal Jane',
     'display_name: you always see your own display name, even with Private set')
}

console.log(`categoryQuestions: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
