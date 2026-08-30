// Unit tests for lib/notifications.js -- the event_reminder day-relative
// rewording + auto-expiry fix (2026-08-30). Reported by Iain via screenshot:
// a "day-before" reminder created when an event was genuinely tomorrow still
// read "is tomorrow" once viewed on the actual day of the event, and stayed
// an active unread alert even after the event's start time had passed.
// Run: node tests/unit/notifications.test.mjs

import { rewordEventReminder, isExpiredEventReminder } from '../../lib/notifications.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

// 2026-08-30 14:00 AEST -- matches Iain's screenshot (14:00 on-screen clock,
// reminder for an 18:00 event created "7h ago", i.e. the previous morning
// when the event was genuinely still tomorrow).
const midAfternoonToday = new Date('2026-08-30T04:00:00Z') // 14:00 AEST

const baseReminder = {
  type: 'event_reminder',
  read_at: null,
  message: 'Reminder: The Way is tomorrow at 18:00 (Cinema).',
  events: { title: 'The Way', event_date: '2026-08-30', event_time: '18:00:00', location: 'Cinema' },
}

// Event is today, hasn't started yet (14:00 < 18:00) -- the exact bug: stale
// "tomorrow" wording must be corrected to "today", and it must NOT be
// auto-expired yet since it hasn't started.
const rewordedToday = rewordEventReminder(baseReminder, midAfternoonToday)
ok(rewordedToday.message === 'Reminder: The Way is today at 18:00 (Cinema).',
  'stale "tomorrow" wording is corrected to "today" once the event\'s date has arrived, before it starts')
ok(isExpiredEventReminder(baseReminder, midAfternoonToday) === false,
  'a reminder for a not-yet-started today event is not expired')

// Event is today and has already started (event_time has passed) -- must be
// expired (auto-mark-read eligible) and worded in the past tense.
const evening = new Date('2026-08-30T09:00:00Z') // 19:00 AEST, after the 18:00 start
const rewordedPast = rewordEventReminder(baseReminder, evening)
ok(rewordedPast.message === 'Reminder: The Way was at 18:00 (Cinema).',
  'wording switches to past tense once the event has actually started')
ok(isExpiredEventReminder(baseReminder, evening) === true,
  'a reminder for an already-started event is expired -- should stop demanding attention')

// Already-read reminders are never re-flagged as "expired" (nothing to mark
// read again) even if the event has passed.
ok(isExpiredEventReminder({ ...baseReminder, read_at: '2026-08-30T05:00:00Z' }, evening) === false,
  'an already-read reminder is never treated as newly expired')

// Genuinely still tomorrow (checked the same day it was created) -- wording
// is untouched, matching the cron's own original text exactly.
const dayBefore = new Date('2026-08-29T00:00:00Z') // 2026-08-29 10:00 AEST -- genuinely the day before
const rewordedTomorrow = rewordEventReminder(baseReminder, dayBefore)
ok(rewordedTomorrow.message === 'Reminder: The Way is tomorrow at 18:00 (Cinema).',
  'wording stays "is tomorrow" when genuinely checked the day before')
ok(isExpiredEventReminder(baseReminder, dayBefore) === false,
  'a genuinely-tomorrow reminder is not expired')

// Non-event_reminder types and rows with no linked event are passed through
// completely untouched -- this fix must not affect any other notification
// type (payment_reminder, book_return_reminder, etc. don't carry "tomorrow"
// wording and aren't evidenced as broken).
const otherType = { type: 'payment_reminder', read_at: null, message: 'You still owe $20 for The Way.', events: { event_date: '2026-08-20', event_time: '18:00:00' } }
ok(rewordEventReminder(otherType, evening).message === otherType.message,
  'non-event_reminder types are never reworded')
ok(isExpiredEventReminder(otherType, evening) === false,
  'non-event_reminder types are never auto-expired by this logic')

const noEvent = { type: 'event_reminder', read_at: null, message: 'Reminder: your event is tomorrow.', events: null }
ok(rewordEventReminder(noEvent, evening).message === noEvent.message,
  'an event_reminder with no linked event (edge case) is passed through unchanged, no crash')
ok(isExpiredEventReminder(noEvent, evening) === false,
  'an event_reminder with no linked event is never treated as expired, no crash')

console.log(`\nlib/notifications.js: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
