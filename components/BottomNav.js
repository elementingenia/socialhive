"use client"
import React from "react"
import { usePathname, useRouter } from "next/navigation"
import { useUser } from "@/lib/UserContext"
import { getActiveHub } from "@/lib/navUtils"
import {
  HomeIcon, MoviesIcon, CalendarIcon, SuggestionsIcon, DVDIcon,
  BookClubIcon, SocialIcon, AdminIcon, BookingsIcon, BarIcon,
} from "@/components/NavIcons"

const HUB_CONFIG = {
  movies: {
    colour: "var(--teal)",
    items: [
      { path: "/movies",    label: "Movies Home", Icon: MoviesIcon },
      { path: "/screenings",label: "Scheduled",   Icon: CalendarIcon },
      { path: "/library",   label: "Suggestions", Icon: SuggestionsIcon },
      { path: "/dvd",       label: "DVDs",        Icon: DVDIcon },
    ],
  },
  bookclub: {
    colour: "var(--purple)",
    items: [
      { path: "/bookclub",             label: "Book Club", Icon: BookClubIcon },
      { path: "/bookclub/suggestions", label: "Suggest",   Icon: SuggestionsIcon },
    ],
  },
  social: {
    colour: "var(--terracotta)",
    items: [
      { path: "/social",        label: "Social",    Icon: SocialIcon },
      { path: "/social/events", label: "Scheduled", Icon: CalendarIcon },
    ],
  },
}

export default function BottomNav() {
  const pathname              = usePathname()
  const router                = useRouter()
  const { isAdmin, barOptIn } = useUser()

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
      { path: "/home", label: "Home", Icon: HomeIcon, exact: true },
      ...hub.items.map((item, i) => ({ ...item, exact: i === 0 })),
    ]
    return (
      <nav style={navBase}>
        {hubNavItems.map(({ path, label, Icon, exact }) => {
          const active = exact
            ? pathname === path
            : pathname === path || pathname.startsWith(path + "/")
          const colour = path === "/home" ? "var(--amber)" : hub.colour
          return (
            <button key={path} onClick={() => router.push(path)}
              style={btn(active, colour)} aria-current={active ? "page" : undefined}>
              <Icon size={26} />
              {label}
            </button>
          )
        })}
      </nav>
    )
  }

  // ── Default nav ───────────────────────────────────────────────────────────
  const defaultItems = [
    { path: "/home",     label: "Home",     Icon: HomeIcon },
    { path: "/calendar", label: "Calendar", Icon: CalendarIcon },
    { path: "/bookings", label: "Bookings", Icon: BookingsIcon },
    ...(barOptIn && !isAdmin ? [{ path: "/bar",   label: "Bar",   Icon: BarIcon   }] : []),
    ...(isAdmin              ? [{ path: "/admin", label: "Admin", Icon: AdminIcon }] : []),
  ]

  function handleDefaultNav(path) {
    if (path === "/admin" && pathname === "/admin") {
      window.dispatchEvent(new CustomEvent("admin-reset"))
    } else {
      router.push(path)
    }
  }

  return (
    <nav style={navBase}>
      {defaultItems.map(({ path, label, Icon }) => {
        const active = pathname === path
        return (
          <button key={path} onClick={() => handleDefaultNav(path)}
            style={btn(active)} aria-current={active ? "page" : undefined}>
            <Icon size={26} />
            {label}
          </button>
        )
      })}
    </nav>
  )
}
