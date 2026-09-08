// Unit tests for lib/notifyAudience.js's excludeOptedOut -- the Committee
// broadcast-by-default, opt-out notification polarity (Iain, decision 3,
// supabase/migrations/097_committee_hub.sql): every active member gets
// notified EXCEPT those with a committee_notification_optouts row. This is
// the inverse of every other audience helper in this app (which select an
// opt-IN list), so it gets its own explicit test rather than relying on
// eyeballing the SQL.
//
//   npm run test:unit

import { excludeOptedOut } from '../../lib/committeeAudience.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }
const eq = (actual, expected, msg) => ok(
  JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort()),
  `${msg} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`
)

// ── Default: no one opted out -- everyone active gets notified ────────────
eq(excludeOptedOut(['a', 'b', 'c'], []), ['a', 'b', 'c'], 'no opt-outs -> every active member is included')
eq(excludeOptedOut(['a', 'b', 'c'], undefined), ['a', 'b', 'c'], 'undefined opt-out list treated as empty')

// ── Opted-out members are excluded, everyone else still notified ──────────
eq(excludeOptedOut(['a', 'b', 'c'], ['b']), ['a', 'c'], 'one opted-out member is excluded, others remain')
eq(excludeOptedOut(['a', 'b', 'c'], ['a', 'c']), ['b'], 'multiple opt-outs all excluded')
eq(excludeOptedOut(['a', 'b', 'c'], ['a', 'b', 'c']), [], 'everyone opted out -> no one notified')

// ── An opt-out row for someone who is no longer an active member is a no-op ──
eq(excludeOptedOut(['a', 'b'], ['z']), ['a', 'b'], 'an opt-out for a non-active id changes nothing')

// ── No active members at all ───────────────────────────────────────────────
eq(excludeOptedOut([], ['a']), [], 'no active members -> empty regardless of opt-outs')
eq(excludeOptedOut(undefined, []), [], 'undefined active list treated as empty')

// ── Duplicates in the active list are deduped ──────────────────────────────
eq(excludeOptedOut(['a', 'a', 'b'], []), ['a', 'b'], 'duplicate active ids are deduped')

console.log(`committee.test.mjs: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
