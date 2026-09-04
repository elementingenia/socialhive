"use client"
import { useState, useEffect, useMemo, useRef } from "react"
import { BAR_ENABLED } from "@/lib/features"

const BASE = "https://tzzxwvbqszzrruxjrpcs.supabase.co/storage/v1/object/public/help-screenshots"
const IMG = (name) => `${BASE}/${name}`

const PRINT_STYLE = `
  @media print {
    .no-print { display: none !important; }
    .print-break { page-break-before: always; break-before: page; }
    body { background: #fff !important; }
    img { max-width: 260px !important; break-inside: avoid; }
    section { break-inside: avoid; page-break-inside: avoid; }
    h2 { page-break-after: avoid; break-after: avoid; }
    a { color: inherit !important; text-decoration: none !important; }
  }
`

const teal   = "#2a9d8f"
const text   = "#2d2d2d"
const muted  = "#666"
const border = "#e2e8f0"
const bg     = "#faf8f5"

const EC_BADGE = (
  <span style={{
    display: "inline-block",
    background: teal,
    color: "#fff",
    fontSize: "0.6rem",
    fontWeight: 700,
    letterSpacing: "0.05em",
    padding: "2px 8px",
    borderRadius: 20,
    marginLeft: 8,
    verticalAlign: "middle",
    textTransform: "uppercase",
  }}>EC only</span>
)

const RAW_SECTIONS = [
  {
    id: "header", num: "—", title: "Getting Around — The App Header",
    subs: [
      { title: "The header bar",                    id: "sub-header-bar" },
      { title: "Your account menu (avatar pill)",   id: "sub-header-account" },
    ],
  },
  {
    id: "access", num: 1, title: "Signing In, Registering & Changing Your Password",
    subs: [
      { title: "Sign In",                    id: "sub-signin" },
      { title: "Register — first time users", id: "sub-register" },
      { title: "Change Password",             id: "sub-password" },
    ],
  },
  {
    id: "profile", num: 2, title: "Your Profile & PIN",
    subs: [
      { title: "Updating your profile", id: "sub-profile-update" },
      { title: "Changing your PIN",     id: "sub-profile-pin" },
    ],
  },
  {
    id: "movies", num: 3, title: "Show Time — Screenings, Booking & Library",
    subs: [
      { title: "Show Time Home layout",                       id: "sub-movies-home" },
      { title: "The Next Screening card",                    id: "sub-movies-nextcard" },
      { title: "IMDb & Rotten Tomatoes ratings",             id: "sub-movies-ratings" },
      { title: "Booking a seat",                             id: "sub-movies-booking" },
      { title: "After you have booked",                      id: "sub-movies-afterbook" },
      { title: "Rating films — the community voting panel",  id: "sub-movies-voting" },
      { title: "Scheduled screenings list",                  id: "sub-movies-scheduled" },
      { title: "Suggestions library",                        id: "sub-movies-library" },
      { title: "DVD library",                                id: "sub-movies-dvd" },
      { title: "Coordinator panel (EC only)",                id: "sub-movies-ec" },
    ],
  },
  {
    id: "social", num: 4, title: "Social Events — Community Activities & Trips",
    subs: [
      { title: "Social hub home",              id: "sub-social-home" },
      { title: "Viewing and booking events",   id: "sub-social-events" },
      { title: "Event detail & booking",       id: "sub-social-detail" },
      { title: "Riding the Community Bus",     id: "sub-social-bus" },
      { title: "Coordinator panel (EC only)",  id: "sub-social-ec" },
    ],
  },
  {
    id: "clubs", num: 5, title: "Groups & Clubs — including Book Club",
    subs: [
      { title: "Groups & Clubs home",                     id: "sub-clubs-home" },
      { title: "A club's page — welcome, contact & Ask a Question", id: "sub-clubs-page" },
      { title: "Signing up for a meeting or activity",     id: "sub-clubs-signup" },
      { title: "Bringing something",                       id: "sub-clubs-bring" },
      { title: "Riding the Community Bus",                 id: "sub-clubs-bus" },
      { title: "Book Club — current pick, suggestions & voting", id: "sub-clubs-bookclub" },
      { title: "Coordinator & Owner panel (EC only)",       id: "sub-clubs-ec" },
    ],
  },
  {
    id: "info", num: 6, title: "Info — Contacts & Documents",
    subs: [
      { title: "Finding a contact",     id: "sub-info-contacts" },
      { title: "Community documents",   id: "sub-info-documents" },
    ],
  },
  {
    id: "questions", num: 7, title: "Ask a Question",
    subs: [
      { title: "Asking a question",           id: "sub-questions-ask" },
      { title: "Your questions & answering",  id: "sub-questions-mine" },
    ],
  },
  {
    id: "bar", num: 8, title: "My Bar — Honour Bar & Tab",
    subs: [
      { title: "The bar menu",              id: "sub-bar-menu" },
      { title: "Adding to your tab",        id: "sub-bar-add" },
      { title: "Your current tab",          id: "sub-bar-tab" },
      { title: "Reconciliation (EC only)",  id: "sub-bar-ec" },
    ],
  },
  {
    id: "calendar", num: 9, title: "Community Calendar & Booking a Space",
    subs: [
      { title: "Booking a common space from the Calendar",  id: "sub-calendar-space" },
      { title: "The Space Bookings hub",                     id: "sub-calendar-spacehub" },
      { title: "Allow others to join",                       id: "sub-calendar-spacepromote" },
    ],
  },
  {
    id: "bookings", num: 10, title: "My Bookings",
    subs: [
      { title: "Understanding booking status", id: "sub-bookings-status" },
      { title: "My Space Bookings — editing and cancelling", id: "sub-bookings-space" },
    ],
  },
  {
    id: "voting", num: 11, title: "Voting",
    subs: [
      { title: "Casting your vote",                id: "sub-voting-cast" },
      { title: "Results and turnout",               id: "sub-voting-results" },
      { title: "Running a vote (Owner/admin only)",  id: "sub-voting-ec" },
    ],
  },
  {
    id: "special", num: 12, title: "Special Events",
    subs: [
      { title: "Special Events hub home",       id: "sub-special-home" },
      { title: "Viewing and booking events",    id: "sub-special-events" },
      { title: "Coordinator panel (EC only)",   id: "sub-special-ec" },
    ],
  },
]

// Bar section parked (feature not in scope) — see lib/features.js. Filtered
// out and the remaining sections renumbered so the guide has no gaps; flip
// BAR_ENABLED back on to restore it with correct numbering automatically.
const SECTIONS = (() => {
  let n = 0
  return RAW_SECTIONS
    .filter(s => BAR_ENABLED || s.id !== "bar")
    .map(s => (s.num === "—" ? s : { ...s, num: ++n }))
})()
const secNum = (id) => SECTIONS.find(s => s.id === id)?.num

function Section({ id, num, title, children }) {
  return (
    <section id={id} style={{ marginBottom: "3rem" }}>
      <h2 style={{
        fontSize: "1.1rem",
        fontWeight: 800,
        color: teal,
        margin: "0 0 1rem",
        paddingBottom: "0.5rem",
        borderBottom: `3px solid ${teal}`,
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
      }}>
        {num !== "—" && (
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: teal,
            color: "#fff",
            fontSize: "0.8rem",
            fontWeight: 800,
            flexShrink: 0,
          }}>{num}</span>
        )}
        {title}
      </h2>
      {children}
    </section>
  )
}

function Subsection({ id, title, ecOnly, children }) {
  return (
    <div id={id} style={{ marginBottom: "1.75rem", paddingLeft: "0.5rem", borderLeft: `3px solid ${border}`, scrollMarginTop: "1rem" }}>
      <h3 style={{
        fontSize: "0.9rem",
        fontWeight: 700,
        color: text,
        margin: "0 0 0.75rem",
        display: "flex",
        alignItems: "center",
      }}>
        {title}{ecOnly && EC_BADGE}
      </h3>
      {children}
    </div>
  )
}

function Step({ img, alt, children }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      {img && (
        <img
          src={img}
          alt={alt || ""}
          style={{
            width: "100%",
            maxWidth: 280,
            display: "block",
            margin: "0 auto 0.85rem",
            borderRadius: 12,
            border: `1px solid ${border}`,
            boxShadow: "0 2px 12px rgba(0,0,0,0.09)",
          }}
        />
      )}
      <p style={{ fontSize: "0.88rem", color: "#444", lineHeight: 1.7, margin: 0 }}>{children}</p>
    </div>
  )
}

function InfoBox({ children }) {
  return (
    <div style={{
      background: "#f0faf9",
      border: `1px solid ${teal}`,
      borderRadius: 10,
      padding: "0.75rem 1rem",
      marginBottom: "1rem",
      fontSize: "0.85rem",
      color: "#1a5c55",
      lineHeight: 1.65,
    }}>
      {children}
    </div>
  )
}

// Builds a searchable index of every Section/Subsection's real rendered text,
// straight from the DOM -- no separate content duplicated to keep in sync.
// Each Section's own entry excludes its Subsections' text (cloned + stripped)
// so a match inside a subsection doesn't also surface its whole parent
// section as a second, redundant result.
function buildSearchIndex(sections) {
  const index = []
  for (const sec of sections) {
    const secEl = typeof document !== "undefined" ? document.getElementById(sec.id) : null
    if (secEl) {
      const clone = secEl.cloneNode(true)
      clone.querySelectorAll('[id^="sub-"]').forEach(n => n.remove())
      const text = (clone.textContent || "").replace(/\s+/g, " ").trim()
      if (text) index.push({ id: sec.id, title: sec.title, sectionTitle: sec.title, text })
    }
    for (const sub of sec.subs || []) {
      const el = typeof document !== "undefined" ? document.getElementById(sub.id) : null
      if (!el) continue
      const text = (el.textContent || "").replace(/\s+/g, " ").trim()
      index.push({ id: sub.id, title: sub.title, sectionTitle: sec.title, text })
    }
  }
  return index
}

// Every query word must appear as a substring somewhere in the title or body
// -- simple, forgiving of word order, and doesn't need an exact phrase match.
// Title hits are ranked above body-only hits.
function searchIndex(index, query) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const results = []
  for (const entry of index) {
    const titleLc = entry.title.toLowerCase()
    const textLc = entry.text.toLowerCase()
    const inTitle = words.every(w => titleLc.includes(w))
    const inBody  = words.every(w => titleLc.includes(w) || textLc.includes(w))
    if (!inBody) continue
    results.push({ ...entry, score: inTitle ? 2 : 1 })
  }
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, 8)
}

// A short preview centred on the first matched word, so the result shows WHY
// it matched rather than just the start of the subsection.
function snippetFor(entry, query) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const textLc = entry.text.toLowerCase()
  let hitAt = -1
  for (const w of words) {
    const i = textLc.indexOf(w)
    if (i !== -1 && (hitAt === -1 || i < hitAt)) hitAt = i
  }
  const WINDOW = 70
  let start = hitAt === -1 ? 0 : Math.max(0, hitAt - WINDOW)
  let snippet = entry.text.slice(start, start + WINDOW * 2)
  if (start > 0) snippet = "…" + snippet
  if (start + WINDOW * 2 < entry.text.length) snippet = snippet + "…"

  const re = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig")
  const parts = snippet.split(re)
  return parts.map((part, i) =>
    words.some(w => part.toLowerCase() === w)
      ? <mark key={i} style={{ background: "#cdeee9", color: text, borderRadius: 3, padding: "0 2px" }}>{part}</mark>
      : <span key={i}>{part}</span>
  )
}

export default function HelpGuidePage() {
  const [tocOpen, setTocOpen] = useState(true)
  const [query, setQuery] = useState("")
  const [searchReady, setSearchReady] = useState(false)
  const indexRef = useRef([])

  // Build once after the guide's full content has actually mounted -- every
  // Section/Subsection needs to exist in the DOM first for textContent to be
  // real. Content is static (no async data), so a one-off build on mount is
  // enough; nothing here ever changes after first paint.
  useEffect(() => {
    indexRef.current = buildSearchIndex(SECTIONS)
    setSearchReady(true)
  }, [])

  // 2-char minimum before showing results, matching the live-search convention
  // used elsewhere in the app (Admin pickers) -- avoids a noisy result list
  // while someone's still typing the first letter or two.
  const results = useMemo(() => {
    if (!searchReady || query.trim().length < 2) return []
    return searchIndex(indexRef.current, query)
  }, [query, searchReady])

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const goToResult = (id) => {
    scrollTo(id)
    setQuery("")
  }

  const tocBtnStyle = {
    background: "none", border: "none", cursor: "pointer",
    fontFamily: "inherit", padding: 0, textAlign: "left",
    textDecoration: "underline",
  }

  return (
    <>
      <style>{PRINT_STYLE}</style>
      <div style={{ minHeight: "100vh", background: bg, fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", color: text }}>

        {/* ── Document header ── */}
        <header style={{
          background: `linear-gradient(135deg, ${teal} 0%, #1a7a6e 100%)`,
          color: "#fff",
          padding: "2rem 1.5rem 1.75rem",
          position: "relative",
        }}>
          <div className="no-print" style={{
            position: "absolute", top: "1rem", right: "1rem",
            display: "flex", flexWrap: "wrap", gap: "0.5rem",
            justifyContent: "flex-end", maxWidth: "calc(100% - 2rem)",
          }}>
            <a
              href="/home"
              style={{
                padding: "0.45rem 1rem",
                background: "rgba(255,255,255,0.2)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.4)",
                borderRadius: 20,
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >← Back to Element Happenings</a>
            <button
              onClick={() => window.print()}
              style={{
                padding: "0.45rem 1rem",
                background: "rgba(255,255,255,0.2)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.4)",
                borderRadius: 20,
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >↓ Save as PDF</button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
            <img src="/logo_hex_bee.png" alt="" style={{ width: 52, height: 52, filter: "brightness(0) invert(1) opacity(0.9)" }} />
            <div>
              <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.18em", opacity: 0.8, textTransform: "uppercase", marginBottom: 2 }}>Element Happenings</div>
              <div style={{ fontSize: "1.6rem", fontWeight: 900, lineHeight: 1.1 }}>User Guide</div>
            </div>
          </div>

          <p style={{ fontSize: "0.9rem", lineHeight: 1.65, opacity: 0.92, margin: 0, maxWidth: 560 }}>
            Welcome to Element Happenings — the community app for Fullerton Cove residents. This guide
            covers everything from signing in for the first time, to booking screenings and social
            events, joining Groups & Clubs, finding a contact or document, asking a question,
            {BAR_ENABLED ? " tracking your bar tab," : ""} and booking a common space for your own use.
            Sections marked <strong>EC only</strong> are for Element Communities coordinators and each
            area's assigned Owner.
          </p>
        </header>

        {/* ── Search ── */}
        <div className="no-print" style={{ background: "#fff", borderBottom: `1px solid ${border}`, padding: "0.85rem 1.25rem", position: "relative" }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="🔍 Search the guide… (e.g. “bring a dish”, “PIN”, “Ingenia”)"
            style={{
              width: "100%",
              padding: "0.65rem 0.9rem",
              borderRadius: 10,
              border: `1px solid ${border}`,
              background: bg,
              color: text,
              fontSize: "0.88rem",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
          {query.trim().length >= 2 && (
            <div style={{
              position: "absolute", left: "1.25rem", right: "1.25rem", top: "calc(100% - 0.4rem)",
              background: "#fff", border: `1px solid ${border}`, borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 20, maxHeight: "60vh", overflowY: "auto",
            }}>
              {results.length === 0 ? (
                <div style={{ padding: "1rem", fontSize: "0.85rem", color: muted }}>
                  No matches for “{query}”. Try a different word, or browse the sections below.
                </div>
              ) : results.map(r => (
                <button
                  key={r.id}
                  onClick={() => goToResult(r.id)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "0.7rem 0.9rem", background: "none", border: "none",
                    borderBottom: `1px solid ${border}`, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <div style={{ fontSize: "0.7rem", color: muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                    {r.sectionTitle}{r.title !== r.sectionTitle ? ` › ${r.title}` : ""}
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "#444", lineHeight: 1.5 }}>
                    {snippetFor(r, query)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Table of Contents ── */}
        <div style={{ background: "#fff", borderBottom: `1px solid ${border}` }}>
          <button
            className="no-print"
            onClick={() => setTocOpen(v => !v)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.85rem 1.25rem",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "0.85rem",
              fontWeight: 700,
              color: text,
              borderBottom: tocOpen ? `1px solid ${border}` : "none",
            }}
          >
            <span>📋 Contents</span>
            <span style={{ fontSize: "0.75rem", color: muted }}>{tocOpen ? "▲ hide" : "▼ show"}</span>
          </button>

          <div style={{ display: tocOpen ? "block" : "none" }}>
            <ol style={{ margin: 0, padding: "0.75rem 1.25rem 1rem 2.5rem", listStyle: "none" }}>
              {SECTIONS.map(s => (
                <li key={s.id} style={{ marginBottom: "0.6rem" }}>
                  <button
                    className="no-print"
                    onClick={() => scrollTo(s.id)}
                    style={{
                      ...tocBtnStyle,
                      fontSize: "0.88rem",
                      color: teal,
                      fontWeight: 700,
                      textDecorationColor: "rgba(42,157,143,0.3)",
                    }}
                  >
                    {s.num !== "—" ? `${s.num}. ` : ""}{s.title}
                  </button>
                  {s.subs && s.subs.length > 0 && (
                    <ul style={{ margin: "0.3rem 0 0 1rem", padding: 0, listStyle: "none" }}>
                      {s.subs.map(sub => (
                        <li key={sub.id} style={{ marginBottom: "0.15rem" }}>
                          <button
                            className="no-print"
                            onClick={() => scrollTo(sub.id)}
                            style={{
                              ...tocBtnStyle,
                              fontSize: "0.79rem",
                              color: "#2a7a72",
                              fontWeight: 500,
                              textDecorationColor: "rgba(42,157,143,0.2)",
                            }}
                          >
                            › {sub.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* ── Main content ── */}
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1.25rem 4rem" }}>

          {/* ── HEADER (no number) ── */}
          <Section id="header" num="—" title="Getting Around — The App Header">
            <Subsection id="sub-header-bar" title="The header bar">
              <Step img={IMG("06-movies.png")} alt="App header bar">
                Every page in Element Happenings has a header bar at the top of the screen. It has three
                parts:
              </Step>
              <Step>
                <strong>Left — Element Happenings logo.</strong> Tapping the logo takes you directly back
                to the Home page from anywhere in the app.
              </Step>
              <Step>
                <strong>Centre — Current page name.</strong> This tells you which section of the app you
                are in — for example "Show Time", "Social Events", "Calendar", or "My Bookings". It updates
                automatically as you move around the app.
              </Step>
              <Step>
                <strong>Right — Your account controls.</strong> On the right-hand side you will see up
                to three items: a bell icon for notifications (only appears when you have unread
                notifications), a <strong>?</strong> button that opens this help guide in a new tab, and
                your <strong>account pill</strong> showing your name (and your photo if you have uploaded
                one).
              </Step>
            </Subsection>

            <Subsection id="sub-header-account" title="Your account menu (avatar pill)">
              <Step>
                Tap your name or profile photo on the right-hand side of the header to open the account
                menu. This menu has three options — four if your account has admin rights:
              </Step>
              <Step>
                <strong>Administration Manual</strong> — admin accounts only. Opens a separate guide
                covering the Admin panel and admin-only screens (Page Texts, Owners, Locations, and more).
              </Step>
              <Step>
                <strong>Update Profile</strong> — change your display name, email address, and house
                number. If you upload a profile photo, it will appear in the header pill instead of your
                name.
              </Step>
              <Step>
                <strong>Change PIN</strong> — set or update your 4-digit PIN, used to sign in and
                confirm account actions.
              </Step>
              <Step>
                <strong>Sign Out</strong> — signs you out of the app completely. Tap <strong>Sign
                In</strong> on the login screen to get back in.
              </Step>
              <InfoBox>
                💡 If you see a red dot or number on the bell icon, you have unread notifications. Tap
                the bell to open the notifications panel and see what's new.
              </InfoBox>
            </Subsection>
          </Section>

          {/* ── 1. SIGN IN & REGISTER ── */}
          <Section id="access" num={secNum("access")} title="Signing In, Registering & Changing Your Password">
            <Subsection id="sub-signin" title="Sign In">
              <Step img={IMG("01-login.png")} alt="Sign In screen">
                When you open Element Happenings you will see the sign-in screen. Enter your{" "}
                <strong>username</strong> and <strong>password</strong>, then tap{" "}
                <strong>Sign In</strong>. If you have previously signed in on this device, the app
                may remember your username.
              </Step>
            </Subsection>

            <Subsection id="sub-register" title="Register — first time users">
              <Step img={IMG("02-register.png")} alt="Register screen">
                If this is your first time, tap <strong>Register</strong> at the top of the sign-in
                screen. You will need the <strong>invite code</strong> provided by your Element
                Communities coordinator — without it you cannot register. Enter the invite code, choose
                a username (something easy for you to remember), set a password, then tap{" "}
                <strong>Register</strong>. You can sign in immediately after.
              </Step>
            </Subsection>

            <Subsection id="sub-password" title="Change Password">
              <Step img={IMG("03-change-password.png")} alt="Change Password screen">
                Tap <strong>Change Password</strong> at the top of the sign-in screen. Enter your
                username, your current password, then your new password. Tap{" "}
                <strong>Change Password</strong> to save. You can sign in straight away using your
                new password.
              </Step>
            </Subsection>
          </Section>

          {/* ── 2. PROFILE ── */}
          <Section id="profile" num={secNum("profile")} title="Your Profile & PIN">
            <Subsection id="sub-profile-update" title="Updating your profile">
              <Step img={IMG("05-profile.png")} alt="Profile screen">
                Tap your name or photo in the top-right corner of any page to open the account menu,
                then tap <strong>Update Profile</strong>. From here you can update your display name,
                email address, and house number. If you want to add a profile photo, tap the avatar
                area at the top of the profile screen to choose an image.
              </Step>
            </Subsection>

            <Subsection id="sub-profile-pin" title="Changing your PIN">
              <Step>
                From the same account menu (top-right), tap <strong>Change PIN</strong>. Enter your
                current 4-digit PIN, then enter and confirm your new PIN.
              </Step>
              <InfoBox>
                💡 If you forget your PIN, contact your coordinator — they can reset it for you.
              </InfoBox>
            </Subsection>
          </Section>

          {/* ── 3. MOVIES ── */}
          <Section id="movies" num={secNum("movies")} title="Show Time — Screenings, Booking & Library">
            <Subsection id="sub-movies-home" title="Show Time Home layout">
              <Step img={IMG("06-movies.png")} alt="Show Time Home screen">
                The Show Time Home screen is your central hub for everything related to community
                screenings. It is divided into several panels stacked vertically on the page:
              </Step>
              <Step>
                <strong>Welcome message</strong> — if your coordinator has posted a message, it
                appears as a banner at the top in a warm amber and teal gradient. Tap the{" "}
                <strong>✕</strong> to dismiss it.
              </Step>
              <Step>
                <strong>Next Screening card</strong> — a teal-headed card showing the very next
                upcoming movie event. This is the most important panel on the page and is described
                in detail below.
              </Step>
              <Step>
                <strong>My Bookings card</strong> — an amber-headed card showing your next upcoming
                movie bookings (up to three). Tap <strong>View all ›</strong> to go to the full
                My Bookings page.
              </Step>
              <Step>
                <strong>Rate a Film panel</strong> — if you have recently attended a screening and
                have not yet rated the movie, a voting panel appears here. See "Rating films" below.
              </Step>
            </Subsection>

            <Subsection id="sub-movies-nextcard" title="The Next Screening card">
              <Step>
                The teal header strip shows the event name, how many days away it is, and a prompt to
                tap and book. Inside the card you will see the movie <strong>poster</strong>, title and{" "}
                <strong>date/time</strong> highlighted in teal, <strong>IMDb and Rotten Tomatoes score
                chips</strong> (tap either to read reviews), the <strong>coordinator's name</strong>,
                and a short two-line <strong>plot summary</strong>.
              </Step>
              <Step>
                At the bottom you will see either a <strong>seat count chip</strong> with a "Tap to
                book →" prompt, or a green confirmation if you have already booked.
                <strong> Tap anywhere on the card</strong> to open the full booking panel.
              </Step>
            </Subsection>

            <Subsection id="sub-movies-ratings" title="IMDb & Rotten Tomatoes ratings">
              <Step>
                You will see two rating chips on movie cards — a gold <strong>⭐ IMDb</strong> score
                and a red <strong>🍅 Rotten Tomatoes</strong> score. <strong>Tap the IMDb chip</strong>{" "}
                to open the film's full page on IMDb in a new browser tab — cast list, synopsis, and
                reviews. <strong>Tap the Rotten Tomatoes chip</strong> to search for the film on Rotten
                Tomatoes and read critic and audience reviews. Both links open safely in a new tab.
              </Step>
            </Subsection>

            <Subsection id="sub-movies-booking" title="Booking a seat">
              <Step img={IMG("10-screening-slideout.png")} alt="Booking panel">
                Tap any movie card to open the booking panel, which slides up from the bottom of the
                screen. It shows the full event details — title, poster, date, time, plot, ratings,
                coordinator name, and a real-time capacity bar (e.g. "8/20 seats taken").
              </Step>
              <Step>
                Select how many seats you need, then tap:
              </Step>
              <Step>
                <strong>Book Now</strong> — appears when seats are available. Confirms your booking
                immediately.
              </Step>
              <Step>
                <strong>Join Waitlist</strong> — appears when the screening is full. Joins the waitlist;
                you will be notified automatically if a seat opens up.
              </Step>
            </Subsection>

            <Subsection id="sub-movies-afterbook" title="After you have booked">
              <Step>
                Once booked, the panel updates to show a green confirmation: <strong>✓ X seats
                confirmed</strong>. Two buttons appear:
              </Step>
              <Step>
                <strong>Modify Seats</strong> — change the number of seats in your booking.
              </Step>
              <Step>
                <strong>Cancel Booking</strong> — cancel your reservation entirely (shown with a red
                border). Your seat is released immediately for other residents.
              </Step>
            </Subsection>

            <Subsection id="sub-movies-voting" title="Rating films — the community voting panel">
              <Step>
                The voting panel appears on Show Time Home when there are upcoming films waiting for your
                rating. It shows the film title, how many films are in your queue (e.g. "3 of 5 to
                rate"), and a grid of buttons numbered <strong>1 to 10</strong>, ranging from "Not
                interested" to "Can't wait!".
              </Step>
              <Step>
                Tap the number that matches your interest. Your rating is saved instantly and the next
                film appears. Tap <strong>Skip this one</strong> to pass, or <strong>Skip all</strong>{" "}
                to dismiss the queue. Your ratings contribute to the <strong>community score</strong>{" "}
                shown on movie cards.
              </Step>
            </Subsection>

            <Subsection id="sub-movies-scheduled" title="Scheduled screenings list">
              <Step img={IMG("07-screenings.png")} alt="Scheduled screenings">
                Tap <strong>Scheduled</strong> from the Show Time Home to see all upcoming screenings.
                Each card shows the title, date and time, IMDb and Rotten Tomatoes scores, seats
                available, and your booking status. Tap any card to open the booking panel.
              </Step>
              <Step>
                Tap <strong>Attendees</strong> on a card to expand a quick attendee list without
                leaving the page — confirmed seats first, then (for ECs and Owners only) the
                waitlist.
              </Step>
              <InfoBox>
                💡 <strong>EC only:</strong> waitlist names in this quick list are shown in queue
                order, not A-Z, with each resident's position — <strong>(1st)</strong>,{" "}
                <strong>(2nd)</strong>, and so on — to the left of their name, so you can see at a
                glance who's next in line for a seat.
              </InfoBox>
            </Subsection>

            <Subsection id="sub-movies-library" title="Suggestions library">
              <Step img={IMG("08-library.png")} alt="Suggestions library">
                The Suggestions library is a collection of films proposed by residents for future
                screenings. Browse, search, or filter by genre. Tap any title for full details
                including plot, cast, IMDb rating, and the community voting score. You can rate the
                film from this detail view.
              </Step>
            </Subsection>

            <Subsection id="sub-movies-dvd" title="DVD library">
              <Step img={IMG("09-dvd.png")} alt="DVD library">
                The DVD Library shows the community's physical disc collection. Browse or search the
                collection. Tap any title to see details and — if you think it would make a great
                screening — tap <strong>Suggest for Screening</strong> to add it to the Suggestions
                list for coordinator review.
              </Step>
            </Subsection>

            <Subsection id="sub-movies-ec" title="Coordinator panel" ecOnly>
              <Step>
                ECs see an additional <strong>Coordinator View</strong> section at the bottom of every
                booking panel — a full attendee list with names, seat counts, and unpaid tallies. ECs
                can modify a resident's seat count, cancel individual bookings, and monitor waitlist
                numbers in real time.
              </Step>
              <Step>
                If a screening has a cost attached, each attendee also gets an{" "}
                <strong>Unpaid / Paid / Partial</strong> badge — tap it to record what's been received,
                same as Groups & Clubs (see <strong>§5 Coordinator & Owner panel</strong>). A{" "}
                <strong>🧾 Submitted</strong> tag shows if the resident has already flagged themselves
                as paid, and the same Expected/Collected/Outstanding reconciliation summary, Close
                Out, and Refunds Due/Issued tracking are all here too.
              </Step>
              <Step>
                Waitlisted residents are listed in queue order (not A-Z), each with their position —{" "}
                <strong>(1st)</strong>, <strong>(2nd)</strong>, and so on — shown to the left of their
                name, so it's clear who's next in line for a seat.
              </Step>
              <InfoBox>
                💡 If Show Time has an assigned <strong>Owner</strong>, they get this same Coordinator
                view on every screening — not just the ones they're personally listed as coordinator
                for.
              </InfoBox>
              <Step>
                Next to the <strong>+ Join</strong> button on the Show Time home page (which any
                resident can tap to get notified whenever a new screening is added), the Owner and
                admins see a <strong>👥 N members</strong> count. Tapping it expands to show every
                resident who's followed Show Time, A–Z — collapse it again the same way. Nobody else
                sees this count or list.
              </Step>
              <Step>
                Adding a walk-up booking or using <strong>Modify Seats</strong> on someone's booking
                here is not held to the resident-facing per-booking seat limit — as the event's
                admin/Owner/coordinator, you can bring in as many seats as you need, up to the
                event's Total Seats. Residents self-booking through the app still get the normal
                per-booking cap.
              </Step>
            </Subsection>
          </Section>

          {/* ── 4. SOCIAL ── */}
          <Section id="social" num={secNum("social")} title="Social Events — Community Activities & Trips">
            <Subsection id="sub-social-home" title="Social hub home">
              <Step img={IMG("11-social.png")} alt="Social hub home">
                The Social hub is your home for community activities — dinners, day trips, outings,
                themed evenings, and more. The layout mirrors the Show Time Home: a <strong>Next Social
                Event</strong> card at the top (terracotta header) with the nearest upcoming event,
                followed by a <strong>My Bookings</strong> card for your social reservations.
              </Step>
              <Step>
                The Next Social Event card shows title, date, time, location, description, coordinator
                name, seat availability, and a cost chip if the event has a per-person price. A bus
                icon and driver name appear if transport is available. <strong>Tap the card</strong> to
                open the full booking panel.
              </Step>
            </Subsection>

            <Subsection id="sub-social-events" title="Viewing and booking events">
              <Step img={IMG("12-social-events.png")} alt="Social events list">
                Tap <strong>Scheduled</strong> from the Social hub to see all upcoming social events.
                Each card shows the event title, date and time, location, cost, and seat availability.
                Tap any card to open the event detail panel.
              </Step>
            </Subsection>

            <Subsection id="sub-social-detail" title="Event detail & booking">
              <Step img={IMG("13-social-slideout.png")} alt="Event detail panel">
                The event detail panel slides up from the bottom and shows the full event description,
                date, time, location (including an offsite address if applicable), coordinator name, bus
                details, cost per person, and the seat capacity bar.
              </Step>
              <Step>
                Select the number of seats you need, then tap <strong>Book Now</strong> (seats
                available) or <strong>Join Waitlist</strong> (event full). After booking, the panel
                shows your confirmation with <strong>Modify Seats</strong> and{" "}
                <strong>Cancel Booking</strong> options — the same as movie screenings.
              </Step>
            </Subsection>

            <Subsection id="sub-social-bus" title="Riding the Community Bus">
              <Step>
                Some offsite events offer a <strong>Community Bus</strong>. If one's running, an{" "}
                <strong>I need a seat on the bus</strong> checkbox appears on the booking panel — tick
                it to reserve a bus seat alongside your event booking. Bus seats are counted
                separately from event seats, so you can book the event without the bus, or book both
                together.
              </Step>
              <Step>
                If you're booking for more than one person, each named attendee has their own{" "}
                <strong>Riding the bus</strong> checkbox — the driver needs a name for every seat on
                the bus, so a bus seat can't be left unnamed.
              </Step>
              <InfoBox>
                💡 The bus has its own seat limit, separate from the event's. Once it's full, the bus
                checkbox disables and shows <strong>Bus is full</strong> — you can still book the event
                itself, you just won't have a bus seat. There's no waitlist for the bus.
              </InfoBox>
            </Subsection>

            <Subsection id="sub-social-ec" title="Coordinator panel" ecOnly>
              <Step>
                ECs see the full attendee list inside the event detail panel, with each resident's
                name, seat count, and payment status. ECs can modify a resident's seat count, cancel
                individual bookings, or update event details directly from this view.
              </Step>
              <Step>
                Where a booking is waitlist-only, it's listed in queue order with the resident's
                position — <strong>(1st)</strong>, <strong>(2nd)</strong>, and so on — shown to the
                left of their name.
              </Step>
              <InfoBox>
                💡 If Social has an assigned <strong>Owner</strong>, they get this same Coordinator
                view on every social event — not just the ones they're personally listed as
                coordinator for.
              </InfoBox>
              <Step>
                On a bus-enabled event, a 🚌 marker appears next to every resident's name (and each
                named attendee) who's riding the bus, plus a running <strong>Bus: X / Y seats
                taken</strong> count near the top of the panel — so the bus driver always has a full,
                current passenger list.
              </Step>
              <Step>
                On a paid event, tap the <strong>Unpaid / Paid</strong> switch next to a resident's
                name to record their payment. Rather than just flipping a flag, this opens a small
                form asking for the <strong>amount received</strong> (pre-filled with the full amount
                owed, but editable) and an optional <strong>comment</strong>. If the amount doesn't
                match what's owed, a comment is required — e.g. "paid $30 cash, owes $20 by Friday",
                or "overpaid, rounding, no refund needed".
              </Step>
              <Step>
                If the amount recorded is less than what's owed, the booking shows as{" "}
                <strong style={{ color: "#075985" }}>Partial</strong> — the resident still owes the
                difference, and the seat is treated the same as fully unpaid (it isn't protected from
                the waitlist, and payment reminders still apply). If the amount is more than what's
                owed, the booking is marked <strong style={{ color: "#166534" }}>Confirmed</strong> and
                the extra automatically becomes a refund owed back to the resident — it never shows as
                its own "overpaid" state.
              </Step>
              <Step>
                Tap the <strong>Unpaid / Paid</strong> switch again on an already-paid or partially-paid
                booking to correct it back to unpaid — this is a plain one-tap undo with no form, for
                fixing a mistake.
              </Step>
              <Step>
                Above the attendee list, a <strong>reconciliation summary</strong> tracks{" "}
                <strong>Expected</strong>, <strong>Collected</strong>, and <strong>Outstanding</strong>{" "}
                totals for the whole event, and calls out anything worth a second look — Submitted
                payments awaiting confirmation, or partial payments still short. Tap{" "}
                <strong>Close Out</strong> once you've reviewed everything — it reminds every unpaid
                attendee and stamps a <strong>Last reviewed</strong> date, with an amber flag if
                anything's changed since the last time.
              </Step>
              <Step>
                A cancelled booking that had already been paid (in full or partially) automatically
                appears under <strong>⚠️ Refunds Due</strong> for the amount that was actually
                received. Once the money has genuinely been handed back to the resident, tap{" "}
                <strong>Mark Refunded</strong> to acknowledge it — this moves it to{" "}
                <strong>✓ Refunds Issued</strong> below. An overpayment refund (from the amount
                recorded above) appears in the same Refunds Due list, whether or not the booking was
                ever cancelled.
              </Step>
              <Step>
                Adding a walk-up booking or using <strong>Modify Seats</strong> on someone's booking
                here is not held to the resident-facing per-booking seat limit — as the event's
                admin/Owner/coordinator, you can bring in as many seats as you need, up to the
                event's Total Seats. Residents self-booking through the app still get the normal
                per-booking cap.
              </Step>
            </Subsection>
          </Section>

          {/* ── 5. GROUPS & CLUBS (replaces the old standalone Book Club section —
              Book Club now runs on this same shared engine, see app/(app)/bookclub/page.js
              which just redirects to /clubs/book-club) ── */}
          <Section id="clubs" num={secNum("clubs")} title="Groups & Clubs — including Book Club">
            <Subsection id="sub-clubs-home" title="Groups & Clubs home">
              <Step>
                Tap <strong>Groups & Clubs</strong> from Home to see every club and interest group in
                the community — Book Club, Dinner Club, Cards, and any others that have been set up.
                Two tabs sit at the top: <strong>My Groups & Clubs</strong> (the ones you've joined —
                shown by default) and <strong>All Groups & Clubs</strong> (everything on offer). Tap a
                club's tile to open its page.
              </Step>
            </Subsection>

            <Subsection id="sub-clubs-page" title="A club's page — welcome, contact & Ask a Question">
              <Step>
                Every club page opens with a welcome message from its organiser, then a{" "}
                <strong>Contact</strong> row. If the club has an assigned Owner or coordinator, their
                name appears here — tap it to <strong>Ask a Question</strong> that goes straight to
                them privately. If no one is assigned yet, you'll see a plain{" "}
                <strong>💬 Ask a question</strong> link instead, which reaches the admin team.
              </Step>
              <Step>
                Below that, upcoming meetings or activities are listed as cards — the next date first,
                with any further dates for a recurring club (like weekly Cards) tucked into an{" "}
                <strong>Upcoming dates</strong> accordion beneath. Tap a card to open the full event
                panel and book your place, exactly like Show Time or Social.
              </Step>
            </Subsection>

            <Subsection id="sub-clubs-signup" title="Signing up for a meeting or activity">
              <Step>
                Tap a club's event card to open the booking panel, choose your seats, and confirm —
                the same booking flow as Social. After booking, you'll see{" "}
                <strong>Modify Seats</strong> and <strong>Cancel Booking</strong> options.
              </Step>
            </Subsection>

            <Subsection id="sub-clubs-bring" title="Bringing something">
              <Step>
                Some club activities ask attendees to bring something — a dish for Dinner Club, a game
                for Games Night. If it applies to that event, a <strong>Bring Something</strong> picker
                appears on the booking panel showing what's needed. It's marked either{" "}
                <strong>Optional</strong> (choose one if you'd like) or{" "}
                <strong>Required</strong> (you must choose a category before you can confirm your
                booking).
              </Step>
            </Subsection>

            <Subsection id="sub-clubs-bus" title="Riding the Community Bus">
              <Step>
                Offsite club activities can also offer the <strong>Community Bus</strong>, the same way
                Social does. Tick <strong>I need a seat on the bus</strong> on the booking panel to
                reserve one — independent of your event booking — and, for a multi-seat booking, tick
                the box for each named attendee who needs a seat.
              </Step>
              <InfoBox>
                💡 The bus has its own seat limit and no waitlist — once full, the checkbox disables and
                shows <strong>Bus is full</strong>, but your event booking still goes ahead.
              </InfoBox>
            </Subsection>

            <Subsection id="sub-clubs-bookclub" title="Book Club — current pick, suggestions & voting">
              <Step>
                Book Club works the same way as any other club, with a few extras on its page: the{" "}
                <strong>current book</strong> is shown with its cover, title and author, and if you've
                borrowed the club's copy, a reminder of when it's due back. Tap{" "}
                <strong>Suggestions</strong> to browse books other residents have put forward for a
                future pick — vote for ones you like, or add your own suggestion by searching for a
                title.
              </Step>
            </Subsection>

            <Subsection id="sub-clubs-ec" title="Coordinator & Owner panel" ecOnly>
              <Step>
                ECs and the club's assigned <strong>Owner</strong> see the full Coordinator view on
                every event in that club — attendee names, seat counts, payment status, and who's
                bringing what. They can modify a resident's seat count, cancel bookings, and
                create or edit the club's events and activities — the same options an admin has, just
                restricted to their own club.
              </Step>
              <Step>
                On a paid event, each attendee has an <strong>Unpaid / Paid / Partial</strong> badge —
                tap it to record what's been received. A <strong>🧾 Submitted</strong> tag appears
                alongside it if the resident has flagged themselves as paid from their own booking, so
                it's never invisible while you're still confirming it. Tap an already-recorded payment
                to adjust it, or use <strong>Reset to unpaid</strong> (with a confirm step) if it was
                entered in error.
              </Step>
              <Step>
                Above the attendee list, a <strong>reconciliation summary</strong> keeps a running
                total for the whole event — <strong>Expected</strong> (what everyone owes),{" "}
                <strong>Collected</strong> (what's actually been recorded), and{" "}
                <strong>Outstanding</strong> (the gap). It calls out anything that still needs a
                look — payments marked Submitted awaiting your confirmation, and partial payments
                still short of the full amount. Tap <strong>Close Out</strong> once you've checked
                everything for the period — it sends a payment reminder to everyone still unpaid and
                stamps a <strong>Last reviewed</strong> date so you (or the next coordinator) can see
                at a glance whether anything's changed since — an amber note appears if a booking has
                moved since the last close-out.
              </Step>
              <Step>
                A cancelled booking that had already been paid automatically appears under{" "}
                <strong>⚠️ Refunds Due</strong> for the amount received. Once the money's genuinely
                been handed back, tap <strong>Mark Refunded</strong> — it moves to{" "}
                <strong>✓ Refunds Issued</strong> below, so there's always a clear record of what's
                still owed versus what's already settled.
              </Step>
              <Step>
                A waitlist-only attendee is listed in queue order with their position —{" "}
                <strong>(1st)</strong>, <strong>(2nd)</strong>, and so on — shown to the left of
                their name.
              </Step>
              <InfoBox>
                💡 An Owner doesn't need to be individually added as coordinator on every event to get
                this access — it applies automatically to everything in their club, or their hub if
                they own Show Time or Social instead.
              </InfoBox>
              <Step>
                Next to the club's own <strong>Join</strong> button (which lets any resident opt in to
                that club's notices), the club's Owner and admins see a <strong>👥 N members</strong>{" "}
                count. Tapping it expands to show every member's name, A–Z — tap again to collapse.
                Nobody else sees this count or list.
              </Step>
              <Step>
                On a bus-enabled event, a 🚌 marker and running seat count show exactly who's riding —
                the same passenger-list view Social's Coordinator panel has.
              </Step>
              <Step>
                Adding a walk-up booking or using <strong>Modify Seats</strong> on someone's booking
                here is not held to the resident-facing per-booking seat limit — as the event's
                admin/Owner/coordinator, you can bring in as many seats as you need, up to the
                event's Total Seats. Residents self-booking through the app still get the normal
                per-booking cap.
              </Step>
            </Subsection>
          </Section>

          {/* ── 6. INFO ── */}
          <Section id="info" num={secNum("info")} title="Info — Contacts & Documents">
            <Subsection id="sub-info-contacts" title="Finding a contact">
              <Step>
                Tap <strong>Info</strong> from Home to browse community contacts — committee members,
                Element Communities staff, and other useful people, organised into categories. Use the
                category chips to filter, or the <strong>Search</strong> box to find someone by name.
                Tap a contact to see their details and, where available, an{" "}
                <strong>Ask a question</strong> option that routes your question to the right person or
                category.
              </Step>
              <Step>
                A <strong>Sort</strong> option above the search box lets you list the contacts by{" "}
                <strong>House #</strong> (lowest to highest — the default) or by <strong>Name</strong>{" "}
                (A to Z), whichever is easier to scan for what you're looking for.
              </Step>
            </Subsection>

            <Subsection id="sub-info-documents" title="Community documents">
              <Step>
                Tap <strong>Documents</strong> (from the Info section) to browse shared community
                files — meeting minutes, policies, forms and more — organised into categories. Use the
                category filter or the <strong>Search</strong> box to find what you need, then tap a
                document to view or download it.
              </Step>
            </Subsection>
          </Section>

          {/* ── 7. QUESTIONS ── */}
          <Section id="questions" num={secNum("questions")} title="Ask a Question">
            <Subsection id="sub-questions-ask" title="Asking a question">
              <Step>
                You'll find an <strong>Ask a question</strong> link on most hub, club and event pages —
                it goes privately to whoever is the right contact for that area (the Owner or
                coordinator, or an admin if no one's assigned). Type your question and send it; the
                other side gets notified and can reply.
              </Step>
            </Subsection>

            <Subsection id="sub-questions-mine" title="Your questions & answering">
              <Step>
                Tap <strong>Questions</strong> from Home to see every question you've asked or been
                asked. Switch between <strong>Mine</strong> (questions you've sent) and questions routed
                to you. Open a question to read the conversation and reply — you'll be notified as soon
                as the other side answers or adds a follow-up.
              </Step>
            </Subsection>
          </Section>

          {/* ── BAR (parked, feature not in scope — see lib/features.js) ── */}
          {BAR_ENABLED && (
          <Section id="bar" num={secNum("bar")} title="My Bar — Honour Bar & Tab">
            <Subsection id="sub-bar-menu" title="The bar menu">
              <Step img={IMG("16-bar.png")} alt="Bar home">
                The community bar operates on an honour system — you record what you take and settle
                your tab at the end of each period. The bar screen shows all available products
                organised by category, each with an icon, name, description, and price.
              </Step>
            </Subsection>

            <Subsection id="sub-bar-add" title="Adding to your tab">
              <Step>
                Tap <strong>+ Add to Tab</strong> on any product to record a purchase. You will be
                prompted to enter your <strong>4-digit PIN</strong> to approve the charge — this
                prevents accidental or unauthorised additions. Once confirmed, the product is added
                to your personal tab immediately.
              </Step>
              <InfoBox>
                💡 If you have not yet set a PIN, go to the account menu (top-right → Change PIN)
                and set one before using the bar.
              </InfoBox>
            </Subsection>

            <Subsection id="sub-bar-tab" title="Your current tab">
              <Step>
                Below the product menu, you can see your <strong>current open tab</strong> — a list of
                everything you have added since the last reconciliation, with quantities and a running
                total. Outstanding amounts from previous unreconciled periods are also shown so you
                have a clear picture of what you owe.
              </Step>
            </Subsection>

            <Subsection id="sub-bar-ec" title="Reconciliation" ecOnly>
              <Step>
                ECs can view all member tabs from the Bar administration panel, mark individual amounts
                as paid, and close reconciliation periods for the whole community. Once a period is
                reconciled, tabs reset to zero for the next period.
              </Step>
            </Subsection>
          </Section>
          )}

          {/* ── CALENDAR ── */}
          <Section id="calendar" num={secNum("calendar")} title="Community Calendar & Booking a Space">
            <Step img={IMG("17-calendar.png")} alt="Community calendar">
              The Calendar brings every upcoming community event together in one view — Show Time,
              Social Events, and every Group & Club (including Book Club) all appear here without
              switching between sections.
            </Step>
            <Step>
              Use the filter buttons at the top to show or hide events by type. Switch between{" "}
              <strong>Month view</strong> and <strong>Week view</strong> using the view toggle. Tap
              any event to open its full detail panel and book your place directly from the calendar.
            </Step>

            <Subsection id="sub-calendar-space" title="Booking a common space from the Calendar">
              <Step>
                At the top of the Calendar you'll find two buttons: <strong>+ Book by Date</strong> —
                pick the date and time first, then choose a free space — and{" "}
                <strong>📍 Book by Location</strong> — pick a room first and see what's already booked
                there over the next couple of weeks before choosing a free slot. Both end up at the
                same booking form and book the same way; use whichever order suits how you're thinking
                about it.
              </Step>
              <Step>
                Either way, the form checks for a clash against any other Hive booking or event using
                that space before letting you confirm.
              </Step>
              <InfoBox>
                💡 The Hive calendar only knows about Hive bookings. The Ingenia app manages the same
                spaces too, so always check and book there as well — a space showing free here isn't a
                guarantee it's free in the Ingenia app.
              </InfoBox>
              <Step>
                Some spaces are marked <strong>Request Only</strong> — these need the Ingenia Community
                Manager's sign-off before you use them. If you pick one, you'll be asked to tick a box
                confirming you've already spoken to Ingenia, and to note who you spoke to, before the
                booking can be submitted.
              </Step>
            </Subsection>

            <Subsection id="sub-calendar-spacehub" title="The Space Bookings hub">
              <Step>
                Every space booking you make — from the Calendar or from Home — also lives in its own
                dedicated <strong>Space Bookings</strong> hub, the same way Show Time and Social have
                their own Home and Scheduled pages. Reach it via the <strong>Book a Space</strong> pill
                near the top of your Home page, which also shows your soonest upcoming shared space
                booking (<em>"Next: [event] — [date]"</em>) once you have one.
              </Step>
              <Step>
                The hub's own Home page has a <strong>Book a Space</strong> button (this is the
                Book by Location flow), a <strong>Next Scheduled Space</strong> preview of the soonest
                space booking open to any resident, with an <strong>Edit</strong> button for the organiser, and
                your <strong>My Space Bookings</strong> panel underneath — see "My Space Bookings —
                editing and cancelling" below for what that shows and how to manage a booking.
              </Step>
              <Step>
                Tap <strong>Scheduled</strong> to see every upcoming space booking you could join —
                bookings other residents have opened up via "Allow others to join" (see below), shown the full event-card format every other hub uses — date/time, location, coordinator, a bus row if relevant, and a capacity bar, plus a <strong>▼ Attendees</strong> toggle to see who's booked in. If you're the organiser, an <strong>Edit</strong> button sits next to the status pill. A
                booking still just for one person doesn't appear here (there's nothing to book into),
                the same way it wouldn't be visible on any other hub's Scheduled list until it's a
                real, joinable event.
              </Step>
            </Subsection>

            <Subsection id="sub-calendar-spacepromote" title="Allow others to join">
              <Step>
                Booked a space for something other residents might want to come along to? Open the
                booking from <strong>My Space Bookings</strong> and tap{" "}
                <strong>Allow others to join</strong>. This turns your personal booking into a shared
                event other residents can see and book into — give it a title, a total number of
                seats, and how many seats one person can book at once.
              </Step>
              <Step>
                Once shared, it behaves just like any other Hive event: it appears on the Calendar and
                in <strong>Scheduled</strong> for everyone, and residents book a seat the same way they
                would for a Show Time screening or Social event.
              </Step>
            </Subsection>
          </Section>

          {/* ── 8. MY BOOKINGS ── */}
          <Section id="bookings" num={secNum("bookings")} title="My Bookings">
            <Step img={IMG("18-bookings.png")} alt="My Bookings screen">
              My Bookings shows all your current reservations across every section of the app —
              Show Time, Social Events, and Book Club — in one place. Use the filter tabs at the top
              to narrow the list. Tap any card to open the event detail panel and manage your seat.
            </Step>

            <Subsection id="sub-bookings-status" title="Understanding booking status">
              <Step>
                <strong style={{ color: "#92400e" }}>Booked</strong> — your seat is reserved and held,
                but payment has not yet been recorded by the coordinator.
              </Step>
              <Step>
                <strong style={{ color: "#075985" }}>Partial</strong> — the coordinator has recorded
                some payment against your booking, but not the full amount yet. You'll get a
                notification saying how much is still owing. Your seat isn't any more secure than
                Booked until the balance is paid in full.
              </Step>
              <Step>
                <strong style={{ color: "#166534" }}>Confirmed</strong> — your seat is secured and
                paid. No further action needed unless you want to modify or cancel. If you happened to
                pay more than was owed, the extra shows up as a refund due back to you rather than
                changing this status.
              </Step>
              <Step>
                <strong style={{ color: "#64748b" }}>Waitlisted</strong> — the event was full when
                you registered. You will be notified automatically if a confirmed seat opens up.
              </Step>
            </Subsection>

            <Subsection id="sub-bookings-space" title="My Space Bookings — editing and cancelling">
              <Step>
                Every space you've booked appears in <strong>My Space Bookings</strong>, grouped by
                location with the soonest booking at each location listed first — this includes both
                bookings made just for yourself and any shared space events you're booked into,
                whether you started them yourself (see "Allow others to join") or joined one someone
                else opened up.
              </Step>
              <Step>
                Tap a private (not-yet-shared) booking to open its edit sheet. From there you can{" "}
                <strong>Allow others to join</strong> to turn it into a shared event,{" "}
                <strong>Save changes</strong> after adjusting its date, time, or location — this still
                runs the same clash-check and, if you switch to a Request Only space, still asks for
                Ingenia's sign-off — or tap <strong>Cancel this booking</strong> at the bottom to
                release it entirely.
              </Step>
              <Step>
                Tap a shared space event and it opens the same way any other Hive event does, with
                booking and seat details rather than the edit form above. If you're the organiser, an <strong>Edit</strong> button next to the status pill lets you change the title, total seats, or naming requirement — the date, time, and location stay fixed once a booking is shared.
              </Step>
              <InfoBox>
                💡 Editing a space booking checks the new date/time/location for clashes before
                saving — if it isn't free, you'll be asked to pick a different slot rather than
                losing your existing booking.
              </InfoBox>
            </Subsection>
          </Section>

          {/* ── 9. VOTING ── */}
          <Section id="voting" num={secNum("voting")} title="Voting">
            <Step>
              Voting is used for occasional community decisions — like a committee election — and
              only appears on Home while an admin has it switched on. If you don't see a Voting
              tile, there's nothing currently active.
            </Step>

            <Subsection id="sub-voting-cast" title="Casting your vote">
              <Step>
                Open the Voting tile and tap the vote you want to take part in. Depending on how it
                was set up, you'll either pick exactly one option or up to a stated number of
                options. Once you tap <strong>Cast my vote</strong>, that's final — you can't change
                it afterwards, and the app won't let you vote twice.
              </Step>
              <Step>
                Some votes are set up as <strong>one vote per household</strong> rather than one per
                resident. If someone else at your address has already voted, you won't be able to
                vote again — and if your unit's house number isn't registered against your account,
                contact the office to get it added before a household vote opens.
              </Step>
              <InfoBox>
                🔒 Your vote itself is always anonymous — the app can confirm that you voted, but
                never records which option you chose against your name. Nobody, including admins,
                can see how an individual voted.
              </InfoBox>
            </Subsection>

            <Subsection id="sub-voting-results" title="Results and turnout">
              <Step>
                Once a vote closes, results appear on the same screen — but only once an admin has
                reviewed and published them. Whether you can see the final count, and whether you
                can see how many people voted at all, depends on choices made when that particular
                vote was set up; some votes keep one or both of those private.
              </Step>
            </Subsection>

            <Subsection id="sub-voting-ec" title="Running a vote (Owner/admin only)" ecOnly>
              <Step>
                An admin, or this hub's Owner, can start a new vote from the Voting page — set a
                title, add choices, decide who's eligible (every resident, or one per household), how
                many choices someone can pick, whether a candidate can vote for themselves, and who
                gets to see the outcome and turnout.
              </Step>
              <Step>
                A new vote starts as a <strong>Draft</strong> — nothing is visible to residents until
                you set a closing date/time and tap <strong>Open this vote</strong>. It closes
                automatically once that date/time passes; nobody needs to do anything for that part.
              </Step>
              <Step>
                Tapping <strong>Open this vote</strong> sends every active resident a notification
                (and a phone alert, if they've enabled those) letting them know voting is open and
                when it closes — there's no separate "announce this" step. Nothing is sent while
                the vote is still a Draft.
              </Step>
              <Step>
                Once closed, review the vote before publishing — for a per-household vote, the app
                flags any household that recorded more than one vote so you can check it before
                results go out. Tap <strong>Publish results</strong> once you're satisfied.
              </Step>
              <InfoBox>
                💡 The Voting tile itself can be switched on or off from{" "}
                <strong>Manage Voting</strong> (reached from the Voting page) — admins only. Turn it
                off between voting periods so it doesn't sit unused on Home.
              </InfoBox>
            </Subsection>
          </Section>
          <Section id="special" num={secNum("special")} title="Special Events">
            <Step>
              Special Events is used for one-off occasions outside the usual hubs — like a fete or
              a fundraiser — and only appears on Home while an admin has it switched on. If you
              don't see a Special Events tile, there's nothing currently active.
            </Step>

            <Subsection id="sub-special-home" title="Special Events hub home">
              <Step>
                Works the same way as Social's Home page: the next upcoming Special Event shows at
                the top with its date, time, location and coordinator, along with a seats-remaining
                bar. Tap it to see the full event and book your spot. Your own upcoming bookings
                across every Special Event appear below that.
              </Step>
            </Subsection>

            <Subsection id="sub-special-events" title="Viewing and booking events">
              <Step>
                Tap <strong>Scheduled</strong> from the hub home to see every upcoming Special
                Event. Booking works exactly like Social — pick your seats, add anyone else coming
                with you if the event allows it, and confirm. If an event is full, you'll be offered
                a spot on the waitlist instead.
              </Step>
            </Subsection>

            <Subsection id="sub-special-ec" title="Coordinator panel" ecOnly>
              <Step>
                An admin, or the Event Coordinator(s) assigned to a Special Event, can create and
                edit that event and see who's booked — the same panel Social uses. There's no
                separate Owner role for this hub: only admins and that event's own coordinators can
                manage it.
              </Step>
              <Step>
                A Special Event can be set up to allow <strong>unassigned seats</strong> — a plain
                headcount an admin or coordinator adds for people who turned up without booking
                (walk-ins), rather than a named booking. Turn this on and set the number in the
                event's edit form; it counts against the event's Total Seats the same as any named
                booking does, but doesn't appear anywhere in the attendee list since it isn't tied
                to a resident or contact.
              </Step>
              <Step>
                Adding a walk-up booking or using <strong>Modify Seats</strong> on someone's booking
                here is not held to the resident-facing per-booking seat limit — as the event's
                admin/Owner/coordinator, you can bring in as many seats as you need, up to the
                event's Total Seats. Residents self-booking through the app still get the normal
                per-booking cap.
              </Step>
            </Subsection>
          </Section>


          {/* Footer */}
          <div style={{
            marginTop: "2rem",
            paddingTop: "1.5rem",
            borderTop: `1px solid ${border}`,
            textAlign: "center",
          }}>
            <img src="/logo_hex_bee.png" alt="" style={{ width: 36, height: 36, opacity: 0.4, marginBottom: "0.5rem" }} />
            <p style={{ fontSize: "0.8rem", color: muted, margin: 0, lineHeight: 1.6 }}>
              Element Happenings — Fullerton Cove Community App<br />
              Need further help? Speak to your Element Communities coordinator.
            </p>
          </div>

        </div>
      </div>
    </>
  )
}
