// Unit tests for lib/happeningsNewsTier.js's pure logic -- no Supabase
// import in that module, so these run without a live DB connection, same
// split as lib/voting.js / lib/committeeAudience.js.
//
//   npm run test:unit

import {
  isHappeningsNewsLive, isValidArchiveDelay, isValidContentLength,
  isPostDueForArchive, originLabel, MAX_CONTENT_LENGTH, ARCHIVE_DELAY_OPTIONS,
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

console.log(`happeningsNews.test.mjs: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
