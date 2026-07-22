// Unit tests for lib/recurrence.js — the pure date engine behind repeatable
// events. This is the highest-risk logic in the feature (silent off-by-one /
// DST / short-month bugs), so it is tested exhaustively rather than by feel.
import {
  generateOccurrences, nextOccurrence, describeRule, needsMonthEndChoice,
  MAX_OCCURRENCES,
} from '../../lib/recurrence.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗', m)) }
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`)
// weekday of an ISO date, computed the same UTC way the lib does
const dow = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay() }

// ── Anchors verified against the real calendar ───────────────────────────────
// 2026-01-01 is a Thursday. February 2026 has 28 days (2026 is not a leap year).

// ── Weekly ───────────────────────────────────────────────────────────────────
const weeklyThu = { rule_type: 'weekly', rule_config: { weekdays: [4] }, start_date: '2026-01-01', horizon_months: 3 }
const wt = generateOccurrences(weeklyThu)
eq(wt.slice(0, 4), ['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22'], 'weekly Thursday: consecutive Thursdays from the start date')
ok(wt.every(d => dow(d) === 4), 'weekly Thursday: every generated date is a Thursday')

const weeklyTueThu = { rule_type: 'weekly', rule_config: { weekdays: [2, 4] }, start_date: '2026-01-01', horizon_months: 3 }
const wtt = generateOccurrences(weeklyTueThu)
eq(wtt.slice(0, 4), ['2026-01-01', '2026-01-06', '2026-01-08', '2026-01-13'], 'weekly Tue+Thu: interleaves both weekdays in order')
ok(wtt.every(d => dow(d) === 2 || dow(d) === 4), 'weekly Tue+Thu: only Tuesdays and Thursdays')
ok(generateOccurrences({ ...weeklyThu, rule_config: { weekdays: [] } }).length === 0, 'weekly with no weekdays selected yields nothing')

// ── The 12-occurrence hard cap (scope §5) ────────────────────────────────────
const weeklyYear = generateOccurrences({ ...weeklyThu, horizon_months: 12 })
ok(weeklyYear.length === MAX_OCCURRENCES, `weekly over 12 months is capped at ${MAX_OCCURRENCES}, not 52 (got ${weeklyYear.length})`)

// ── Fortnightly (anchored to start_date) ─────────────────────────────────────
const fort = { rule_type: 'fortnightly', rule_config: { weekday: 4 }, start_date: '2026-01-01', horizon_months: 6 }
const f = generateOccurrences(fort)
eq(f.slice(0, 4), ['2026-01-01', '2026-01-15', '2026-01-29', '2026-02-12'], 'fortnightly Thursday: 14-day spacing from the anchor')
ok(f.every(d => dow(d) === 4), 'fortnightly: every date is the chosen weekday')
// anchor lands on the first matching weekday on/after start_date
const fortAnchored = generateOccurrences({ ...fort, start_date: '2026-01-02' })  // Fri -> next Thu is Jan 8
eq(fortAnchored.slice(0, 2), ['2026-01-08', '2026-01-22'], 'fortnightly: anchors forward to the first matching weekday')

// ── Monthly by date + month-end policy (scope §4) ────────────────────────────
const m31clamp = { rule_type: 'monthly_date', rule_config: { day: 31 }, start_date: '2026-01-01', horizon_months: 6, month_end_policy: 'clamp' }
eq(generateOccurrences(m31clamp).slice(0, 6),
   ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30'],
   'monthly 31st CLAMP: short months fall back to the last day, never skipped')

const m31skip = { ...m31clamp, month_end_policy: 'skip' }
eq(generateOccurrences(m31skip).slice(0, 3), ['2026-01-31', '2026-03-31', '2026-05-31'],
   'monthly 31st SKIP: months without a 31st are omitted entirely')

const m15 = { rule_type: 'monthly_date', rule_config: { day: 15 }, start_date: '2026-01-01', horizon_months: 3 }
eq(generateOccurrences(m15).slice(0, 3), ['2026-01-15', '2026-02-15', '2026-03-15'], 'monthly 15th: same date each month')

// leap year — 29 Feb exists in 2028
const feb29 = generateOccurrences({ rule_type: 'monthly_date', rule_config: { day: 29 }, start_date: '2028-02-01', horizon_months: 1, month_end_policy: 'skip' })
ok(feb29.includes('2028-02-29'), 'monthly 29th: leap-year February is honoured (2028)')

// ── Monthly by weekday ───────────────────────────────────────────────────────
const lastThu = { rule_type: 'monthly_weekday', rule_config: { ordinal: 'last', weekday: 4 }, start_date: '2026-01-01', horizon_months: 3 }
eq(generateOccurrences(lastThu).slice(0, 3), ['2026-01-29', '2026-02-26', '2026-03-26'], 'last Thursday of each month')
ok(generateOccurrences(lastThu).every(d => dow(d) === 4), 'last-Thursday rule only ever returns Thursdays')

const firstTue = { rule_type: 'monthly_weekday', rule_config: { ordinal: 1, weekday: 2 }, start_date: '2026-01-01', horizon_months: 3 }
eq(generateOccurrences(firstTue).slice(0, 3), ['2026-01-06', '2026-02-03', '2026-03-03'], 'first Tuesday of each month')

// a 5th occurrence doesn't exist in most months -> those months are skipped, not clamped
const fifthThu = generateOccurrences({ rule_type: 'monthly_weekday', rule_config: { ordinal: 4, weekday: 4 }, start_date: '2026-01-01', horizon_months: 3 })
eq(fifthThu.slice(0, 3), ['2026-01-22', '2026-02-26', '2026-03-26'], 'fourth Thursday of each month')

// ── DST safety (NSW): Oct 2026 DST start, Apr 2026 DST end ───────────────────
const dstOct = generateOccurrences({ rule_type: 'weekly', rule_config: { weekdays: [4] }, start_date: '2026-09-24', horizon_months: 2 })
ok(dstOct.every(d => dow(d) === 4), 'weekly across the October DST start: all dates stay on Thursday')
const dstApr = generateOccurrences({ rule_type: 'weekly', rule_config: { weekdays: [0] }, start_date: '2026-03-22', horizon_months: 2 })
ok(dstApr.every(d => dow(d) === 0), 'weekly across the April DST end: all dates stay on Sunday')

// ── from-date filtering + horizon ────────────────────────────────────────────
const fromMid = generateOccurrences(weeklyThu, { from: '2026-01-20' })
ok(fromMid[0] === '2026-01-22', 'from-date: generation starts at the first occurrence on/after `from`')
ok(fromMid.every(d => d >= '2026-01-20'), 'from-date: nothing before `from` is returned')
ok(generateOccurrences({ ...m15, horizon_months: 3 }).length <= 4, 'horizon limits how far ahead we generate')
ok(generateOccurrences(weeklyThu, { count: 3 }).length === 3, 'explicit count is honoured')

// ── nextOccurrence (pattern-assisted pre-fill for Book Club, §7a) ────────────
ok(nextOccurrence(lastThu, '2026-02-01') === '2026-02-26', 'nextOccurrence returns the single next matching date')
ok(nextOccurrence(lastThu, '2026-02-27') === '2026-03-26', 'nextOccurrence rolls to the following month once passed')

// ── describeRule (plain English for the UI) ──────────────────────────────────
ok(describeRule(weeklyThu) === 'Every Thursday', 'describe: weekly single day')
ok(describeRule(weeklyTueThu) === 'Every Tuesday and Thursday', 'describe: weekly two days')
ok(describeRule(fort) === 'Every second Thursday', 'describe: fortnightly')
ok(describeRule(m31clamp) === 'The 31st of each month', 'describe: monthly by date ordinal suffix')
ok(describeRule(m15) === 'The 15th of each month', 'describe: 15th')
ok(describeRule({ rule_type: 'monthly_date', rule_config: { day: 1 } }) === 'The 1st of each month', 'describe: 1st suffix')
ok(describeRule({ rule_type: 'monthly_date', rule_config: { day: 2 } }) === 'The 2nd of each month', 'describe: 2nd suffix')
ok(describeRule({ rule_type: 'monthly_date', rule_config: { day: 3 } }) === 'The 3rd of each month', 'describe: 3rd suffix')
ok(describeRule({ rule_type: 'monthly_date', rule_config: { day: 11 } }) === 'The 11th of each month', 'describe: 11th is th, not st')
ok(describeRule(lastThu) === 'The last Thursday of each month', 'describe: last weekday')
ok(describeRule(firstTue) === 'The first Tuesday of each month', 'describe: first weekday')

// ── needsMonthEndChoice — the prompt only for days 29-31 (§4) ────────────────
ok(needsMonthEndChoice(m31clamp) === true, 'month-end prompt needed for the 31st')
ok(needsMonthEndChoice({ rule_type: 'monthly_date', rule_config: { day: 29 } }) === true, 'month-end prompt needed for the 29th')
ok(needsMonthEndChoice(m15) === false, 'no month-end prompt for the 15th')
ok(needsMonthEndChoice(lastThu) === false, 'no month-end prompt for weekday rules')

// ── defensive ────────────────────────────────────────────────────────────────
ok(generateOccurrences({ rule_type: 'nonsense', rule_config: {}, start_date: '2026-01-01' }).length === 0, 'unknown rule type yields nothing, no crash')
ok(describeRule(null) === '', 'describe(null) is empty, no crash')

// ── Robustness: switching rule type in the UI leaves stale config keys. The
// engine must NEVER hang or throw on that (regression for the 2026-07-21
// production freeze: fortnightly with no weekday spun `while (dow!==NaN)` forever).
eq(generateOccurrences({ rule_type: 'fortnightly', rule_config: { weekdays: [4] }, start_date: '2026-09-03', horizon_months: 6 }), [], 'fortnightly with weekly-style config (no weekday) returns [] and does NOT hang')
eq(generateOccurrences({ rule_type: 'fortnightly', rule_config: {}, start_date: '2026-09-03' }), [], 'fortnightly with empty config returns []')
eq(generateOccurrences({ rule_type: 'monthly_date', rule_config: { weekdays: [4] }, start_date: '2026-09-03' }), [], 'monthly_date with no day returns []')
eq(generateOccurrences({ rule_type: 'monthly_weekday', rule_config: { weekdays: [4] }, start_date: '2026-09-03' }), [], 'monthly_weekday with no ordinal/weekday returns []')
eq(generateOccurrences({ rule_type: 'monthly_date', rule_config: { day: 40 }, start_date: '2026-09-03' }), [], 'monthly_date with out-of-range day returns []')
ok(nextOccurrence({ rule_type: 'fortnightly', rule_config: {} }, '2026-09-01') === null, 'nextOccurrence on invalid fortnightly config is null, not a hang')


console.log(`\nlib/recurrence.js: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
