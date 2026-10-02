// Unit tests for lib/happeningsNewsTier.js's pure logic -- no Supabase
// import in that module, so these run without a live DB connection, same
// split as lib/voting.js / lib/committeeAudience.js.
//
//   npm run test:unit

import {
  isHappeningsNewsLive, isValidArchiveDelay, isValidContentLength,
  isPostDueForArchive, originLabel, MAX_CONTENT_LENGTH, ARCHIVE_DELAY_OPTIONS,
  recapPromptDue, recapPromptRecipients, recapPromptMessage, RECAP_PROMPT_LOOKBACK_DAYS,
} from '../../lib/happeningsNewsTier.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }

// ── isHappeningsNewsLive: Preview/Production independence ─────────────────
{
  const origEnv = process.env.VERCEL_ENV
  process.env.VERCEL_ENV = 'production'
  ok(isHappeningsNewsLive({ enabled: true, production_enabled: false }) === false,
    'production reads production_enabled, ignores enabled=true')
  ok(isHappeningsNewsLive({ enabled: false, production_enabled: true }) === true,
    'production reads production_enabled=true even when Preview enabled=false')

  process.env.VERCEL_ENV = 'preview'
  ok(isHappeningsNewsLive({ enabled: true, production_enabled: false }) === true,
    'preview reads enabled, ignores production_enabled=false')
  ok(isHappeningsNewsLive({ enabled: false, production_enabled: true }) === false,
    'preview reads enabled=false even when production_enabled=true')

  delete process.env.VERCEL_ENV
  ok(isHappeningsNewsLive({ enabled: true, production_enabled: false }) === true,
    'unset VERCEL_ENV treated as non-production (local dev)')
  ok(isHappeningsNewsLive(null) === false, 'no settings row -> not live')
  if (origEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = origEnv
}

// ── isValidArchiveDelay: hardcoded 30/90/150 only ──────────────────────────
ok(isValidArchiveDelay(30) === true, '30 is valid')
ok(isValidArchiveDelay(90) === true, '90 is valid')
ok(isValidArchiveDelay(150) === true, '150 is valid')
ok(isValidArchiveDelay('90') === true, 'string "90" coerces to valid (form input)')
ok(isValidArchiveDelay(60) === false, '60 is not one of the hardcoded options')
ok(isValidArchiveDelay(0) === false, '0 is invalid')
ok(JSON.stringify(ARCHIVE_DELAY_OPTIONS) === JSON.stringify([30, 90, 150]), 'ARCHIVE_DELAY_OPTIONS is exactly [30,90,150]')

// ── isValidContentLength: 1..1000 chars ────────────────────────────────────
ok(isValidContentLength('Great night!') === true, 'normal text is valid')
ok(isValidContentLength('') === false, 'empty string is invalid')
ok(isValidContentLength('   ') === false, 'whitespace-only is invalid')
ok(isValidContentLength('a'.repeat(MAX_CONTENT_LENGTH)) === true, 'exactly 1000 chars is valid')
ok(isValidContentLength('a'.repeat(MAX_CONTENT_LENGTH + 1)) === false, '1001 chars is invalid')
ok(isValidContentLength(null) === false, 'null is invalid')
ok(isValidContentLength(undefined) === false, 'undefined is invalid')

// ── isPostDueForArchive ─────────────────────────────────────────────────────
{
  const now = new Date('2026-09-21T00:00:00Z')
  ok(isPostDueForArchive('2026-08-22T00:00:00Z', 30, now) === true, 'exactly 30 days old at 30-day delay -> due')
  ok(isPostDueForArchive('2026-08-23T00:00:00Z', 30, now) === false, '29 days old at 30-day delay -> not due yet')
  ok(isPostDueForArchive('2026-06-01T00:00:00Z', 90, now) === true, 'well past 90 days -> due')
  ok(isPostDueForArchive('2026-09-20T00:00:00Z', 90, now) === false, '1 day old at 90-day delay -> not due')
  ok(isPostDueForArchive(null, 90, now) === false, 'no created_at -> not due')
  ok(isPostDueForArchive('2026-08-22T00:00:00Z', null, now) === false, 'no archiveDays -> not due')
  ok(isPostDueForArchive('not-a-date', 90, now) === false, 'unparseable date -> not due, not a crash')
}

// ── originLabel: hub label or club name, never blank ────────────────────────
ok(originLabel({ hubType: 'movie' }) === 'Show Time', 'movie hub -> Show Time')
ok(originLabel({ hubType: 'social' }) === 'Social', 'social hub -> Social')
ok(originLabel({ hubType: 'special' }) === 'Special Events', 'special hub -> Special Events')
ok(originLabel({ hubType: 'space' }) === 'Book a Space', 'space hub -> Book a Space')
ok(originLabel({ hubType: 'club', clubName: 'Book Club' }) === 'Book Club', 'club event -> the specific club name, not the generic hub label')
ok(originLabel({ hubType: 'unknown_future_hub' }) === 'unknown_future_hub', 'unmapped hub_type falls back to the raw value, not blank')
ok(originLabel({}) === 'Happenings', 'no hub_type or club at all -> generic fallback, never blank')


// ── recapPromptDue: post-event recap nudge (2026-10-02) ─────────────────────
{
  // 2026-10-02 09:00 AEST (Sydney is UTC+10 until DST starts 2026-10-04)
  const now = new Date('2026-10-01T23:00:00Z')
  const floor = '2026-09-29'
  const base = { event_date: '2026-10-01', event_time: '18:00', event_end_time: '21:00', archived: false, recap_prompted_at: null, happenings_news_posts: [] }
  ok(recapPromptDue(base, floor, now) === true, 'yesterday, ended, no post, not prompted -> due')
  ok(recapPromptDue({ ...base, archived: true }, floor, now) === false, 'cancelled (archived) -> not due')
  ok(recapPromptDue({ ...base, recap_prompted_at: '2026-10-01T22:00:00Z' }, floor, now) === false, 'already prompted -> not due (once-only)')
  ok(recapPromptDue({ ...base, happenings_news_posts: [{ id: 'p1' }] }, floor, now) === false, 'post already exists -> not due')
  ok(recapPromptDue({ ...base, happenings_news_posts: { id: 'p1' } }, floor, now) === false, 'post as single embedded object -> not due')
  ok(recapPromptDue({ ...base, happenings_news_posts: null }, floor, now) === true, 'null embed = no post -> due')
  ok(recapPromptDue({ ...base, event_date: '2026-09-28' }, floor, now) === false, 'older than the lookback floor -> not due (no flood on first run)')
  ok(recapPromptDue({ ...base, event_date: '2026-09-29' }, floor, now) === true, 'exactly on the floor -> due')
  ok(recapPromptDue({ ...base, event_date: '2026-10-03' }, floor, now) === false, 'future event -> not due')
  ok(recapPromptDue({ ...base, event_date: '2026-10-02', event_end_time: null }, floor, now) === false, 'today with no End Time -> not finished until end of day')
  ok(recapPromptDue({ ...base, event_date: '2026-10-02', event_time: '07:00', event_end_time: '08:30' }, floor, now) === true, 'today, End Time already passed -> due')
  ok(recapPromptDue({ ...base, event_date: '2026-10-02', event_time: '08:00', event_end_time: '10:00' }, floor, now) === false, 'today, still running -> not due')
  ok(recapPromptDue({ ...base, event_end_time: null }, floor, now) === true, 'yesterday with no End Time -> due')
  ok(recapPromptDue(null, floor, now) === false, 'no event -> not due, not a crash')
  ok(RECAP_PROMPT_LOOKBACK_DAYS === 3, 'lookback is 3 days')
}

// ── recapPromptRecipients: current coordinators only, de-duplicated ─────────
{
  const ev = { event_coordinators: [
    { member_id: 'a', replaced_at: null },
    { member_id: 'b', replaced_at: '2026-09-01T00:00:00Z' },
    { member_id: 'a', replaced_at: null },
    { member_id: 'c', replaced_at: null },
    { member_id: null, replaced_at: null },
  ] }
  const r = recapPromptRecipients(ev)
  ok(r.length === 2 && r.includes('a') && r.includes('c'), 'only current ECs, no duplicates, no nulls')
  ok(recapPromptRecipients({}).length === 0, 'no coordinators -> nobody')
  ok(recapPromptRecipients(null).length === 0, 'no event -> nobody, not a crash')
}

// ── recapPromptMessage ──────────────────────────────────────────────────────
ok(recapPromptMessage('Trivia Night').includes('Trivia Night is a wrap'), 'message names the event')
ok(recapPromptMessage(null).includes('Your event is a wrap'), 'missing title falls back, never "null"')
ok(recapPromptMessage('X').includes('Happenings News'), 'message mentions Happenings News')

console.log(`happeningsNews.test.mjs: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
