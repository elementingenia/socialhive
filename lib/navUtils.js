// lib/navUtils.js
export function getActiveHub(pathname) {
  if (!pathname) return null
  if (
    pathname === "/movies"     || pathname.startsWith("/movies/") ||
    pathname === "/screenings" || pathname.startsWith("/screenings/") ||
    pathname === "/library"    || pathname.startsWith("/library/") ||
    pathname === "/dvd"        || pathname.startsWith("/dvd/")
  ) return "movies"
  if (pathname === "/bookclub" || pathname.startsWith("/bookclub/")) return "bookclub"
  if (pathname === "/social"   || pathname.startsWith("/social/"))   return "social"
  if (pathname === "/info"     || pathname.startsWith("/info/"))     return "info"
  if (pathname === "/bar")                                            return "bar"
  return null
}

export const HUB_COLOURS = {
  movie:    "var(--teal)",
  bookclub: "var(--purple)",
  social:   "var(--terracotta)",
  movies:   "var(--teal)",
  info:     "#4e7aab",
  bar:      "var(--wine)",
}

export function getModuleColour(pathname) {
  const hub = getActiveHub(pathname)
  return hub ? HUB_COLOURS[hub] : "var(--amber)"
}

export const PAGE_TITLES = {
  "/home":                    "Home",
  "/calendar":                "Calendar",
  "/bookings":                "My Bookings",
  "/admin":                   "Admin",
  "/profile":                 "My Profile",
  "/bar":                     "Community Bar",
  "/movies":                  "Movies Home",
  "/screenings":              "Scheduled",
  "/library":                 "Suggestions",
  "/dvd":                     "DVD Library",
  "/bookclub":                "Book Club Home",
  "/bookclub/suggestions":    "Suggestions",
  "/social":                  "Social Home",
  "/social/events":           "Scheduled",
  "/info":                    "Useful Information",
  "/info/documents":          "Documents",
  "/info/contacts":           "Contacts",
  "/help":                     "Help Guide",
}

export function getPageTitle(pathname) {
  return PAGE_TITLES[pathname] || ""
}

export const BACK_ROUTES = {
  "/bar":                  { to: "/home",     label: "Home" },
  "/bookings":             { to: "/home",     label: "Home" },
  "/admin":                { to: "/home",     label: "Home" },
  "/profile":              { to: "/home",     label: "Home" },
  "/screenings":           { to: "/movies",   label: "Movies" },
  "/library":              { to: "/movies",   label: "Movies" },
  "/dvd":                  { to: "/movies",   label: "Movies" },
  "/bookclub/suggestions": { to: "/bookclub", label: "Book Club" },
  "/social/events":        { to: "/social",   label: "Social" },
}
