// Unit tests for lib/date.js -- the single source of truth for "today" and
// past/future comparisons in Australia/Sydney, added 2026-08-09 after a
// screening that had already happened was still showing as "next" on Show
// Time (root cause: `new Date().toISOString().split('T')[0]` computes the
// UTC date, which is the wrong calendar day for part or all of every Sydney
// day). Run: node tests/unit/date.test.mjs

import { sydneyTodayStr, sydneyNowTimeStr, sydneyDateStrPlusDays, isEventPast, isEventUpcoming, localDateFromStr } from '../../lib/date.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

// sydneyTodayStr — the actual regression: pick an instant that is "morning
// in Sydney, still yesterday in UTC" and confirm it resolves to Sydney's
// calendar date, not UTC's. 2026-08-09 09:00 AEST = 2026-08-08 23:00 UTC.
const earlyMorningSydney = new Date('2026-08-08T23:00:00Z')
ok(sydneyTodayStr(earlyMorningSydney) === '2026-08-09',
  'sydneyTodayStr resolves to the Sydney calendar day, not the UTC one, during the morning gap')

// The old broken pattern for comparison -- proves the bug existed and that
// our fix actually differs from it for this instant.
const oldBrokenPattern = earlyMorningSydney.toISOString().split('T')[0]
ok(oldBrokenPattern === '2026-08-08', 'sanity: confirms the old UTC-based pattern really did return the wrong day here')

// A late-evening instant should behave the same in both, so this isn't a
// blanket "always add a day" hack -- it's a real timezone conversion.
const lateEveningSydney = new Date('2026-08-09T10:00:00Z') // 2026-08-09 20:00 AEST
ok(sydneyTodayStr(lateEveningSydney) === '2026-08-09', 'sydneyTodayStr agrees with UTC once UTC has caught up to the same Sydney day')

// DST sanity: AEDT (UTC+11) applies in January/summer.
const summerInstant = new Date('2026-01-15T13:30:00Z') // 2026-01-16 00:30 AEDT
ok(sydneyTodayStr(summerInstant) === '2026-01-16', 'sydneyTodayStr resolves the correct day across the AEDT (summer, UTC+11) offset too')

// sydneyNowTimeStr
ok(sydneyNowTimeStr(new Date('2026-08-08T06:00:00Z')) === '16:00', 'sydneyNowTimeStr converts a UTC instant to Sydney HH:MM (winter, UTC+10)')

// sydneyDateStrPlusDays
ok(sydneyDateStrPlusDays(1, earlyMorningSydney) === '2026-08-10', 'sydneyDateStrPlusDays adds from the correct Sydney "today", not the UTC one')
ok(sydneyDateStrPlusDays(0, earlyMorningSydney) === sydneyTodayStr(earlyMorningSydney), 'sydneyDateStrPlusDays(0) equals sydneyTodayStr')

// isEventPast / isEventUpcoming — the actual production bug: Ford v Ferrari,
// event_date 2026-08-08, event_time 16:00, viewed at 2026-08-09 09:00 AEST.
const fordVFerrari = { event_date: '2026-08-08', event_time: '16:00:00' }
ok(isEventPast(fordVFerrari, earlyMorningSydney) === true, 'a screening from a prior Sydney calendar day is past, even during the UTC-lag morning window')
ok(isEventUpcoming(fordVFerrari, earlyMorningSydney) === false, 'isEventUpcoming is the exact inverse of isEventPast')

// Same-day, time-sensitive cases.
const laterToday = { event_date: '2026-08-09', event_time: '18:00:00' }
ok(isEventPast(laterToday, earlyMorningSydney) === false, 'an event later today (Sydney) is not yet past')
const earlierToday = { event_date: '2026-08-09', event_time: '07:00:00' }
ok(isEventPast(earlierToday, earlyMorningSydney) === true, 'an event earlier today (Sydney), already started, is past even though the date matches "today"')

// No time recorded => date-only comparison (never past on its own day).
const noTimeToday = { event_date: '2026-08-09' }
ok(isEventPast(noTimeToday, earlyMorningSydney) === false, 'an event with no event_time is only judged by date, not assumed past')

// Future date.
ok(isEventPast({ event_date: '2026-08-23', event_time: '18:00:00' }, earlyMorningSydney) === false, 'a genuinely future event is not past')

// Missing/garbage input -- must never throw or silently misreport as past.
ok(isEventPast(null) === false, 'null event => not past, no crash')
ok(isEventPast({}) === false, 'event with no event_date => not past, no crash')

// localDateFromStr
const d = localDateFromStr('2026-08-09')
ok(d instanceof Date && d.getFullYear() === 2026 && d.getMonth() === 7 && d.getDate() === 9, 'localDateFromStr parses Y/M/D components directly (no UTC-string parsing)')
ok(localDateFromStr('') === null, 'localDateFromStr("") => null, no crash')
ok(localDateFromStr(null) === null, 'localDateFromStr(null) => null, no crash')

console.log(`\nlib/date.js: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
