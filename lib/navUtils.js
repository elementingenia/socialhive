// lib/navUtils.js
export function getActiveHub(pathname) {
  if (!pathname) return null
  if (
    pathname === "/movies"      || pathname.startsWith("/movies/") ||
    pathname === "/screenings"  || pathname.startsWith("/screenings/") ||
    pathname === "/library"     || pathname.startsWith("/library/") ||
    pathname === "/dvd"         || pathname.startsWith("/dvd/")
  ) return "movies"
  if (pathname === "/bookclub" || pathname.startsWith("/bookclub/")) return "bookclub"
  if (pathname === "/social"   || pathname.startsWith("/social/"))   return "social"
  if (pathname === "/outings"  || pathname.startsWith("/outings/"))  return "outings"
  return null
}

export const HUB_COLOURS = {
  // DB hub_type values (singular)
  movie:    "var(--teal)",
  bookclub: "var(--purple)",
  social:   "var(--terracotta)",
  outings:  "var(--green)",
  // Nav hub keys (plural — used by getActiveHub / BottomNav)
  movies:   "var(--teal)",
}

export function getModuleColour(pathname) {
  const hub = getActiveHub(pathname)
  return hub ? HUB_COLOURS[hub] : "var(--amber)"
}

export const PAGE_TITLES = {
  "/home":            "Home",
  "/calendar":        "Calendar",
  "/bookings":        "My Bookings",
  "/admin":           "Admin",
  "/profile":         "My Profile",
  "/bar":             "Community Bar",
  "/movies":          "Movies Home",
  "/screenings":      "Scheduled Screenings",
  "/library":         "Viewing Suggestions",
  "/dvd":             "DVD Library",
  "/bookclub":        "Book Club Home",
  "/bookclub/events": "Meetings",
  "/bookclub/books":  "Books",
  "/social":          "Social Hub Home",
  "/social/events":   "Scheduled Events",
  "/outings":         "Outings Home",
  "/outings/events":  "Scheduled Events",
}

export function getPageTitle(pathname) {
  return PAGE_TITLES[pathname] || ""
}
