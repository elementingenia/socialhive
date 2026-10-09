// Unit tests for lib/showtimeSeries.js -- Show Time repeating showings.
//   npm run test:unit

import {
  ruleFor, describeRepeat, planDates, validateRepeat, contentSetRecipients,
  isContentBeingSet, needsTbaNudge, contentSetMessage, MAX_DATES_AHEAD,
} from '../../lib/showtimeSeries.js'
import { validateResidentShowing } from '../../lib/residentShowing.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗', m)) }
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

// 2026-10-16 is a Friday; 2026-10-11 a Sunday; 2026-10-30 the last Friday.
// ── rule anchored to the first date ───────────────────────────────────────
eq(ruleFor('weekly', '2026-10-16'), { rule_type: 'weekly', rule_config: { weekdays: [5] } }, 'weekly on the first date weekday')
eq(ruleFor('fortnightly', '2026-10-11'), { rule_type: 'fortnightly', rule_config: { weekday: 0 } }, 'fortnightly Sunday')
eq(ruleFor('monthly', '2026-10-16'), { rule_type: 'monthly_weekday', rule_config: { ordinal: 3, weekday: 5 } }, '16th = 3rd Friday')
eq(ruleFor('monthly', '2026-10-30'), { rule_type: 'monthly_weekday', rule_config: { ordinal: 'last', weekday: 5 } }, '30th = last Friday')
eq(ruleFor('monthly', '2026-10-02').rule_config.ordinal, 1, '2nd = 1st Friday')
eq(ruleFor('nope', '2026-10-16'), null, 'unknown kind => null')

eq(describeRepeat('fortnightly', '2026-10-11'), 'Every second Sunday', 'describes fortnightly')
eq(describeRepeat('weekly', '2026-10-16'), 'Every Friday', 'describes weekly')
eq(describeRepeat('monthly', '2026-10-16'), 'The third Friday of each month', 'describes monthly')

// ── planned dates ─────────────────────────────────────────────────────────
eq(planDates({ kind: 'fortnightly', firstDate: '2026-10-11', count: 4 }),
  ['2026-10-11', '2026-10-25', '2026-11-08', '2026-11-22'], 'fortnightly 4 dates from the first')
eq(planDates({ kind: 'weekly', firstDate: '2026-10-16', count: 3 }),
  ['2026-10-16', '2026-10-23', '2026-10-30'], 'weekly 3 dates')
eq(planDates({ kind: 'monthly', firstDate: '2026-10-30', count: 3 }),
  ['2026-10-30', '2026-11-27', '2026-12-25'], 'last Friday of each month')
eq(planDates({ kind: 'weekly', firstDate: '2026-10-16', count: 50 }).length, MAX_DATES_AHEAD, 'capped at 12')
eq(planDates({ kind: 'monthly', firstDate: '2026-10-16', count: 12 }).length, 12, '12 monthly dates fit the horizon')
eq(planDates({ kind: 'weekly', firstDate: '', count: 3 }), [], 'no first date => nothing')

// ── repeat validation ─────────────────────────────────────────────────────
const r = (p) => validateRepeat({ kind: 'fortnightly', dates_ahead: 4, keep_rolling: true, showing_name: 'Sunday Night at the Movies', ...p })
eq(r({}), null, 'valid repeat')
eq(validateRepeat(null), null, 'one-off has no repeat')
ok(!!r({ kind: 'daily' }), 'rejects unknown kind')
ok(!!r({ dates_ahead: 1 }), 'rejects 1 date')
ok(!!r({ dates_ahead: 13 }), 'rejects 13 dates')
ok(!!r({ keep_rolling: 'yes' }), 'rolling must be a yes/no')
ok(!!r({ showing_name: 'x'.repeat(81) }), 'rejects an over-long name')
eq(r({ showing_name: '' }), null, 'name is optional')

// ── TBA first date only on a repeat ───────────────────────────────────────
const now = new Date('2026-10-09T23:00:00Z')
const base = { ingenia_confirmed: true, event_date: '2026-10-11', event_time: '18:00', event_end_time: '20:00', seats_kept: 0, notify: 'none' }
ok(!!validateResidentShowing(base, { now }), 'one-off with no content is rejected')
ok(!!validateResidentShowing({ ...base, content_later: true }, { now }), 'one-off cannot be decided later')
eq(validateResidentShowing({ ...base, content_later: true, repeat: { kind: 'weekly' } }, { now }), null, 'repeat may decide later')

// ── who is told when content is set ───────────────────────────────────────
eq(contentSetRecipients({ followerIds: ['a', 'b', 'c'], mutedIds: ['b'], bookerIds: ['b', 'd'], excludeIds: ['a'] }).sort(),
  ['b', 'c', 'd'], 'muted member still told because they booked; editor excluded')
eq(contentSetRecipients({ followerIds: ['a', 'a'], bookerIds: ['a'] }), ['a'], 'no duplicates')
eq(contentSetRecipients({}), [], 'nobody')

ok(isContentBeingSet({ wasTba: true, movieId: 'm1' }), 'picking a film sets content')
ok(isContentBeingSet({ wasTba: true, showingTitle: 'AFL' }), 'typing what is on sets content')
ok(!isContentBeingSet({ wasTba: true, showingTitle: '  ' }), 'blank is still TBA')
ok(!isContentBeingSet({ wasTba: false, movieId: 'm1' }), 'an ordinary edit is not a content set')

// ── nudge ─────────────────────────────────────────────────────────────────
const ev = { content_tba: true, event_date: '2026-10-12', archived: false, tba_nudged_at: null }
ok(needsTbaNudge(ev, '2026-10-10', '2026-10-13'), 'TBA within 3 days')
ok(!needsTbaNudge({ ...ev, event_date: '2026-10-20' }, '2026-10-10', '2026-10-13'), 'too far ahead')
ok(!needsTbaNudge({ ...ev, tba_nudged_at: '2026-10-09T00:00:00Z' }, '2026-10-10', '2026-10-13'), 'only once')
ok(!needsTbaNudge({ ...ev, content_tba: false }, '2026-10-10', '2026-10-13'), 'content already set')
ok(!needsTbaNudge({ ...ev, archived: true }, '2026-10-10', '2026-10-13'), 'cancelled date')

eq(contentSetMessage({ showingName: 'Friday Night Action Movies', title: 'Heat', when: 'Fri 16 Oct' }),
  'New showing: Friday Night Action Movies — Heat — Fri 16 Oct', 'message with name')
eq(contentSetMessage({ title: 'Heat', when: 'Fri 16 Oct' }), 'New showing: Heat — Fri 16 Oct', 'message without name')

console.log(`showtimeSeries: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
