#!/usr/bin/env node
// scripts/check-invariants.js
//
// Standing data-integrity checks, born from three real incidents on
// 2026-07-07 (see session_summary_2026-07-07.md): a paid event's bookings
// silently defaulting to the wrong payment_status, and two members
// (Scampi, testbot) whose row was deleted while their Supabase Auth login
// kept existing, orphaned and invisible until something else broke.
//
// Each of these was found by hand, by chance, after the fact. This script
// turns them into a two-second check that can be run any time — before
// declaring a session "done", after a live-data cleanup, or on a schedule.
// It queries Supabase's REST API directly, so it works from anywhere with
// network access (this doesn't need a Postgres connection, which most
// sandboxes/CI runners can't open on port 5432 anyway).
//
// Usage:
//   node scripts/check-invariants.js
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
// environment — loaded from .env.local automatically if present.

const fs = require('fs')
const path = require('path')

function loadDotEnvLocal() {
  const file = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
loadDotEnvLocal()

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPA_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — set them or add .env.local')
  process.exit(2)
}

async function rest(pathAndQuery) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  if (!res.ok) throw new Error(`REST ${pathAndQuery} -> ${res.status} ${await res.text()}`)
  return res.json()
}

async function authAdmin(pathAndQuery) {
  const res = await fetch(`${SUPA_URL}/auth/v1/admin/${pathAndQuery}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  if (!res.ok) throw new Error(`Auth admin ${pathAndQuery} -> ${res.status} ${await res.text()}`)
  return res.json()
}

const checks = []

// 1. Paid-event bookings that never got payment_status set correctly.
// (The exact 2026-07-07 bug: api/bookings/route.js inserts that forgot to
// set payment_status inherited the DB default 'not_required', meant only
// for free events.)
checks.push({
  name: 'paid-event bookings stuck at payment_status=not_required',
  run: async () => {
    const rows = await rest(
      "bookings?select=id,status,payment_status,events!inner(title,payment_required)" +
      "&events.payment_required=eq.true&payment_status=eq.not_required&status=neq.cancelled"
    )
    return rows.map(r => `booking ${r.id} on "${r.events.title}" (status=${r.status})`)
  },
})

// 2. Orphaned Supabase Auth users — an auth.users row with no members row
// pointing at it via auth_id. This is the general form of both the Scampi
// (registration) and testbot (CI) incidents: a members row got deleted by
// hand without cleaning up the linked Auth account, which then just sits
// there until someone hits "email already registered" or a login mysteriously
// times out. Paginates in case the user list grows past one page.
checks.push({
  name: 'orphaned Supabase Auth users (no matching members.auth_id)',
  run: async () => {
    const members = await rest('members?select=auth_id')
    const linked = new Set(members.map(m => m.auth_id).filter(Boolean))
    const orphans = []
    for (let page = 1; page <= 20; page++) {
      const { users } = await authAdmin(`users?page=${page}&per_page=50`)
      if (!users || users.length === 0) break
      for (const u of users) {
        if (!linked.has(u.id)) orphans.push(`${u.email} (auth_id ${u.id}, last sign-in ${u.last_sign_in_at || 'never'})`)
      }
      if (users.length < 50) break
    }
    return orphans
  },
})

// 3. The testbot E2E fixture specifically — CI depends on this exact
// account existing, active, and admin. Catch it missing here, in seconds,
// instead of via 100 silent red CI runs.
checks.push({
  name: 'testbot E2E fixture account present, active, admin',
  run: async () => {
    const rows = await rest('members?username=ilike.testbot&select=username,status,is_admin,pin')
    if (rows.length === 0) return ['testbot member row is missing entirely']
    const bad = []
    const t = rows[0]
    if (t.status !== 'active') bad.push(`status is "${t.status}", expected "active"`)
    if (!t.is_admin) bad.push('is_admin is false, expected true (tests assert admin-only UI)')
    if (t.pin !== '9999') bad.push(`pin is "${t.pin}", expected "9999" (must match tests/e2e/auth.setup.js)`)
    return bad
  },
})

;(async () => {
  console.log(`Running ${checks.length} data-integrity checks against ${SUPA_URL}...\n`)
  let failures = 0
  for (const check of checks) {
    process.stdout.write(`- ${check.name} ... `)
    try {
      const violations = await check.run()
      if (violations.length === 0) {
        console.log('OK')
      } else {
        failures++
        console.log(`FAIL (${violations.length})`)
        for (const v of violations) console.log(`    ${v}`)
      }
    } catch (err) {
      failures++
      console.log('ERROR')
      console.log(`    ${err.message}`)
    }
  }
  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`)
  process.exit(failures === 0 ? 0 : 1)
})()
