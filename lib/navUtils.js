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
  "/screenings":      "Scheduled",
  "/library":         "Suggestions",
  "/dvd":             "DVD Library",
  "/bookclub":        "Book Club Home",
  "/bookclub/events": "Meetings",
  "/bookclub/books":  "Books",
  "/social":          "Social Hub Home",
  "/social/events":   "Events",
  "/outings":         "Outings Home",
  "/outings/events":  "Events",
}

export function getPageTitle(pathname) {
  return PAGE_TITLES[pathname] || ""
}

// Which pages get a back button and where they go
export const BACK_ROUTES = {
  "/bar":             { to: "/home",     label: "Home" },
  "/bookings":        { to: "/home",     label: "Home" },
  "/admin":           { to: "/home",     label: "Home" },
  "/profile":         { to: "/home",     label: "Home" },
  "/screenings":      { to: "/movies",   label: "Movies" },
  "/library":         { to: "/movies",   label: "Movies" },
  "/dvd":             { to: "/movies",   label: "Movies" },
  "/bookclub/events": { to: "/bookclub", label: "Book Club" },
  "/bookclub/books":  { to: "/bookclub", label: "Book Club" },
  "/social/events":   { to: "/social",   label: "Social" },
  "/outings/events":  { to: "/outings",  label: "Outings" },
}
