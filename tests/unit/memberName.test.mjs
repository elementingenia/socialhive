// Unit tests for lib/memberName.js -- the shared Display Name / hide_name
// ("Private") resolver (change request log #1, 2026-08-14).
//
//   npm run test:unit

import { resolveMemberName, isValidDisplayName } from '../../lib/memberName.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }
const eq = (actual, expected, msg) => ok(actual === expected, `${msg} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`)

// ── isValidDisplayName: at least 3 LETTERS, spaces/digits/punctuation don't count ──
{
  eq(isValidDisplayName('Jane'), true, 'valid: a normal name')
  eq(isValidDisplayName('Jo'), false, '2 letters => rejected, below the minimum')
  eq(isValidDisplayName(''), false, 'blank => rejected')
  eq(isValidDisplayName('   '), false, 'spaces only => rejected, no letters at all')
  eq(isValidDisplayName('123'), false, 'digits only => rejected, digits don\'t count as letters')
  eq(isValidDisplayName('J.J.'), false, 'only 2 letters (J, J) among the punctuation => still rejected, punctuation never counts toward the minimum')
  eq(isValidDisplayName('J.J.J.'), true, '3 letters (J, J, J) among punctuation => accepted once the letter count itself reaches 3')
  eq(isValidDisplayName('Al B'), true, '3 letters split across two words => accepted')
  eq(isValidDisplayName(null), false, 'non-string => rejected, not a crash')
  eq(isValidDisplayName(undefined), false, 'undefined => rejected, not a crash')
}

// ── resolveMemberName: masking is UNCHANGED, display_name never overrides it ──
{
  const priv = { id: 'm-priv', name: 'Jane Doe', display_name: 'Coastal Jane', hide_name: true }
  const open = { id: 'm-open', name: 'John Smith', display_name: 'Johnny', hide_name: false }

  eq(resolveMemberName(priv, { viewerId: 'm-other', canManage: false }), 'Resident',
     'masking wins outright regardless of display_name')
  eq(resolveMemberName(priv, { viewerId: 'm-other', canManage: true }), 'Coastal Jane',
     'a privileged viewer (admin/EC/coordinator/Owner) sees display_name, unmasked')
  eq(resolveMemberName(priv, { viewerId: 'm-priv', canManage: false }), 'Coastal Jane',
     'own row is never masked')
  eq(resolveMemberName(priv, { viewerId: 'm-priv', canManage: false, selfLabel: 'You' }), 'You',
     'selfLabel overrides own display_name when the caller wants "You" (e.g. Attendees rows)')
  eq(resolveMemberName(open, { viewerId: 'm-other', canManage: false }), 'Johnny',
     'an unmasked member is shown by display_name directly')
  eq(resolveMemberName(null, {}), 'Resident', 'no member at all => fallback')
  eq(resolveMemberName(null, { fallback: 'Member' }), 'Member', 'fallback is overridable per call site')

  // display_name defaults to Real Name at creation (2026-08-14) -- this is
  // the common case for anyone who's never customised it.
  const defaulted = { id: 'm-def', name: 'Pat Lee', display_name: 'Pat Lee', hide_name: false }
  eq(resolveMemberName(defaulted, { viewerId: 'm-other', canManage: false }), 'Pat Lee',
     'a member who never customised display_name just shows their real name, same as before this feature existed')
}

console.log(`memberName: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
