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
// DO — the resulting behaviour of each setting/toggle — checked line-by-line
// against the live source (app/(app)/admin/page.js, lib/clubs.js, lib/spaces.js,
// lib/questionRouting.js, ResidentEditPanel.js, and the screens they feed)
// rather than paraphrased from the field labels. Where a setting's behaviour
// surprised even the person who requested this guide (Request Only being a
// self-declaration, not an approval queue), that's flagged explicitly rather
// than smoothed over — the whole point of this page is that "what it's
// called" and "what it does" aren't always the same thing.
//
// See CLAUDE.md's "Known Dead Code — Left In Place" note (2026-08-18) for the
// one thing this guide deliberately does NOT describe: an unreachable,
// unused Notices tab that isn't part of either real notice system in
// Section 11.

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
      { title: "Happenings Home — the Main & Sub Notices", id: "sub-pt-home" },
      { title: "Show Time, Social & Library wording", id: "sub-pt-other" },
      { title: "Loan caps — what happens at the limit", id: "sub-pt-loancap" },
    ],
  },
  {
    id: "showtime", num: 3, title: "Show Time Admin",
    subs: [
      { title: "Suggested — read-only, no actions here", id: "sub-st-suggested" },
      { title: "Ownership — what adding a record actually changes", id: "sub-st-ownership" },
      { title: "Streaming — what the service list controls", id: "sub-st-streaming" },
    ],
  },
  {
    id: "bookclub", num: 4, title: "Book Club Admin",
    subs: [
      { title: "This screen is cross-club, not Book-Club-only", id: "sub-bc-scope" },
      { title: 'What “Mark returned” actually does', id: "sub-bc-tracking" },
    ],
  },
  {
    id: "clubs", num: 5, title: "Groups & Clubs Admin",
    subs: [
      { title: "Creating and editing a club", id: "sub-clubs-create" },
      { title: "Archiving a club",             id: "sub-clubs-archive" },
      { title: "The 8 per-club behaviour toggles, one by one", id: "sub-clubs-flags" },
      { title: "Club Notices live on the club's own page — not here", id: "sub-clubs-notices" },
    ],
  },
  {
    id: "owners", num: 6, title: "Owners — Who Gets Each Hub's Questions",
    subs: [
      { title: "What assigning an Owner actually routes", id: "sub-owners-how" },
      { title: "The fallback chain when nobody's assigned", id: "sub-owners-fallback" },
    ],
  },
  {
    id: "locations", num: 7, title: "Locations",
    subs: [
      { title: "Capacity is advisory only — it never blocks", id: "sub-loc-capacity" },
      { title: "Closed — exactly what it blocks and for whom", id: "sub-loc-closed" },
      { title: "Request Only — corrected: it is NOT an approval queue", id: "sub-loc-requestonly" },
      { title: "Bookings — the combined venue view",             id: "sub-loc-bookings" },
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
      { title: "Every field you can edit, and what it affects", id: "sub-acc-edit" },
      { title: "Deactivate vs. Delete — not interchangeable", id: "sub-acc-remove" },
      { title: "Creating a login for a resident", id: "sub-acc-create" },
      { title: "Reset PIN — what it forces on next login", id: "sub-acc-pin" },
    ],
  },
  {
    id: "hidename", num: 10, title: "Private / Hide Name — Where It Actually Applies",
    subs: [
      { title: "What toggling it on does, and doesn't, hide", id: "sub-hide-name" },
    ],
  },
  {
    id: "notices-ref", num: 11, title: "Quick Reference — the Two Real Notice Systems",
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

// One setting/toggle + its resulting behaviour, laid out as a small card so
// "what it's called" and "what happens when it's on" are visually distinct.
function FlagCard({ name, children }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${border}`, borderRadius: 10, padding: "0.85rem 1rem", marginBottom: "0.75rem" }}>
      <div style={{ fontSize: "0.82rem", fontWeight: 800, color: amber, marginBottom: "0.4rem" }}>{name}</div>
      <div style={{ fontSize: "0.86rem", color: "#444", lineHeight: 1.65 }}>{children}</div>
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
            Every option in Admin, and the exact behaviour it triggers — not just what it's called.
            Checked against the live app, not written from memory. Visible only to accounts with admin
            rights.
          </p>
        </header>

        <div className="no-print" style={{ background: "#fff", borderBottom: `1px solid ${border}`, padding: "0.85rem 1.25rem", position: "relative" }}>
          <input
            type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="🔍 Search the manual… (e.g. “loan cap”, “request only”, “deactivate”)"
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
                back to Home; there is no partial/read-only admin access.
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
                in this grid — it lives at <strong>Info → Contacts</strong>, covered in Section 9.
              </Step>
            </Subsection>
          </Section>

          <Section id="pagetexts" num={2} title="Page Texts — Wording Across the App">
            <Subsection id="sub-pt-home" title="Happenings Home — the Main & Sub Notices">
              <Step>
                This is the actual, working way to change what residents see on the <strong>Home</strong>{" "}
                screen banner. Open <strong>Admin → Page Texts → Happenings Home</strong>. The main text box is
                the <strong>Main Notice</strong> shown at the top of Home; below it you can add, edit, or
                remove any number of <strong>Sub Notices</strong> — each one its own rich-text box with a{" "}
                <strong>×</strong> to remove it. Saving here writes straight to what every resident sees on
                their next Home load — there's no draft/publish step.
              </Step>
              <InfoBox>
                💡 If you're looking for "where do I post a notice", this Happenings Home section is it for the
                whole-community Home banner. See Section 11 for how this differs from a Group/Club notice.
              </InfoBox>
              <Step>
                Added 2026-08-28 after resident feedback that the Main Notice was hard to read: the text box
                toolbar now has three <strong>A</strong> buttons (small/medium/large) alongside Bold/Italic/
                Underline — select some text in the box, then tap the size you want. The Main Notice's banner
                itself was also softened (a light tint with a coloured accent stripe, replacing the old solid
                orange fill) for better readability without losing the Happenings Home colour identity.
              </Step>
            </Subsection>
            <Subsection id="sub-pt-other" title="Show Time, Social & Library wording">
              <Step>
                The same Page Texts screen has a section for every other editable area of wording:{" "}
                <strong>Show Time Home</strong> (welcome message), <strong>Show Time — Suggestions</strong>,{" "}
                <strong>Show Time — DVD Library</strong>, <strong>Social Events</strong>, <strong>Library
                Home</strong>, and <strong>Library — Books</strong>. Each is an independent block with its
                own Save button — editing and saving one has zero effect on the others.
              </Step>
            </Subsection>
            <Subsection id="sub-pt-loancap" title="Loan caps — what happens at the limit">
              <Step>
                Two sections — <strong>Show Time — DVD Library</strong> and <strong>Library —
                Books</strong> — also carry a numeric <strong>loan cap</strong>: the maximum number of
                DVDs or books a resident can have checked out at the same time. Set and saved alongside
                that section's welcome text.
              </Step>
              <Step>
                <strong>This is a hard block, not a warning.</strong> Once a resident's active-loan count
                reaches the cap, the Borrow button on that item is replaced with a message — "You have{" "}
                <em>N</em> DVDs on loan — return one first" — and they cannot borrow anything else until an
                existing loan is marked returned, freeing up a slot. If you don't set a cap, the app falls
                back to <strong>3</strong>.
              </Step>
            </Subsection>
          </Section>

          <Section id="showtime" num={3} title="Show Time Admin">
            <Subsection id="sub-st-suggested" title="Suggested — read-only, no actions here">
              <Step>
                A read-only list of every movie residents have suggested for viewing (not titles already
                in the DVD library), cross-checked against three things at once: whether it's already in
                the DVD library, whether it's on one of the services listed under Streaming, and whether
                any resident has a private-ownership record for it under Ownership. There's nothing to
                click to change data here — it's a FREE-vs-COST reference before you schedule a screening,
                fed entirely by what you set in the two sub-tabs below.
              </Step>
            </Subsection>
            <Subsection id="sub-st-ownership" title="Ownership — what adding a record actually changes">
              <Step>
                Search for a suggested title, search for a resident, choose <strong>DVD</strong> or{" "}
                <strong>Digital</strong>, and add — that's a standalone record: "this resident privately
                owns a copy of this movie." It doesn't touch the DVD library or borrowing at all; its only
                effect elsewhere is feeding the Suggested view's FREE-vs-COST check above. There's no
                approval or verification step — anything typed in here is taken as fact.
              </Step>
            </Subsection>
            <Subsection id="sub-st-streaming" title="Streaming — what the service list controls">
              <Step>
                A plain list of service names the community currently subscribes to (e.g. "Netflix",
                "Stan") — add or remove names freely. This list is the only thing the Suggested view's
                streaming check compares against; the match is a fuzzy substring match (so "Netflix" also
                matches "Netflix Standard with Ads"), not an exact name.
              </Step>
              <Step>
                Adding or removing a service here does <strong>not</strong> retroactively re-flag every
                suggested title — existing FREE/COST flags were set the last time the enrichment/streaming
                check ran against a title. Use the <strong>Refresh streaming</strong> runner on this same
                screen after changing the list, so every suggested title gets re-checked against the
                updated list rather than showing stale flags.
              </Step>
            </Subsection>
          </Section>

          <Section id="bookclub" num={4} title="Book Club Admin">
            <Subsection id="sub-bc-scope" title="This screen is cross-club, not Book-Club-only">
              <WarnBox>
                ⚠ Despite the card's label, this list is not filtered to the "Book Club" club specifically
                — it queries every booking anywhere in the app with an outstanding book/kit loan
                (<code>has_book = true</code>), oldest-first. Any other Group/Club with{" "}
                <strong>Book return dates</strong> or <strong>Kit return dates</strong> turned on
                (Section 5) will show its outstanding loans here too, mixed in with Book Club's.
              </WarnBox>
            </Subsection>
            <Subsection id="sub-bc-tracking" title={'What “Mark returned” actually does'}>
              <Step>
                Each row shows who has a copy out, which title, and how many days it's been out. Tapping{" "}
                <strong>Mark returned</strong> flips that one booking's loan flag off — the exact same
                underlying flag as the "Has Book / Returned / No Book" toggle on that club's own attendee
                list. There's no separate "confirm return" step and no notification sent — it's a single
                immediate write.
              </Step>
            </Subsection>
          </Section>

          <Section id="clubs" num={5} title="Groups & Clubs Admin">
            <Subsection id="sub-clubs-create" title="Creating and editing a club">
              <Step>
                Add a new Group/Club (name, colour, description, welcome text) or edit an existing one from
                the same list. Each club gets its own accent colour, distinct from other hubs and clubs —
                the picker won't offer a colour already in use. Creating a new club is admin-only; editing
                an existing one can also be done by that club's own assigned Owner from their "Manage this
                club" screen — same form, same effect either way.
              </Step>
            </Subsection>
            <Subsection id="sub-clubs-archive" title="Archiving a club">
              <Step>
                Archiving hides a club from <strong>Groups & Clubs</strong> without deleting anything —
                its past events, bookings, and history all stay intact in the database, just no longer
                reachable through the club list. Use this instead of deleting when a club is winding down.
                There is no "unarchive" button visible in the admin UI — restoring one requires a direct
                database change.
              </Step>
            </Subsection>
            <Subsection id="sub-clubs-flags" title="The 8 per-club behaviour toggles, one by one">
              <Step>
                These live on the same Create/Edit form as the name and colour. Every one of them changes
                what the event-creation form and the booking screen actually do for that club — they
                aren't cosmetic labels.
              </Step>

              <FlagCard name="Book return dates (has_book_return)">
                ON: every event for this club gets a "Book return date" field when creating it, and each
                attendee on the attendee list gets a Has Book / Returned toggle plus a 🔔 reminder button.
                This is also what feeds the Book Club Admin list in Section 4 — a club with this off never
                appears there, however many bookings it has.
              </FlagCard>

              <FlagCard name="Kit return dates (has_kit_return)">
                Same mechanism as Book return dates, but for a "Kit return date" field instead — for clubs
                that lend out equipment rather than books. The two are independent; a club can have either,
                both, or neither on.
              </FlagCard>

              <FlagCard name="Theme name on events (has_theme)">
                ON: event creation gets a free-text "Theme" field (e.g. a dinner club's theme for the
                night), shown on the event's detail screen. OFF: the field doesn't appear at all — it isn't
                just hidden, no theme_name value is saved even if one was set before the flag was turned off
                on a future edit.
              </FlagCard>

              <FlagCard name="Paid events (cost)">
                ON: event creation gets a "Requires payment" toggle and a cost field. Turn that per-event
                toggle on and a booking for that event starts life as <strong>payment pending</strong>{" "}
                instead of not-required — which is what switches on the whole payment-tracking flow
                (Booked → Confirmed wording, self-report, EC mark-as-paid, refund ledger). OFF at the club
                level: no payment fields appear on any event for this club at all, regardless of what an
                individual event might otherwise need.
              </FlagCard>

              <FlagCard name="Attendees bring something (bring_enabled)">
                ON: event creation gets a "bring categories" picker (e.g. Mains / Sides / Dessert) and a
                "Required" checkbox. Turning the club flag on doesn't force anything by itself — each
                individual event still needs its own categories chosen, and only if that event's own{" "}
                <strong>Required</strong> box is also ticked does a resident get blocked from confirming
                their booking until they pick what they're bringing. Club flag off: the whole bring-a-dish
                picker never appears on this club's event form.
              </FlagCard>

              <FlagCard name="Sign-up only — one seat per person (single_signup)">
                ON: booking an event for this club skips the seat picker entirely — no "how many seats",
                no capacity bar shown, no "Modify Seats" after booking. One tap books exactly one seat for
                the person doing it. This is Book Club's own booking style (each resident either has a seat
                or doesn't). OFF: the normal seat-picker booking flow applies, with a visible capacity bar
                and the ability to book multiple seats per booking (subject to the event's own "max seats
                per booking" setting).
              </FlagCard>

              <FlagCard name="One event at a time — block scheduling ahead (one_event_at_a_time)">
                This is the one you specifically asked about. <strong>ON:</strong> the club can have at
                most one <em>upcoming</em> (not-yet-past) event scheduled at any moment. The{" "}
                <strong>+ Add</strong> control for a new activity is only available when there is currently{" "}
                <strong>zero</strong> upcoming events for that club — the instant the current one is
                created, Add disappears again until that event's date passes (it moves into the closed/past
                list) or it's cancelled. It also changes how recurrence is offered when creating an event:
                instead of the normal multi-date "series" picker, you get a content-defined "pattern" that
                only pre-fills the next date — the same mechanism Book Club uses for its book cycle, because
                Book Club has this flag on. <strong>OFF (the default for most clubs):</strong> no such
                limit — schedule as many upcoming activities as you like, and the normal series/recurrence
                picker is offered when creating one.
              </FlagCard>

              <FlagCard name="Catalogue module (catalogue_module: none / books)">
                Not a toggle — a dropdown with one real option today. Set to <strong>books</strong>: the
                club gets its own <strong>Suggest</strong> tab (Google Books search + community voting on
                what to read next) at <code>/clubs/[slug]/suggestions</code> — this is the only way that
                tab appears; there's no separate on/off switch for it. Set to <strong>none</strong>: that
                route bounces straight back to the club's own page if anyone lands on it directly (e.g. an
                old bookmark) — there is no Suggest tab shown anywhere for the club.
              </FlagCard>
            </Subsection>
            <Subsection id="sub-clubs-notices" title="Club Notices live on the club's own page — not here">
              <WarnBox>
                ⚠ There is no "post a club notice" control inside this Admin panel. Each club's{" "}
                <strong>📣 Post notice</strong> button is on that club's own page (Groups & Clubs → the
                club → Post notice), usable by that club's assigned Owner or an app admin. Posting there
                fires a notification to everyone who has joined that specific club — nobody else. Social
                has no equivalent — this is Groups/Clubs only. See Section 11 for how this differs from the
                Home banner in Section 2.
              </WarnBox>
            </Subsection>
          </Section>

          <Section id="owners" num={6} title="Owners — Who Gets Each Hub's Questions">
            <Subsection id="sub-owners-how" title="What assigning an Owner actually routes">
              <Step>
                This screen assigns Owners separately for <strong>Show Time</strong>, <strong>Social</strong>,
                and <strong>Library</strong> (Groups & Clubs owners are assigned per-club on each club's own
                edit form instead, in Section 5). Every resident listed as an Owner for a hub receives{" "}
                <strong>every question asked on that hub's page</strong>, and is shown as its contact. You
                can list more than one Owner per hub — all of them get every question, there's no
                round-robin or split routing.
              </Step>
              <Step>
                Assigning an Owner to a hub also grants that resident admin-equivalent create/edit/manage
                powers scoped to that one area only (create and edit events, see the area-wide Event
                Coordinator view) — it is not just a notification address. A club Owner gets the same
                scoped powers over their one club.
              </Step>
            </Subsection>
            <Subsection id="sub-owners-fallback" title="The fallback chain when nobody's assigned">
              <Step>
                Questions never go unrouted — if a hub or club has zero Owners assigned, its questions fall
                through to <strong>every admin account</strong> instead. A question asked on a specific{" "}
                <strong>event</strong> goes first to that event's assigned Coordinators, if it has any;
                only if it has none does it fall back to the event's parent hub/club Owners, and only if
                that's also empty does it fall back to admins. A question asked via a Contacts category
                goes to members of that category who have an app login — a contact-only resident with no
                login (see Section 9) can be tagged in a category but will never receive or be able to
                answer a question that way.
              </Step>
              <InfoBox>
                💡 App admins always receive general/Home questions regardless of this screen — that's why
                admins don't need to be listed as an Owner anywhere just to keep the fallback working.
              </InfoBox>
            </Subsection>
          </Section>

          <Section id="locations" num={7} title="Locations">
            <Subsection id="sub-loc-capacity" title="Capacity is advisory only — it never blocks">
              <Step>
                The capacity number you set on a venue does exactly one thing: it becomes the pre-filled
                default for "Max seats" the next time someone creates an event in that room (falling back
                to <strong>20</strong> if no capacity is set). Once an event's max seats is chosen, capacity
                plays no further role — you can freely set an event's own max seats higher than the room's
                capacity, and the only thing that happens is a one-line advisory ("This space seats about{" "}
                <em>N</em>. You've set <em>higher</em> — that's fine if you know it fits.") that never
                blocks saving.
              </Step>
            </Subsection>
            <Subsection id="sub-loc-closed" title="Closed — exactly what it blocks and for whom">
              <Step>
                Setting a venue to <strong>Closed</strong> blocks any <em>new</em> event or personal space
                booking from being made against it on the affected dates — for every resident, admins
                included; there is no override. It does <strong>not</strong> touch bookings that already
                exist on those dates — closing a room after something's already booked into it doesn't
                cancel that booking.
              </Step>
              <Step>
                <strong>Until further notice</strong> (no end date set) blocks every date from the start
                date onward, indefinitely, until you either reopen the venue or set an end date.{" "}
                <strong>From / to</strong> blocks only that inclusive date range — the venue is bookable
                again automatically the day after the "to" date, no action needed to reopen it.
              </Step>
            </Subsection>
            <Subsection id="sub-loc-requestonly" title="Request Only — corrected: it is NOT an approval queue">
              <WarnBox>
                ⚠ Correcting something this manual got wrong in an earlier version: <strong>Request Only
                never makes a booking wait for anyone's approval.</strong> There is no pending/approve/deny
                state anywhere in the code for it. What it actually changes depends on who's booking and
                why:
              </WarnBox>
              <Step>
                <strong>A resident booking the venue for personal use</strong> (Community Calendar → book a
                space) — every booker, admin or not, must tick a checkbox self-declaring they've already
                confirmed with Ingenia, and type who confirmed it. The booking cannot be submitted at all
                until that's filled in. This is a hard block at submit time, but it's a self-declaration,
                not a request sent anywhere for someone else to act on.
              </Step>
              <Step>
                <strong>An admin, EC, or club Owner creating a community event</strong> (Show Time, Social,
                or a club) in a Request Only venue — no checkbox, no block. The event is created
                immediately, and the creator gets a reminder notification afterward to go confirm with
                Ingenia. They're trusted to have already sorted it or to sort it promptly.
              </Step>
              <InfoBox>
                💡 The venue picker shows a small "Request Only" badge on any flagged venue so bookers know
                which self-declaration rule applies before they pick it.
              </InfoBox>
            </Subsection>
            <Subsection id="sub-loc-bookings" title="Bookings — the combined venue view">
              <Step>
                A combined, read-only list of every personal space booking and every event booked against
                the community's venues, sortable by date or by space. There's nothing to approve or action
                from here — it exists so you can eyeball what's on where, e.g. before creating a new event
                in a venue that might already be busy that day.
              </Step>
              <WarnBox>
                ⚠ This list is not authoritative for real-world room availability — it only shows what's
                booked through this app. Ingenia's own resident-facing app can book the same physical rooms
                independently, and the Hive has no visibility into those bookings. "Nothing shown here on
                that date" means "no Hive booking clashes," not "the room is definitely free."
              </WarnBox>
            </Subsection>
          </Section>

          <Section id="tools" num={8} title="Tools — DVD Library Enrichment">
            <Subsection id="sub-tools-run" title="Running enrichment">
              <Step>
                Runs in batches of 50, pulling poster art and metadata for DVD library titles that don't
                have it yet from TMDB/OMDb, and skips anything already marked "not found" from a previous
                run so it doesn't keep re-trying dead ends every time. Keep the tab open while it runs —
                you'll see a live count of titles enriched, skipped (no match), and failed (API/network
                error), with a <strong>Stop</strong> button if you need to pause partway through; resuming
                later continues rather than restarting from zero.
              </Step>
            </Subsection>
            <Subsection id="sub-tools-fail" title="Failure catalogue">
              <Step>
                A persistent, database-backed list of every title that's ever come back "not found" or
                "API error" across all previous enrichment runs, split into those two groups. It's not
                fetched automatically when you open Tools — tap <strong>Load from DB</strong> to see it,
                <strong>Refresh</strong> to update it after a new run.
              </Step>
            </Subsection>
          </Section>

          <Section id="accounts" num={9} title="Resident Accounts — Info › Contacts">
            <Subsection id="sub-acc-edit" title="Every field you can edit, and what it affects">
              <Step>
                Admin-only edit controls appear directly on each resident's entry at{" "}
                <strong>Info → Contacts</strong> — not inside the Admin panel itself. Fields you can change
                from here: real <strong>Name</strong>, <strong>Display Name</strong> (what shows to other
                residents everywhere else in the app — the two can differ, e.g. to fix a typo or an
                unhelpful display name without touching the legal/real name), <strong>title</strong>,{" "}
                <strong>email</strong>, <strong>house number</strong>, <strong>phone</strong>, which{" "}
                <strong>Contacts categories</strong> they're tagged under, and — the two fields that change
                behaviour elsewhere in the app rather than just display — <strong>Admin rights</strong>{" "}
                (grants or revokes <code>is_admin</code>; you cannot change this on your own account from
                here) and <strong>Private/Hide Name</strong> (see Section 10).
              </Step>
              <Step>
                <strong>Username is the one field that stays resident-self-service only</strong> — it's not
                editable from here at all, because renaming it here would orphan the login (Auth) record
                it's tied to.
              </Step>
            </Subsection>
            <Subsection id="sub-acc-remove" title="Deactivate vs. Delete — not interchangeable">
              <Step>
                <strong>Deactivate</strong> is the safe, reversible default: it blocks that resident from
                logging in and drops them off the Contacts list, but touches nothing else — every booking,
                coordinator credit, and history row stays intact, and it can be reversed.
              </Step>
              <Step>
                <strong>Delete</strong> is genuinely irreversible, and the server actively refuses it if the
                resident has any real history — a booking, a coordinator assignment, a vote, anything. In
                practice this means Delete only succeeds for a duplicate or never-used account; for a real
                resident who's moved out or stopped participating, Deactivate is the one to use.
              </Step>
            </Subsection>
            <Subsection id="sub-acc-create" title="Creating a login for a resident">
              <Step>
                Also on the Contacts screen — set a <strong>Name</strong>, a <strong>Username</strong>{" "}
                (what they'll type to sign in; minimum 3 characters, must be unique) and a{" "}
                <strong>Starting PIN</strong> (minimum 4 characters). On success you're shown that exact
                username and PIN to hand to the resident directly — there's no email/SMS sent automatically.
              </Step>
              <Step>
                If you create the login from an existing Contacts-only entry (one with no login yet), the
                new login is automatically linked to that entry — its phone/title/category tags carry over,
                and it stops appearing as a separate, contact-only row.
              </Step>
            </Subsection>
            <Subsection id="sub-acc-pin" title="Reset PIN — what it forces on next login">
              <Step>
                Resetting a resident's PIN from here needs no old PIN (that's the point — it's for when
                they've forgotten it). It immediately sets the new PIN you type, <strong>and</strong> forces{" "}
                <code>must_change_pin</code> on — the same flag set when a login is first created by an
                admin — so the resident is required to set their own new PIN the next time they sign in,
                rather than continuing to use the one you just handed them indefinitely.
              </Step>
            </Subsection>
            <Subsection id="sub-acc-export" title="Exporting the list — Export button (added 2026-08-30)">
              <Step>
                An <strong>⬇ Export</strong> button sits next to the search bar on Info → Contacts,
                admin-only. It downloads a CSV of exactly the list you're currently looking at —{" "}
                <strong>House #, Name, Phone, Email</strong> — respecting whichever category chip and search
                text are active at the time. Filter to a category first (or leave "All Categories" selected)
                and the export matches it exactly; there's no separate "export everything" option.
              </Step>
              <Step>
                This is a plain file download, not a push to Google Drive or anywhere else — it opens
                straight into Excel, Numbers, or Google Sheets once downloaded, the same as any other CSV.
              </Step>
              <Step>
                The export also follows whichever <strong>Sort</strong> order (House # or Name) is
                currently selected on screen — a resident-facing control above the search box, added
                2026-08-30, not admin-only — so the downloaded file's row order always matches what
                you were just looking at.
              </Step>
            </Subsection>
          </Section>

          <Section id="hidename" num={10} title="Private / Hide Name — Where It Actually Applies">
            <Subsection id="sub-hide-name" title="What toggling it on does, and doesn't, hide">
              <Step>
                Turning this on for a resident (from their Contacts edit sheet, Section 9) makes them show
                as <strong>"Resident"</strong> instead of their name on any attendee list, to any viewer who
                is neither an admin nor that specific event's assigned Coordinator. Admins and that event's
                EC still see the real name, with a small <strong>(P)</strong> marker next to it so it's
                clear the name is normally hidden. The resident's own view of their own row always reads{" "}
                <strong>"You"</strong>, regardless of this setting.
              </Step>
              <Step>
                It only affects attendee-list display — it does not remove them from search, from Contacts
                (admins still see and can manage a "Private" entry there), or from any admin-facing list
                anywhere else in the app.
              </Step>
            </Subsection>
          </Section>

          <Section id="notices-ref" num={11} title="Quick Reference — the Two Real Notice Systems">
            <Subsection id="sub-notices-ref" title="Home banner vs. Club notices">
              <Step>
                Element Happenings has exactly two working ways to post a notice — if a resident asks
                "where's my notice gone" or "how do I post one", check which of these they mean:
              </Step>
              <Step>
                <strong>1. Home banner (Main + Sub Notices)</strong> — community-wide, shown to every
                resident on the Home screen. Set at <strong>Admin → Page Texts → Happenings Home</strong>{" "}
                (Section 2). Admin-only.
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
