// One-off: merge duplicate film records (Iain, 2026-10-27).
//
// 30 films existed twice -- the DVD we own and a separate suggestion (or a
// resident's private-ownership record). Rules: lib/movieRecords.js.
// For each pair, KEEP the DVD row and move onto it: votes, showings
// (events.movie_id), private-ownership records and loans; copy the
// suggestion state (60-day clock keeps the suggestion's own start date) and
// any film details the DVD is missing; use the short TMDB title; then delete
// the extra row. Groups with more than one owned row (series seasons, two
// discs) are left alone.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/merge-movie-duplicates.mjs            # dry run
//   ... node scripts/merge-movie-duplicates.mjs --apply --backup=path.json                               # do it
//
// Safe to re-run: once merged, a pair no longer matches.

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { duplicatePairs, mergePatch } from '../lib/movieRecords.js'

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const db = createClient(url, key, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')
const backupArg = process.argv.find(a => a.startsWith('--backup='))
if (APPLY && !backupArg) { console.error('--apply needs --backup=<file>'); process.exit(1) }

async function all(table, sel, build = q => q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(db.from(table).select(sel)).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) return out
  }
}
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data }

const movies = await all('movies', '*')
const pairs = duplicatePairs(movies)
const ids = pairs.flatMap(p => [p.keep.id, ...p.remove.map(r => r.id)])
const inIds = q => q.in('movie_id', ids)
const [votes, events, ownership, loans] = await Promise.all([
  all('votes', '*', inIds), all('events', 'id, movie_id, title, event_date', inIds),
  all('movie_ownership', '*', inIds), all('dvd_loans', '*', inIds),
])
const of = (rows, id) => rows.filter(r => r.movie_id === id)

console.log(`${pairs.length} duplicate pairs${APPLY ? '' : ' (dry run)'}`)
if (APPLY) {
  fs.writeFileSync(backupArg.split('=')[1], JSON.stringify({
    taken_at: new Date().toISOString(),
    movies: movies.filter(m => ids.includes(m.id)), votes, events, movie_ownership: ownership, dvd_loans: loans,
  }, null, 2))
  console.log(`Backup written: ${backupArg.split('=')[1]}`)
}

let moved = { votes: 0, dropped_votes: 0, events: 0, ownership: 0, loans: 0, deleted: 0 }
for (const { keep, remove } of pairs) {
  let patch = {}
  for (const r of remove) patch = { ...patch, ...mergePatch({ ...keep, ...patch }, r) }
  const keptVoters = new Set(of(votes, keep.id).map(v => v.member_id))
  const plan = remove.map(r => ({
    row: r,
    votes: of(votes, r.id),
    events: of(events, r.id),
    ownership: of(ownership, r.id),
    loans: of(loans, r.id),
  }))
  console.log(`\n${keep.title} -> "${patch.title || keep.title}" (keep ${keep.id.slice(0, 8)})`)
  for (const p of plan) console.log(`  merge ${p.row.id.slice(0, 8)}: ${p.votes.length} votes, ${p.events.length} showings, ${p.ownership.length} ownership, ${p.loans.length} loans`)
  console.log(`  set: ${Object.keys(patch).join(', ') || '(nothing)'}`)
  if (!APPLY) continue

  for (const p of plan) {
    for (const v of p.votes) {
      if (keptVoters.has(v.member_id)) {           // never happens today; keep the DVD row's vote
        must(await db.from('votes').delete().eq('id', v.id), 'drop vote'); moved.dropped_votes++
      } else {
        must(await db.from('votes').update({ movie_id: keep.id }).eq('id', v.id), 'move vote')
        keptVoters.add(v.member_id); moved.votes++
      }
    }
    if (p.events.length) { must(await db.from('events').update({ movie_id: keep.id }).eq('movie_id', p.row.id), 'move showings'); moved.events += p.events.length }
    for (const o of p.ownership) {
      const clash = of(ownership, keep.id).some(k => k.member_id === o.member_id && k.ownership_type === o.ownership_type)
      if (clash) must(await db.from('movie_ownership').delete().eq('id', o.id), 'drop ownership')
      else { must(await db.from('movie_ownership').update({ movie_id: keep.id }).eq('id', o.id), 'move ownership'); moved.ownership++ }
    }
    if (p.loans.length) { must(await db.from('dvd_loans').update({ movie_id: keep.id }).eq('movie_id', p.row.id), 'move loans'); moved.loans += p.loans.length }
  }
  // Delete extras BEFORE patching the kept row, so a unique tmdb/imdb index
  // (if one is ever added) can't clash with the row being removed.
  for (const p of plan) {
    must(await db.from('movies').delete().eq('id', p.row.id), 'delete duplicate'); moved.deleted++
  }
  if (Object.keys(patch).length) must(await db.from('movies').update(patch).eq('id', keep.id), 'update kept row')
}

if (APPLY) console.log('\nDone:', moved)
