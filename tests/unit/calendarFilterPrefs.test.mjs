// Unit tests for lib/calendarFilterPrefs.js -- Calendar/Bookings filter
// persistence + the ON-before-OFF pill reordering (Iain, 2026-09-05:
// "when user applies filters, those filters should be preserved until user
// changes them" / "A filter that is turned off ... should slide to the
// right of filters left ON").
//
//   npm run test:unit

import { loadFilterPrefs, saveFilterPrefs, sortByOnState } from '../../lib/calendarFilterPrefs.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('  ✗', msg)) }
const eq = (actual, expected, msg) => ok(
  JSON.stringify(actual) === JSON.stringify(expected),
  `${msg} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`
)

// ── loadFilterPrefs / saveFilterPrefs -- no window (SSR / Node) ──────────
{
  // This test file runs under plain Node, not jsdom -- `window` genuinely
  // doesn't exist here, exactly like Next.js's SSR pass. Both functions
  // must no-op cleanly rather than throw.
  eq(loadFilterPrefs('anything'), null, 'loadFilterPrefs returns null with no window (SSR-safe)')
  ok((() => { saveFilterPrefs('anything', { a: 1 }); return true })(), 'saveFilterPrefs is a silent no-op with no window (SSR-safe)')
}

// ── loadFilterPrefs / saveFilterPrefs -- a minimal localStorage stand-in ──
{
  const store = {}
  globalThis.window = {
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v },
    },
  }
  eq(loadFilterPrefs('calendarFilters'), null, 'nothing saved yet -> null')
  saveFilterPrefs('calendarFilters', { activeHubs: ['movie', 'social'], clubScope: 'hide' })
  eq(loadFilterPrefs('calendarFilters'), { activeHubs: ['movie', 'social'], clubScope: 'hide' }, 'round-trips exactly what was saved')
  // A different key must never see another page's saved prefs -- Calendar
  // and Bookings intentionally use separate storage keys.
  eq(loadFilterPrefs('bookingsFilters'), null, 'a different storage key is independent')

  // Corrupted/malformed JSON in storage must not throw -- falls back to null
  // so the caller's own default takes over, same as "nothing saved".
  store.corrupted = '{not valid json'
  eq(loadFilterPrefs('corrupted'), null, 'malformed stored JSON falls back to null, does not throw')

  delete globalThis.window
}

// ── sortByOnState ──────────────────────────────────────────────────────
{
  const defs = [
    { key: 'movie',   on: true  },
    { key: 'social',  on: false },
    { key: 'special', on: true  },
    { key: 'club',    on: false },
  ]
  const sorted = sortByOnState(defs, d => d.on).map(d => d.key)
  eq(sorted, ['movie', 'special', 'social', 'club'], 'ON pills sort first, OFF pills slide right, each group keeps its original order')

  // All ON: order is fully preserved (nothing to reorder).
  const allOn = [{ key: 'a', on: true }, { key: 'b', on: true }, { key: 'c', on: true }]
  eq(sortByOnState(allOn, d => d.on).map(d => d.key), ['a', 'b', 'c'], 'all-ON input is returned in its original order')

  // All OFF: same -- nothing to reorder relative to each other.
  const allOff = [{ key: 'a', on: false }, { key: 'b', on: false }]
  eq(sortByOnState(allOff, d => d.on).map(d => d.key), ['a', 'b'], 'all-OFF input keeps its original relative order')

  // Does not mutate the input array (callers re-derive this on every render).
  const original = [{ key: 'x', on: false }, { key: 'y', on: true }]
  const originalCopy = original.map(d => ({ ...d }))
  sortByOnState(original, d => d.on)
  eq(original, originalCopy, 'sortByOnState does not mutate its input array')

  // The Groups & Clubs "only off when fully hidden" rule -- club stays
  // grouped with the ON pills when scoped (e.g. 'mine' or a specific club
  // id), and only slides right once clubScope === 'hide'.
  const withClub = (clubScope) => sortByOnState(
    [
      { key: 'movie', type: 'hub' },
      { key: 'club',  type: 'club' },
    ],
    d => d.type === 'club' ? clubScope !== 'hide' : true
  ).map(d => d.key)
  eq(withClub('all'), ['movie', 'club'], 'Groups & Clubs scoped to "all" stays with the ON pills')
  eq(withClub('mine'), ['movie', 'club'], 'Groups & Clubs scoped to "mine" stays with the ON pills (filtering, not excluding)')
  eq(withClub('some-club-id'), ['movie', 'club'], 'Groups & Clubs scoped to one club stays with the ON pills')
  eq(withClub('hide'), ['movie', 'club'], 'Groups & Clubs "hide" -- with only one other (always-ON) pill, still sorts last relatively')
}

console.log(`calendarFilterPrefs: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
