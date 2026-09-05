// Shared localStorage persistence for Calendar's hub-filter pills + Groups &
// Clubs scope, and for Bookings' identical filter strip (Iain, 2026-09-05:
// "when user applies filters, those filters should be preserved until user
// changes them"). Previously both pages reset to their hardcoded defaults
// on every mount -- reopening Calendar after switching hubs off, or coming
// back to Bookings later, silently discarded whatever the resident had just
// set. Two independent storage keys (one per page) rather than one shared
// key, since Calendar and Bookings genuinely have different hub sets
// (Calendar also has Special Events, and Spaces when SPACE_BOOKINGS_ENABLED)
// -- sharing a key would let a filter combination that's only valid on one
// page leak state into the other.
//
// Wrapped in try/catch and a typeof window guard throughout: both consumers
// are "use client" components that read this during useState's lazy
// initializer, which also runs during Next.js's SSR pass (no window there),
// and a private-browsing tab or an exhausted storage quota can make
// localStorage throw on read/write -- neither should ever break the page,
// it should just fall back to the hardcoded default for that load.

export function loadFilterPrefs(storageKey) {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveFilterPrefs(storageKey, prefs) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(prefs))
  } catch {
    // Ignore -- a persistence failure (quota, private mode) shouldn't break
    // the page; the filter just won't survive this particular reload.
  }
}

// A filter the user has switched OFF (excluding that area's events) should
// visually slide to the right of anything still ON, per Iain 2026-09-05,
// while everything ON keeps its normal left-to-right order. Array.prototype
// .sort is stable in every JS engine this app targets (ES2019+), so a
// simple on-descending sort is enough -- ties (same on-state) keep their
// original relative order, they never get shuffled against each other.
export function sortByOnState(defs, isOn) {
  return [...defs].sort((a, b) => (isOn(b) ? 1 : 0) - (isOn(a) ? 1 : 0))
}
