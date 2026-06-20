"use client"
import { usePathname, useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { useUser } from "@/lib/UserContext"
import { getActiveHub, HUB_COLOURS } from "@/lib/navUtils"

const HUB_CONFIG = {
  movies: {
    label: "Movie Hub",
    colour: "var(--teal)",
    icon: "🎬",
    items: [
      { path: "/movies",     label: "Movies Home", icon: "🏠" },
      { path: "/screenings", label: "Scheduled",   icon: "📅" },
      { path: "/library",    label: "Suggestions", icon: "🗳️" },
      { path: "/dvd",         label: "DVDs",        icon: "💿" },
    ],
  },
  bookclub: {
    label: "Book Club",
    colour: "var(--purple)",
    icon: "📖",
    items: [
      { path: "/bookclub",       label: "Book Club Home", icon: "🏠" },
      { path: "/bookclub/books", label: "Books",          icon: "📚" },
    ],
  },
  social: {
    label: "Social Hub",
    colour: "var(--terracotta)",
    icon: "🥂",
    items: [
      { path: "/social",        label: "Social Hub Home", icon: "🏠" },
      { path: "/social/events", label: "Scheduled",       icon: "📅" },
    ],
  },
  outings: {
    label: "Outings Hub",
    colour: "var(--green)",
    icon: "🌿",
    items: [
      { path: "/outings",        label: "Outings Home", icon: "🏠" },
      { path: "/outings/events", label: "Scheduled",    icon: "📅" },
    ],
  },
}

export default function BottomNav() {
  const pathname  = usePathname()
  const router    = useRouter()
  const { isAdmin, barOptIn } = useUser()
  const [subMenuOpen, setSubMenuOpen] = useState(false)

  const activeHub = getActiveHub(pathname)
  const hub = activeHub ? HUB_CONFIG[activeHub] : null

  useEffect(() => { setSubMenuOpen(false) }, [pathname])

  const navBase = {
    position: "fixed", bottom: 0, left: 0, right: 0,
    background: "var(--surface)", borderTop: "1px solid var(--border)",
    display: "flex", zIndex: 100, minHeight: 60,
  }

  const btn = (active, colour = "var(--amber)") => ({
    flex: 1,
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", gap: "0.2rem",
    background: "transparent", border: "none", cursor: "pointer",
    padding: "0.5rem 0.25rem",
    color: active ? colour : "var(--text-dim)",
    fontWeight: active ? 700 : 400,
    fontSize: "0.68rem", fontFamily: "inherit",
    borderTop: active ? "2px solid " + colour : "2px solid transparent",
    transition: "color 0.15s, border-color 0.15s",
    minHeight: 60,
  })

  // ── Hub nav ───────────────────────────────────────────────────────────────
  if (activeHub && hub) {
    const hubNavItems = [
      { path: "/home", label: "Home", icon: "🏠", exact: true },
      ...hub.items.map(item => ({ ...item, exact: item.path === hub.items[0].path })),
      ...(isAdmin ? [{ path: "/admin", label: "Admin", icon: "⚙️", exact: true }] : []),
    ]
    return (
      <nav style={navBase}>
        {hubNavItems.map(({ path, label, icon, exact }) => {
          const active = exact
            ? pathname === path
            : pathname === path || pathname.startsWith(path + "/")
          return (
            <button
              key={path}
              onClick={() => router.push(path)}
              style={btn(active, path === "/home" || path === "/admin" ? "var(--amber)" : hub.colour)}
              aria-current={active ? "page" : undefined}
            >
              <span style={{ fontSize: "1.3rem", lineHeight: 1 }}>{icon}</span>
              {label}
            </button>
          )
        })}
      </nav>
    )
  }

  // ── Default nav ───────────────────────────────────────────────────────────
  const defaultItems = [
    { path: "/home",     label: "Home",     icon: "🏠" },
    { path: "/calendar", label: "Calendar", icon: "📅" },
    { id: "events",      label: "Events",   icon: "✦"  },
    { path: "/bookings", label: "Bookings", icon: "🎟️" },
    ...(barOptIn && !isAdmin ? [{ path: "/bar", label: "Bar", icon: "🍺" }] : []),
    ...(isAdmin ? [{ path: "/admin", label: "Admin", icon: "⚙️" }] : []),
  ]

  return (
    <>
      {subMenuOpen && (
        <>
          <div
            onClick={() => setSubMenuOpen(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 98,
              background: "rgba(0,0,0,0.25)",
            }}
          />
          <div style={{
            position: "fixed", bottom: 62, left: 0, right: 0,
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
            boxShadow: "0 -4px 24px rgba(0,0,0,0.14)",
            display: "grid", gridTemplateColumns: "1fr 1fr",
            gap: "0.75rem", padding: "1rem",
            zIndex: 99,
            animation: "slideUp 0.18s ease",
          }}>
            {Object.entries(HUB_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => {
                  setSubMenuOpen(false)
                  router.push(cfg.items[0].path)
                }}
                style={{
                  background: cfg.colour + "18",
                  border: "2px solid " + cfg.colour,
                  borderRadius: 14,
                  padding: "1rem 0.5rem",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", gap: "0.4rem",
                  cursor: "pointer", fontFamily: "inherit",
                  minHeight: 80,
                }}
              >
                <span style={{ fontSize: "1.75rem", lineHeight: 1 }}>{cfg.icon}</span>
                <span style={{
                  fontSize: "0.82rem", fontWeight: 700,
                  color: cfg.colour, textAlign: "center",
                }}>{cfg.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <nav style={navBase}>
        {defaultItems.map((item) => {
          if (item.id === "events") {
            return (
              <button
                key="events"
                onClick={() => setSubMenuOpen((v) => !v)}
                style={btn(subMenuOpen, "var(--amber)")}
                aria-expanded={subMenuOpen}
              >
                <span style={{
                  fontSize: "1.3rem", lineHeight: 1,
                  transform: subMenuOpen ? "rotate(45deg)" : "none",
                  transition: "transform 0.18s",
                  display: "inline-block",
                }}>✦</span>
                Events
              </button>
            )
          }
          const active = pathname === item.path
          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              style={btn(active)}
              aria-current={active ? "page" : undefined}
            >
              <span style={{ fontSize: "1.3rem", lineHeight: 1 }}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </nav>
    </>
  )
}
