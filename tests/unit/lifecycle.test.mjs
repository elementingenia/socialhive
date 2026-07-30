// Unit tests for lib/lifecycle.js — resident lifecycle rules.
//   npm run test:unit
//
// The backdating tests are the point of this file. Iain's rule is that the 30
// days is an undo window for ADMIN ERROR, so a move-out recorded two months late
// must still get a full 30 days. The obvious-looking implementation
// (purge_after = left_on + 30) fails that, and would purge immediately.

import {
  deactivate, reactivate, isPurgeDue, daysUntilPurge, deactivationWarning,
  canHaveLogin, nameSnapshot, displayName, addDays, UNDO_WINDOW_DAYS,
  ACTIVE, INACTIVE
} from '../../lib/lifecycle.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }
const eq = (a, b, msg) => ok(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

// ── deactivate: the normal case ─────────────────────────────────────────────
const today = '2026-07-30'
let r = deactivate({ leftOn: today, actionOn: today })
eq(r.status, INACTIVE, 'deactivate sets status inactive')
eq(r.left_on, '2026-07-30', 'deactivate records left_on')
eq(r.purge_after, '2026-08-29', 'purge_after = action + 30 days')

// ── deactivate: BACKDATED — the rule that matters ──────────────────────────
r = deactivate({ leftOn: '2026-05-20', actionOn: today })
eq(r.left_on, '2026-05-20', 'backdated left_on is preserved as the real-world fact')
eq(r.purge_after, '2026-08-29', 'backdated move-out STILL gets a full 30 days from the action')
ok(r.purge_after > today, 'a 2-month-old move-out does not purge immediately')
// the wrong implementation would produce 2026-06-19, i.e. already in the past
ok(r.purge_after !== '2026-06-19', 'purge_after is NOT left_on + 30')

// ── deactivate: future-dated (resident gives notice) ───────────────────────
r = deactivate({ leftOn: '2026-09-15', actionOn: today })
eq(r.purge_after, '2026-08-29', 'future left_on still keys purge to the action date')

// ── defaults ───────────────────────────────────────────────────────────────
r = deactivate({ actionOn: today })
eq(r.left_on, today, 'left_on defaults to the action date ("in effect from" = today)')

// ── reactivate clears everything ───────────────────────────────────────────
r = reactivate()
eq(r.status, ACTIVE, 'reactivate sets active')
eq(r.left_on, null, 'reactivate clears left_on')
eq(r.purge_after, null, 'reactivate clears the pending purge')

// ── re-deactivating restarts a FULL window, not the remainder ─────────────
const first = deactivate({ actionOn: '2026-07-01' })
eq(first.purge_after, '2026-07-31', 'first deactivation: 30 days from 1 Jul')
const again = deactivate({ actionOn: '2026-07-29' })   // reactivated, then again
eq(again.purge_after, '2026-08-28', 're-deactivation restarts a fresh 30 days')
ok(again.purge_after > first.purge_after, 're-deactivation never shortens the window')

// ── isPurgeDue ─────────────────────────────────────────────────────────────
const pending = { status: INACTIVE, purge_after: '2026-08-29' }
ok(!isPurgeDue(pending, '2026-08-28'), 'not due the day before')
ok(isPurgeDue(pending, '2026-08-29'), 'due on the day')
ok(isPurgeDue(pending, '2026-09-10'), 'still due after')
ok(!isPurgeDue({ status: ACTIVE, purge_after: '2026-01-01' }, today),
   'an ACTIVE person is never purged even with a stale purge_after')
ok(!isPurgeDue({ status: INACTIVE, purge_after: null }, today), 'no purge_after => not due')
ok(!isPurgeDue(null, today), 'null person => not due')

// ── daysUntilPurge ─────────────────────────────────────────────────────────
eq(daysUntilPurge(pending, '2026-08-29'), 0, '0 days on the due date')
eq(daysUntilPurge(pending, '2026-08-19'), 10, '10 days out')
eq(daysUntilPurge(pending, '2026-09-05'), 0, 'never negative')
eq(daysUntilPurge({ status: ACTIVE }, today), null, 'null for an active person')

// ── the admin warning ──────────────────────────────────────────────────────
const warn = deactivationWarning({ name: 'Doris Sacco', actionOn: today })
ok(warn.includes('30 days'), 'warning states the window')
ok(warn.includes('2026-08-29'), 'warning states the actual purge date')
ok(warn.includes('Doris Sacco'), 'warning names the person')
ok(deactivationWarning({ actionOn: today }).startsWith('If This person'),
   'warning falls back gracefully with no name')

// ── external contacts can never log in (mirrors the CHECK in 068) ──────────
ok(canHaveLogin({ person_type: 'resident' }), 'resident may have a login')
ok(canHaveLogin({ person_type: 'staff' }), 'staff may have a login')
ok(!canHaveLogin({ person_type: 'external' }), 'external may NEVER have a login')
ok(!canHaveLogin(null), 'null person cannot have a login')

// ── name snapshots ─────────────────────────────────────────────────────────
eq(nameSnapshot({ first_name: 'Susan', last_name: 'Ellis-Crewe' }), 'Susan Ellis-Crewe',
   'snapshot joins first + last')
eq(nameSnapshot({ first_name: 'Hermi' }), 'Hermi', 'snapshot handles first name only')
eq(nameSnapshot({ first_name: 'Robert', last_name: 'Pimm', display_name: 'Bob Pimm' }),
   'Bob Pimm', 'display_name wins when set')
eq(nameSnapshot({}), null, 'no name => null snapshot')
eq(nameSnapshot(null), null, 'null person => null snapshot')
eq(displayName(null), 'Resident', 'displayName falls back to "Resident"')

// ── addDays boundary cases ─────────────────────────────────────────────────
eq(addDays('2026-02-28', 1).toISOString().slice(0, 10), '2026-03-01', 'non-leap Feb rolls over')
eq(addDays('2024-02-28', 1).toISOString().slice(0, 10), '2024-02-29', 'leap year keeps 29 Feb')
eq(addDays('2026-12-31', 1).toISOString().slice(0, 10), '2027-01-01', 'year boundary')
eq(UNDO_WINDOW_DAYS, 30, 'the window is 30 days')

console.log(`lifecycle: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
