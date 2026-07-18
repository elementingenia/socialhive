"use client"
import React from "react"
import { usePathname, useRouter } from "next/navigation"
import { useUser } from "@/lib/UserContext"
import { getActiveHub } from "@/lib/navUtils"
import { clubColour, clubNavItems } from "@/lib/clubs"
import { useActiveClub } from "@/lib/useActiveClub"
import { BAR_ENABLED } from "@/lib/features"
import {
  HomeIcon, MoviesIcon, CalendarIcon, SuggestionsIcon, DVDIcon,
  BookClubIcon, SocialIcon, AdminIcon, BookingsIcon, BarIcon,
  InfoIcon, DocumentsIcon, ContactsIcon, ClubsIcon,
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
  info: {
    colour: "#4e7aab",
    items: [
      { path: "/info/contacts",  label: "Contacts",  Icon: ContactsIcon  },
      { path: "/info/documents", label: "Documents", Icon: DocumentsIcon },
    ],
  },
}

export default function BottomNav() {
  const pathname              = usePathname()
  const router                = useRouter()
  const { isAdmin, barOptIn } = useUser()

  const activeHub = getActiveHub(pathname)

  // Clubs is the one data-driven hub: its sub-nav depends on WHICH club you're
  // in (its name, its colour) and whether that club actually has a catalogue —
  // so Dinner Club shows just Home + Dinner Club, Book Club adds Suggest.
  const club = useActiveClub()

  let hub = activeHub ? HUB_CONFIG[activeHub] : null
  if (activeHub === "clubs") {
    hub = club
      ? {
          colour: clubColour(club),
          items: clubNavItems(club).map(it => ({
            ...it,
            // textOnly = the club itself: label in the club colour, no glyph.
            Icon: it.textOnly ? null : (it.label === "Suggest" ? SuggestionsIcon : ClubsIcon),
          })),
        }
      : { colour: "var(--purple)", items: [{ path: "/clubs", label: "Clubs", Icon: ClubsIcon }] }
  }

  const navBase = {
    position: "fixed", bottom: 0, left: 0, right: 0,
    background: "var(--surface)", borderTop: "1px solid var(--border)",
    display: "flex", zIndex: 100, minHeight: 60,
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
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
              {Icon
                ? <><Icon size={26} />{label}</>
                : <span style={{ fontWeight: 700, fontSize: "0.9rem", lineHeight: 1.2, textAlign: "center" }}>{label}</span>}
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
    ...(BAR_ENABLED && barOptIn && !isAdmin ? [{ path: "/bar",   label: "Bar",   Icon: BarIcon   }] : []),
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
        const colour = path === "/bar" ? "var(--wine)" : undefined
        return (
          <button key={path} onClick={() => handleDefaultNav(path)}
            style={btn(active, colour)} aria-current={active ? "page" : undefined}>
            <Icon size={26} />
            {label}
          </button>
        )
      })}
    </nav>
  )
}
