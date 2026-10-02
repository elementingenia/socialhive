// Unit tests for lib/tmdbMatch.js — picking the right TMDB search result for
// the Enrich DVD Library tool.
//   npm run test:unit
//
// Written after the 2026-10-02 IMDb-link audit: the tool took TMDB's first
// search result, which linked 10 DVDs to the wrong film (Up -> a 2026 film,
// Doomsday -> Avengers: Doomsday, The Fast and the Furious -> the 1954 film,
// etc.). Cases below mirror those real failures.

import { pickTmdbMatch, normTitle } from '../../lib/tmdbMatch.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗', m)) }
const eq = (a, b, m) => ok(a === b, `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)
const today = '2026-10-02'
const pick = (results, opts) => pickTmdbMatch(results, { today, ...opts })?.id ?? null

// ── normTitle ───────────────────────────────────────────────────────────────
eq(normTitle('The Fast and the Furious'), normTitle('Fast & the Furious'), 'leading "The" and & vs and ignored')
eq(normTitle('Up!'), 'up', 'punctuation ignored')

// ── Up: first result is a different, newer title ────────────────────────────
const up = [
  { id: 1, title: 'Balls Up', release_date: '2026-03-01', vote_count: 147 },
  { id: 2, title: 'Up', release_date: '2009-05-28', vote_count: 21000 },
  { id: 3, title: 'Up', release_date: '1984-01-01', vote_count: 4 },
]
eq(pick(up, { title: 'Up', year: 2009 }), 2, 'Up with year -> 2009 Pixar film')
eq(pick(up, { title: 'Up' }), 2, 'Up without year -> most-voted exact title')

// ── Doomsday: unreleased film with a matching word ranks first ─────────────
const doomsday = [
  { id: 10, title: 'Avengers: Doomsday', release_date: '2026-12-18', vote_count: 0 },
  { id: 11, title: 'Doomsday', release_date: '2008-03-14', vote_count: 1455 },
]
eq(pick(doomsday, { title: 'Doomsday', year: 2008 }), 11, 'Doomsday 2008')
eq(pick([{ id: 12, title: 'Doomsday', release_date: '2027-01-01', vote_count: 50 }], { title: 'Doomsday' }), null, 'unreleased film never picked')

// ── The Fast and the Furious: older same-title film ranks first ─────────────
const ff = [
  { id: 20, title: 'The Fast and the Furious', release_date: '1954-10-14', vote_count: 41 },
  { id: 21, title: 'The Fast and the Furious', release_date: '2001-06-22', vote_count: 11188 },
]
eq(pick(ff, { title: 'The Fast and the Furious', year: 2001 }), 21, 'year picks 2001')
eq(pick(ff, { title: 'The Fast and the Furious', year: '2001' }), 21, 'year as string works')
eq(pick(ff, { title: 'The Fast and the Furious' }), 21, 'no year -> most-voted')

// ── Year tolerance and year mismatch ────────────────────────────────────────
eq(pick([{ id: 30, title: 'For a Few Dollars More', release_date: '1965-12-18', vote_count: 4626 }], { title: 'For a Few Dollars More', year: 1966 }), 30, '±1 year tolerated')
eq(pick(ff, { title: 'The Fast and the Furious', year: 1990 }), null, 'no film near the DVD year -> null, not a guess')

// ── Subtitle drift: near title accepted only with a matching year ──────────
const anchor = [
  { id: 40, title: 'Anchorman: The Legend of Ron Burgundy', release_date: '2004-07-09', vote_count: 5000 },
  { id: 41, title: 'Anchorman 2: The Legend Continues', release_date: '2013-12-18', vote_count: 4000 },
]
eq(pick(anchor, { title: 'Anchorman', year: 2004 }), 40, 'near title + matching year')
eq(pick(anchor, { title: 'Anchorman' }), null, 'near title without a year -> null')

// ── Original title counts as exact ─────────────────────────────────────────
eq(pick([{ id: 50, title: 'Thief', original_title: 'The Thief', release_date: '1997-01-01', vote_count: 105 }], { title: 'The Thief', year: 1997 }), 50, 'original_title match')

// ── TV results use name / first_air_date ───────────────────────────────────
eq(pick([{ id: 60, name: 'Friends', first_air_date: '1994-09-22', vote_count: 9000 }, { id: 61, name: 'Friends with Benefits', first_air_date: '2011-01-01', vote_count: 50 }], { title: 'Friends' }), 60, 'TV exact name')

// ── Empty / bad input ───────────────────────────────────────────────────────
eq(pick([], { title: 'Up' }), null, 'no results')
eq(pick(null, { title: 'Up' }), null, 'null results')
eq(pick(up, { title: '' }), null, 'no title')

console.log(`tmdbMatch: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
