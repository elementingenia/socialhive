// lib/navUtils.js
export function getActiveHub(pathname) {
  if (!pathname) return null
  if (
    pathname === "/movies" || pathname.startsWith("/movies/") ||
    pathname === "/screenings" || pathname.startsWith("/screenings/") ||
    pathname === "/library" || pathname.startsWith("/library/")
  ) return "movies"
  if (pathname === "/bookclub" || pathname.startsWith("/bookclub/")) return "bookclub"
  if (pathname === "/social" || pathname.startsWith("/social/")) return "social"
  if (pathname === "/outings" || pathname.startsWith("/outings/")) return "outings"
  return null
}

export const HUB_COLOURS = {
  movies:   "var(--teal)",
  bookclub: "var(--purple)",
  social:   "var(--terracotta)",
  outings:  "var(--green)",
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
  "/library":         "Library",
  "/bookclub":        "Book Club Home",
  "/bookclub/books":  "Books",
  "/social":          "Social Hub Home",
  "/social/events":   "Scheduled Events",
  "/outings":         "Outings Home",
  "/outings/events":  "Scheduled Events",
}

export function getPageTitle(pathname) {
  return PAGE_TITLES[pathname] || ""
}
