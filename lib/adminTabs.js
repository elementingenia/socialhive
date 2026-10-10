// Admin tile routing (Admin clean-up, Iain 2026-10-10,
// Element_Happenings_Admin_Cleanup_Scope_Answered). Admin went from 14 tiles
// to 8; several old tiles became sub-tabs of another. Old /admin?tab= links
// still exist in notifications already sent and in bookmarks, so every old
// key maps to its new home here. Pure module, no imports, unit-tested.

// Tiles that open inside /admin, with their sub-tabs (first = default).
export const ADMIN_SUBTABS = {
  HubSettings: [],
  Movies: ["Suggested", "Ownership", "Streaming", "Enrich"],
  Clubs: ["Clubs", "Proposals"],
  Locations: ["Venues", "Bookings", "Streets"],
  Residents: ["Uptake", "SignInHelp"],
  Interests: [],
  Bar: [],
}

// Retired tile keys -> where they live now.
export const LEGACY_ADMIN_TABS = {
  PageTexts: { tab: "HubSettings" },
  Owners: { tab: "HubSettings" },
  Tools: { tab: "Movies", sub: "Enrich" },
  BookClub: { tab: "Clubs" },
  Proposals: { tab: "Clubs", sub: "Proposals" },
  Streets: { tab: "Locations", sub: "Streets" },
  Uptake: { tab: "Residents", sub: "Uptake" },
  SignInHelp: { tab: "Residents", sub: "SignInHelp" },
}

// Resolve ?tab=&sub= into a valid { tab, sub }, or null for the tile grid.
// sub is always a valid sub-tab of tab, or null when the tile has none.
export function resolveAdminTab(tab, sub) {
  if (!tab) return null
  let t = tab
  let s = sub || null
  const legacy = LEGACY_ADMIN_TABS[t]
  if (legacy) {
    t = legacy.tab
    s = legacy.sub || s
  }
  const subs = ADMIN_SUBTABS[t]
  if (!subs) return null
  if (subs.length === 0) return { tab: t, sub: null }
  return { tab: t, sub: subs.includes(s) ? s : subs[0] }
}

// Build the deep link for a tile/sub-tab (used by notifications and the
// welcome-card viewer's Close).
export function adminHref(tab, sub) {
  return `/admin?tab=${encodeURIComponent(tab)}${sub ? `&sub=${encodeURIComponent(sub)}` : ""}`
}

// Page Texts sections grouped with the Owners list for their area, in the
// order Hub Settings shows them. ownerKey null = no Owners (Home).
export const HUB_SETTINGS_AREAS = [
  { key: "home", label: "Happenings Home", colour: "var(--amber)", sections: ["home"], ownerKey: null },
  { key: "movie", label: "Show Time", colour: "var(--teal)", sections: ["movies", "movies_suggestions", "movies_dvd"], ownerKey: "movie" },
  { key: "social", label: "Social Hive", colour: "var(--terracotta)", sections: ["social"], ownerKey: "social" },
  { key: "library", label: "Library", colour: "var(--purple)", sections: ["library", "library_books"], ownerKey: "library" },
  { key: "voting", label: "Voting", colour: "var(--voting)", sections: ["voting"], ownerKey: "voting" },
  { key: "committee", label: "Committee", colour: "var(--committee)", sections: ["committee"], ownerKey: "committee" },
]
