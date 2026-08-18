"use client"
import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@/lib/UserContext"
import { BAR_ENABLED } from "@/lib/features"

const PRINT_STYLE = `
  @media print {
    .no-print { display: none !important; }
    .print-break { page-break-before: always; break-before: page; }
    body { background: #fff !important; }
    section { break-inside: avoid; page-break-inside: avoid; }
    h2 { page-break-after: avoid; break-after: avoid; }
    a { color: inherit !important; text-decoration: none !important; }
  }
`

const amber  = "#c8791a"
const text   = "#2d2d2d"
const muted  = "#666"
const border = "#e2e8f0"
const bg     = "#faf8f5"

// This guide documents what the admin panel and admin-only screens actually
// do today, checked against the live source (app/(app)/admin/page.js and the
// screens it links out to) rather than written from memory — see CLAUDE.md's
// "Known Dead Code — Left In Place" note (2026-08-18) for the one thing this
// guide deliberately does NOT describe: an unreachable, unused Notices tab
// that isn't part of either real notice system below.

const RAW_SECTIONS = [
  {
    id: "getting-in", num: 1, title: "Getting to Admin",
    subs: [
      { title: "Who sees this",           id: "sub-admin-who" },
      { title: "Opening the Admin panel", id: "sub-admin-open" },
    ],
  },
  {
    id: "pagetexts", num: 2, title: "Page Texts — Wording Across the App",
    subs: [
      { title: "Hive Home — the Main & Sub Notices", id: "sub-pt-home" },
      { title: "Show Time, Social & Library wording", id: "sub-pt-other" },
      { title: "Loan caps",                            id: "sub-pt-loancap" },
    ],
  },
  {
    id: "showtime", num: 3, title: "Show Time Admin",
    subs: [
      { title: "Suggested",  id: "sub-st-suggested" },
      { title: "Ownership",  id: "sub-st-ownership" },
      { title: "Streaming",  id: "sub-st-streaming" },
    ],
  },
  {
    id: "bookclub", num: 4, title: "Book Club Admin",
    subs: [
      { title: "Tracking who has the book", id: "sub-bc-tracking" },
    ],
  },
  {
    id: "clubs", num: 5, title: "Groups & Clubs Admin",
    subs: [
      { title: "Creating and editing a club", id: "sub-clubs-create" },
      { title: "Archiving a club",             id: "sub-clubs-archive" },
      { title: "Club Notices live on the club's own page — not here", id: "sub-clubs-notices" },
    ],
  },
  {
    id: "owners", num: 6, title: "Owners — Who Gets Each Hub's Questions",
    subs: [
      { title: "How Owners work", id: "sub-owners-how" },
    ],
  },
  {
    id: "locations", num: 7, title: "Locations",
    subs: [
      { title: "Venues",   id: "sub-loc-venues" },
      { title: "Bookings", id: "sub-loc-bookings" },
    ],
  },
  {
    id: "tools", num: 8, title: "Tools — DVD Library Enrichment",
    subs: [
      { title: "Running enrichment",   id: "sub-tools-run" },
      { title: "Failure catalogue",    id: "sub-tools-fail" },
    ],
  },
  {
    id: "accounts", num: 9, title: "Resident Accounts — Info › Contacts",
    subs: [
      { title: "Editing a resident's account", id: "sub-acc-edit" },
      { title: "Creating a login for a resident", id: "sub-acc-create" },
    ],
  },
  {
    id: "notices-ref", num: 10, title: "Quick Reference — the Two Real Notice Systems",
    subs: [
      { title: "Home banner vs. Club notices", id: "sub-notices-ref" },
    ],
  },
]

const SECTIONS = (() => {
  let n = 0
  return RAW_SECTIONS
    .filter(s => BAR_ENABLED || s.id !== "bar")
    .map(s => (s.num === "—" ? s : { ...s, num: ++n }))
})()

function Section({ id, num, title, children }) {
  return (
    <section id={id} style={{ marginBottom: "3rem" }}>
      <h2 style={{
        fontSize: "1.1rem", fontWeight: 800, color: amber, margin: "0 0 1rem",
        paddingBottom: "0.5rem", borderBottom: `3px solid ${amber}`,
        display: "flex", alignItems: "center", gap: "0.6rem",
      }}>
        {num !== "—" && (
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, borderRadius: "50%", background: amber, color: "#fff",
            fontSize: "0.8rem", fontWeight: 800, flexShrink: 0,
          }}>{num}</span>
        )}
        {title}
      </h2>
      {children}
    </section>
  )
}

function Subsection({ id, title, children }) {
  return (
    <div id={id} style={{ marginBottom: "1.75rem", paddingLeft: "0.5rem", borderLeft: `3px solid ${border}`, scrollMarginTop: "1rem" }}>
      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: text, margin: "0 0 0.75rem" }}>{title}</h3>
      {children}
    </div>
  )
}

function Step({ children }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <p style={{ fontSize: "0.88rem", color: "#444", lineHeight: 1.7, margin: 0 }}>{children}</p>
    </div>
  )
}

function InfoBox({ children }) {
  return (
    <div style={{
      background: "#fdf3e7", border: `1px solid ${amber}`, borderRadius: 10,
      padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.85rem", color: "#7a4a0e", lineHeight: 1.65,
    }}>{children}</div>
  )
}

function WarnBox({ children }) {
  return (
    <div style={{
      background: "#fdecea", border: "1px solid #e53e3e", borderRadius: 10,
      padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.85rem", color: "#8a2a22", lineHeight: 1.65,
    }}>{children}</div>
  )
}

// Same searchable-DOM approach as /help-guide -- no separate content copy to
// keep in sync, built once after mount from what's actually rendered.
function buildSearchIndex(sections) {
  const index = []
  for (const sec of sections) {
    const secEl = typeof document !== "undefined" ? document.getElementById(sec.id) : null
    if (secEl) {
      const clone = secEl.cloneNode(true)
      clone.querySelectorAll('[id^="sub-"]').forEach(n => n.remove())
      const t = (clone.textContent || "").replace(/\s+/g, " ").trim()
      if (t) index.push({ id: sec.id, title: sec.title, sectionTitle: sec.title, text: t })
    }
    for (const sub of sec.subs || []) {
      const el = typeof document !== "undefined" ? document.getElementById(sub.id) : null
      if (!el) continue
      const t = (el.textContent || "").replace(/\s+/g, " ").trim()
      index.push({ id: sub.id, title: sub.title, sectionTitle: sec.title, text: t })
    }
  }
  return index
}

function searchIndex(index, query) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const results = []
  for (const entry of index) {
    const titleLc = entry.title.toLowerCase()
    const textLc = entry.text.toLowerCase()
    const inTitle = words.every(w => titleLc.includes(w))
    const inBody = words.every(w => titleLc.includes(w) || textLc.includes(w))
    if (!inBody) continue
    results.push({ ...entry, score: inTitle ? 2 : 1 })
  }
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, 8)
}

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
      ? <mark key={i} style={{ background: "#f6dcae", color: text, borderRadius: 3, padding: "0 2px" }}>{part}</mark>
      : <span key={i}>{part}</span>
  )
}

export default function AdminGuidePage() {
  const { member, loading } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (!loading && member && !member.is_admin) router.replace('/home')
  }, [member, loading, router])

  const [tocOpen, setTocOpen] = useState(true)
  const [query, setQuery] = useState("")
  const [searchReady, setSearchReady] = useState(false)
  const indexRef = useRef([])

  useEffect(() => {
    if (loading || !member?.is_admin) return
    indexRef.current = buildSearchIndex(SECTIONS)
    setSearchReady(true)
  }, [loading, member])

  const results = useMemo(() => {
    if (!searchReady || query.trim().length < 2) return []
    return searchIndex(indexRef.current, query)
  }, [query, searchReady])

  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  const goToResult = (id) => { scrollTo(id); setQuery("") }

  const tocBtnStyle = { background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, textAlign: "left", textDecoration: "underline" }

  // Auth gate is inherited from app/(app)/layout.js (redirects to /login with
  // no session); this is the admin-only gate on top of that, same pattern as
  // AdminPage itself.
  if (loading || !member) return null
  if (!member.is_admin) return null

  return (
    <>
      <style>{PRINT_STYLE}</style>
      <div style={{ minHeight: "100vh", background: bg, fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", color: text }}>

        <header style={{ background: `linear-gradient(135deg, ${amber} 0%, #a35f10 100%)`, color: "#fff", padding: "2rem 1.5rem 1.75rem", position: "relative" }}>
          <button className="no-print" onClick={() => window.print()} style={{
            position: "absolute", top: "1rem", right: "1rem", padding: "0.45rem 1rem",
            background: "rgba(255,255,255,0.2)", color: "#fff", border: "1px solid rgba(255,255,255,0.4)",
            borderRadius: 20, fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>↓ Save as PDF</button>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
            <img src="/logo_hex_bee.png" alt="" style={{ width: 52, height: 52, filter: "brightness(0) invert(1) opacity(0.9)" }} />
            <div>
              <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.18em", opacity: 0.8, textTransform: "uppercase", marginBottom: 2 }}>Element Happenings</div>
              <div style={{ fontSize: "1.6rem", fontWeight: 900, lineHeight: 1.1 }}>Administration Manual</div>
            </div>
          </div>

          <p style={{ fontSize: "0.9rem", lineHeight: 1.65, opacity: 0.92, margin: 0, maxWidth: 560 }}>
            What every screen in the Admin panel actually does, checked against the live app rather than
            written from memory. Visible only to accounts with admin rights.
          </p>
        </header>

        <div className="no-print" style={{ background: "#fff", borderBottom: `1px solid ${border}`, padding: "0.85rem 1.25rem", position: "relative" }}>
          <input
            type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="🔍 Search the manual… (e.g. “notice”, “loan cap”, “archive a club”)"
            style={{ width: "100%", padding: "0.65rem 0.9rem", borderRadius: 10, border: `1px solid ${border}`, background: bg, color: text, fontSize: "0.88rem", fontFamily: "inherit", boxSizing: "border-box" }}
          />
          {query.trim().length >= 2 && (
            <div style={{ position: "absolute", left: "1.25rem", right: "1.25rem", top: "calc(100% - 0.4rem)", background: "#fff", border: `1px solid ${border}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 20, maxHeight: "60vh", overflowY: "auto" }}>
              {results.length === 0 ? (
                <div style={{ padding: "1rem", fontSize: "0.85rem", color: muted }}>No matches for "{query}". Try a different word, or browse the sections below.</div>
              ) : results.map(r => (
                <button key={r.id} onClick={() => goToResult(r.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "0.7rem 0.9rem", background: "none", border: "none", borderBottom: `1px solid ${border}`, cursor: "pointer", fontFamily: "inherit" }}>
                  <div style={{ fontSize: "0.7rem", color: muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                    {r.sectionTitle}{r.title !== r.sectionTitle ? ` › ${r.title}` : ""}
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "#444", lineHeight: 1.5 }}>{snippetFor(r, query)}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: "#fff", borderBottom: `1px solid ${border}` }}>
          <button className="no-print" onClick={() => setTocOpen(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.85rem 1.25rem", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "0.85rem", fontWeight: 700, color: text, borderBottom: tocOpen ? `1px solid ${border}` : "none" }}>
            <span>📋 Contents</span>
            <span style={{ fontSize: "0.75rem", color: muted }}>{tocOpen ? "▲ hide" : "▼ show"}</span>
          </button>
          <div style={{ display: tocOpen ? "block" : "none" }}>
            <ol style={{ margin: 0, padding: "0.75rem 1.25rem 1rem 2.5rem", listStyle: "none" }}>
              {SECTIONS.map(s => (
                <li key={s.id} style={{ marginBottom: "0.6rem" }}>
                  <button className="no-print" onClick={() => scrollTo(s.id)} style={{ ...tocBtnStyle, fontSize: "0.88rem", color: amber, fontWeight: 700, textDecorationColor: "rgba(200,121,26,0.3)" }}>
                    {s.num !== "—" ? `${s.num}. ` : ""}{s.title}
                  </button>
                  {s.subs && s.subs.length > 0 && (
                    <ul style={{ margin: "0.3rem 0 0 1rem", padding: 0, listStyle: "none" }}>
                      {s.subs.map(sub => (
                        <li key={sub.id} style={{ marginBottom: "0.15rem" }}>
                          <button className="no-print" onClick={() => scrollTo(sub.id)} style={{ ...tocBtnStyle, fontSize: "0.79rem", color: "#a35f10", fontWeight: 500, textDecorationColor: "rgba(200,121,26,0.2)" }}>
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

        <div style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1.25rem 4rem" }}>

          <Section id="getting-in" num={1} title="Getting to Admin">
            <Subsection id="sub-admin-who" title="Who sees this">
              <Step>
                Admin rights are set per account (the <strong>is_admin</strong> flag on your member
                record) — this manual, the Admin panel, and every screen it covers are only visible if
                your account has that flag set. Everyone else who opens this page is redirected straight
                back to Home.
              </Step>
            </Subsection>
            <Subsection id="sub-admin-open" title="Opening the Admin panel">
              <Step>
                Tap your account pill in the top-right of the header, then <strong>Administration
                Manual</strong> (this page) or use the <strong>Admin</strong> footer/nav icon to open the
                Admin panel itself. The panel opens as a card grid: <strong>Page Texts, Show Time, Book
                Club, Groups & Clubs, Owners, Locations, Tools</strong>{BAR_ENABLED ? ", Bar" : ""}. Tap
                any card to open that section; the <strong>← Admin</strong> link at the top of each
                section takes you back to the grid.
              </Step>
              <Step>
                Resident account editing (adding a login, changing a resident's details) is <strong>not</strong>{" "}
                in this grid — it lives at <strong>Info → Contacts</strong>, covered in Section 9 below.
              </Step>
            </Subsection>
          </Section>

          <Section id="pagetexts" num={2} title="Page Texts — Wording Across the App">
            <Subsection id="sub-pt-home" title="Hive Home — the Main & Sub Notices">
              <Step>
                This is the actual, working way to change what residents see on the <strong>Home</strong>{" "}
                screen banner. Open <strong>Admin → Page Texts → Hive Home</strong>. The main text box is
                the <strong>Main Notice</strong> shown at the top of Home; below it you can add, edit, or
                remove any number of <strong>Sub Notices</strong> — each one its own rich-text box with a{" "}
                <strong>×</strong> to remove it.
              </Step>
              <InfoBox>
                💡 If you're looking for "where do I post a notice", this Hive Home section is it for the
                whole-community Home banner. See Section 10 for how this differs from a Group/Club notice.
              </InfoBox>
            </Subsection>
            <Subsection id="sub-pt-other" title="Show Time, Social & Library wording">
              <Step>
                The same Page Texts screen has a section for every other editable area of wording:{" "}
                <strong>Show Time Home</strong> (welcome message), <strong>Show Time — Suggestions</strong>,{" "}
                <strong>Show Time — DVD Library</strong>, <strong>Social Events</strong>, <strong>Library
                Home</strong>, and <strong>Library — Books</strong>. Each is independent — editing one
                doesn't touch the others — and each has its own Save button.
              </Step>
            </Subsection>
            <Subsection id="sub-pt-loancap" title="Loan caps">
              <Step>
                Two sections — <strong>Show Time — DVD Library</strong> and <strong>Library —
                Books</strong> — also carry a numeric <strong>loan cap</strong>: the maximum number of
                DVDs or books a resident can have checked out at once. Set alongside that section's
                welcome text, saved together.
              </Step>
            </Subsection>
          </Section>

          <Section id="showtime" num={3} title="Show Time Admin">
            <Subsection id="sub-st-suggested" title="Suggested">
              <Step>
                A read-only list of every movie residents have suggested for viewing (not DVD-owned
                titles), showing whether it's already in the DVD library, on one of the community's
                streaming services, or privately owned by a resident — a quick FREE-vs-COST check before
                scheduling a screening.
              </Step>
            </Subsection>
            <Subsection id="sub-st-ownership" title="Ownership">
              <Step>
                Tracks which residents privately own a copy (DVD or digital) of a suggested title. Used
                alongside Suggested and Streaming to work out whether a screening can run at no cost.
              </Step>
            </Subsection>
            <Subsection id="sub-st-streaming" title="Streaming">
              <Step>
                Manages which streaming services the community currently has access to — this list is
                what the Suggested view checks titles against.
              </Step>
            </Subsection>
          </Section>

          <Section id="bookclub" num={4} title="Book Club Admin">
            <Subsection id="sub-bc-tracking" title="Tracking who has the book">
              <Step>
                Lists every Book Club member currently holding a physical copy of the current pick, when
                it's due back, and lets you mark a copy as returned once it comes back.
              </Step>
            </Subsection>
          </Section>

          <Section id="clubs" num={5} title="Groups & Clubs Admin">
            <Subsection id="sub-clubs-create" title="Creating and editing a club">
              <Step>
                Add a new Group/Club (name, colour, description, contact/welcome text) or edit an existing
                one from the same list. Each club can be given its own accent colour, distinct from the
                other hubs.
              </Step>
            </Subsection>
            <Subsection id="sub-clubs-archive" title="Archiving a club">
              <Step>
                Archiving hides a club from <strong>Groups & Clubs</strong> without deleting its history —
                use this instead of deleting when a club is winding down but you want to keep its past
                events and records.
              </Step>
            </Subsection>
            <Subsection id="sub-clubs-notices" title="Club Notices live on the club's own page — not here">
              <WarnBox>
                ⚠ There is no "post a club notice" control inside this Admin panel. Each club's{" "}
                <strong>📣 Post notice</strong> button is on that club's own page (Groups & Clubs → the
                club → Post notice), usable by that club's assigned Owner or an app admin. Posting there
                notifies everyone who has joined that club. Social has no equivalent — this is
                Groups/Clubs only. See Section 10 for how this differs from the Home banner in Section 2.
              </WarnBox>
            </Subsection>
          </Section>

          <Section id="owners" num={6} title="Owners — Who Gets Each Hub's Questions">
            <Subsection id="sub-owners-how" title="How Owners work">
              <Step>
                Owners are the residents who receive questions asked on a hub's page and are shown as its
                contact. This screen assigns Owners separately for <strong>Show Time</strong>,{" "}
                <strong>Social</strong>, and <strong>Library</strong>. App admins always receive Home
                questions as a fallback, so admins don't need to be listed here as well.
              </Step>
            </Subsection>
          </Section>

          <Section id="locations" num={7} title="Locations">
            <Subsection id="sub-loc-venues" title="Venues">
              <Step>
                The on-site venues offered when creating any event, in any hub or club. Add a venue by
                name; tap one to expand its settings — capacity, whether it's currently open or closed
                for bookings (with an optional date range and reason), and whether it's{" "}
                <strong>Request Only</strong> (bookings need confirming rather than being auto-approved).
              </Step>
              <InfoBox>
                💡 A venue can be deleted only if it has no historical bookings and isn't currently a
                hub's nominated default venue — otherwise, hide it instead. Hiding keeps it on past events
                but removes it from the picker for new ones.
              </InfoBox>
            </Subsection>
            <Subsection id="sub-loc-bookings" title="Bookings">
              <Step>
                A combined view of every personal space booking and event booked against the community's
                venues, sortable by date or by space — useful for spotting a clash or checking what's on
                where before approving a Request Only booking.
              </Step>
            </Subsection>
          </Section>

          <Section id="tools" num={8} title="Tools — DVD Library Enrichment">
            <Subsection id="sub-tools-run" title="Running enrichment">
              <Step>
                Runs in batches of 50, pulling poster art and metadata for DVD library titles that don't
                have it yet from TMDB/OMDb, and skips anything already marked "not found" from a previous
                run. Keep the tab open while it runs — you'll see a live count of titles enriched, skipped
                (no match), and failed (API error), with a <strong>Stop</strong> button if you need to
                pause partway through.
              </Step>
            </Subsection>
            <Subsection id="sub-tools-fail" title="Failure catalogue">
              <Step>
                A persistent, DB-backed list of every title that's ever come back "not found" or "API
                error" across all previous enrichment runs, split into those two groups — load it on
                demand rather than it being fetched automatically.
              </Step>
            </Subsection>
          </Section>

          <Section id="accounts" num={9} title="Resident Accounts — Info › Contacts">
            <Subsection id="sub-acc-edit" title="Editing a resident's account">
              <Step>
                Admin-only edit controls appear directly on each resident's entry at{" "}
                <strong>Info → Contacts</strong> — not inside the Admin panel itself. From here you can
                update a resident's details, and admins can see and manage entries hidden from ordinary
                residents (marked "Private" or "Hidden").
              </Step>
            </Subsection>
            <Subsection id="sub-acc-create" title="Creating a login for a resident">
              <Step>
                Also on the Contacts screen — create a new login for a resident who doesn't have one yet,
                linking it to their existing contact entry.
              </Step>
            </Subsection>
          </Section>

          <Section id="notices-ref" num={10} title="Quick Reference — the Two Real Notice Systems">
            <Subsection id="sub-notices-ref" title="Home banner vs. Club notices">
              <Step>
                Element Happenings has exactly two working ways to post a notice — if a resident asks
                "where's my notice gone" or "how do I post one", check which of these they mean:
              </Step>
              <Step>
                <strong>1. Home banner (Main + Sub Notices)</strong> — community-wide, shown to every
                resident on the Home screen. Set at <strong>Admin → Page Texts → Hive Home</strong>{" "}
                (Section 2 above). Admin-only.
              </Step>
              <Step>
                <strong>2. Group/Club notices</strong> — scoped to one Group/Club, posted from{" "}
                <strong>that club's own page</strong> (not from Admin), notifying everyone who's joined
                it. Usable by that club's Owner or an app admin. No equivalent exists for Social.
              </Step>
              <InfoBox>
                💡 There is no third, general-purpose "notices" screen anywhere in Admin — if you spot one
                that looks unfinished or doesn't seem to do anything, it isn't one of the two systems
                above; flag it rather than assuming it's how to post something.
              </InfoBox>
            </Subsection>
          </Section>

          <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: `1px solid ${border}`, textAlign: "center" }}>
            <img src="/logo_hex_bee.png" alt="" style={{ width: 36, height: 36, opacity: 0.4, marginBottom: "0.5rem" }} />
            <p style={{ fontSize: "0.8rem", color: muted, margin: 0, lineHeight: 1.6 }}>
              Element Happenings — Administration Manual<br />
              Reflects the live app as of 2026-08-18. If a screen has changed since, trust the app over this page and flag the drift.
            </p>
          </div>

        </div>
      </div>
    </>
  )
}
