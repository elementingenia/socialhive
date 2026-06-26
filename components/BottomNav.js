"use client"
import React from "react"
import { usePathname, useRouter } from "next/navigation"
import { useUser } from "@/lib/UserContext"
import { getActiveHub, HUB_COLOURS } from "@/lib/navUtils"

// Hub icon images live in /public/icons/ — drop PNG files in to activate
// Falls back to emoji if file isn't present yet
const HUB_ICONS = {
  moviesHome:      "/icons/movies-home.png",
  moviesScheduled: "/icons/movies-scheduled.png",
  bookclubHome:    "/icons/bookclub-home.png",
  socialHome:      "/icons/social-home.png",
}

function NavIcon({ imgKey, icon, active, colour }) {
  const [imgFailed, setImgFailed] = React.useState(false)
  if (imgKey && HUB_ICONS[imgKey] && !imgFailed) {
    return (
      <img
        src={HUB_ICONS[imgKey]}
        alt=""
        aria-hidden="true"
        style={{ width: 26, height: 26, objectFit: "contain",
          opacity: active ? 1 : 0.5,
          filter: active ? "none" : "grayscale(40%)" }}
        onError={() => setImgFailed(true)}
      />
    )
  }
  return <span style={{ fontSize: "1.3rem", lineHeight: 1 }}>{icon}</span>
}

const HUB_CONFIG = {
  movies: {
    colour: "var(--teal)",
    items: [
      { path: "/movies",    label: "Movies Home", imgKey: "moviesHome",      icon: "🎬" },
      { path: "/screenings",label: "Scheduled",   imgKey: "moviesScheduled", icon: "📅" },
      { path: "/library",   label: "Suggestions", icon: "🗳️" },
      { path: "/dvd",       label: "DVDs",        icon: "💿" },
    ],
  },
  bookclub: {
    colour: "var(--purple)",
    items: [
      { path: "/bookclub",             label: "Book Club Home", imgKey: "bookclubHome", icon: "📖" },
      { path: "/bookclub/suggestions", label: "Suggestions",   icon: "📬" },
    ],
  },
  social: {
    colour: "var(--terracotta)",
    items: [
      { path: "/social", label: "Social Events", imgKey: "socialHome", icon: "🥂" },
    ],
  },
}

export default function BottomNav() {
  const pathname               = usePathname()
  const router                 = useRouter()
  const { isAdmin, barOptIn }  = useUser()

  const activeHub = getActiveHub(pathname)
  const hub       = activeHub ? HUB_CONFIG[activeHub] : null

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
      ...hub.items.map((item, i) => ({ ...item, exact: i === 0 })),
    ]
    return (
      <nav style={navBase}>
        {hubNavItems.map(({ path, label, icon, imgKey, exact }) => {
          const active = exact
            ? pathname === path
            : pathname === path || pathname.startsWith(path + "/")
          const colour = path === "/home" ? "var(--amber)" : hub.colour
          return (
            <button key={path} onClick={() => router.push(path)}
              style={btn(active, colour)} aria-current={active ? "page" : undefined}>
              <NavIcon imgKey={imgKey} icon={icon} active={active} colour={colour} />
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
    { path: "/bookings", label: "Bookings", icon: "🎟️" },
    ...(barOptIn && !isAdmin ? [{ path: "/bar", label: "Bar", icon: "🍺" }] : []),
    ...(isAdmin             ? [{ path: "/admin", label: "Admin", icon: "⚙️" }] : []),
  ]

  function handleDefaultNav(path) {
    if (path === "/admin" && pathname === "/admin") {
      // Already on admin — dispatch reset to clear any open sub-tab
      window.dispatchEvent(new CustomEvent("admin-reset"))
    } else {
      router.push(path)
    }
  }

  return (
    <nav style={navBase}>
      {defaultItems.map(({ path, label, icon }) => {
        const active = pathname === path
        return (
          <button key={path} onClick={() => handleDefaultNav(path)}
            style={btn(active)} aria-current={active ? "page" : undefined}>
            <span style={{ fontSize: "1.3rem", lineHeight: 1 }}>{icon}</span>
            {label}
          </button>
        )
      })}
    </nav>
  )
}
