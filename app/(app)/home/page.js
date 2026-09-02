"use client"
import { useEffect, useState } from "react"
import { FormattedText } from "@/lib/textFormatter"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { sydneyTodayStr, isEventPast } from "@/lib/date"
import { useUser } from "@/lib/UserContext"
import { MoviesIcon, SocialIcon, BookClubIcon, BarIcon, InfoIcon, ClubsIcon, SpaceIcon, VotingIcon } from "@/components/NavIcons"
import { BAR_ENABLED, SPACE_BOOKINGS_ENABLED } from "@/lib/features"
import AskQuestion from "@/components/AskQuestion"

// Home hub grid — kept to at most TWO rows (Iain: mobile vertical space is
// premium). Row 1 = three tiles (span 2 of a 6-col grid), row 2 = three tiles.
// Shed (Phase 3 placeholder) removed from Home 2026-08-12 — never built,
// dropped in favour of the Library hub taking this grid slot.
const HUBS = [
  { key: "movies", label: "Show Time", Icon: MoviesIcon, path: "/movies",      colour: "var(--teal)",       span: 2 },
  { key: "social", label: "Social", Icon: SocialIcon, path: "/social",        colour: "var(--terracotta)", span: 2 },
  { key: "library", label: "Library", Icon: BookClubIcon, path: "/booklibrary", colour: "var(--purple)",   span: 2 },
  { key: "clubs",  label: "Groups & Clubs",  Icon: ClubsIcon,  path: "/clubs",         colour: "var(--purple)",     span: 2 },
  { key: "info",   label: "Info",   Icon: InfoIcon,   path: "/info/contacts", colour: "#4e7aab",           span: 2 },
  { key: "ask",    label: "Ask a question", emoji: "💬", path: null,           colour: "var(--amber-dark)", span: 2, ask: true },
]

// Render HTML (WYSIWYG) or legacy BBCode content
function HubContent({ text, c1Colour, c2Colour }) {
  if (!text) return null
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return <span dangerouslySetInnerHTML={{ __html: text }} />
  }
  return <FormattedText text={text} c1Colour={c1Colour} c2Colour={c2Colour} />
}

// Softened 2026-08-28 (Iain feedback, first-impression readability): the
// Main Notice used to be a full solid-amber fill with black text -- high
// contrast on paper (~9:1) but visually loud as the only saturated block on
// an otherwise white/card Home screen, and residents found it hard to read.
// Now uses the same tint + accent-border "shaded callout" treatment as
// Iain's own reference document style, reusing existing design tokens
// (--amber-light, --amber, --text) rather than inventing new colours.
// Base font size bumped 0.95rem -> 1.05rem; admins can go further per-notice
// via RichEditor's new font-size control (see components/RichEditor.js).
function MainNoticeCard({ text, memberName }) {
  if (!text) return null
  return (
    <div style={{
      background: "var(--amber-light)", color: "var(--text)", borderRadius: "14px",
      borderLeft: "5px solid var(--amber)",
      padding: "1.1rem 1.25rem", marginBottom: "0.75rem",
    }}>
      {memberName && (
        <div style={{ fontSize: "0.95rem", fontWeight: 700, opacity: 0.85, marginBottom: "0.45rem" }}>
          Welcome {memberName},
        </div>
      )}
      <div style={{ fontSize: "1.05rem", lineHeight: 1.6 }}>
        <HubContent text={text} c1Colour="var(--teal)" c2Colour="var(--text-dim)" />
      </div>
    </div>
  )
}

function SubNoticeCard({ text }) {
  if (!text) return null
  return (
    <div style={{
      background: "var(--surface)", color: "var(--text)", borderRadius: "12px",
      borderLeft: "4px solid var(--amber)",
      padding: "0.85rem 1.1rem", marginBottom: "0.6rem",
      border: "1px solid var(--border)", borderLeftWidth: "4px", borderLeftColor: "var(--amber)",
      fontSize: "0.95rem", lineHeight: 1.55,
    }}>
      <HubContent text={text} c1Colour="var(--amber-dark)" c2Colour="var(--text-dim)" />
    </div>
  )
}

function HubTiles() {
  const router = useRouter()
  const tile = (h, onClick) => (
    <button key={h.key} onClick={onClick}
      style={{
        gridColumn: `span ${h.span || 2}`,
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px",
        padding: "0.65rem 0.25rem", display: "flex", flexDirection: "column",
        alignItems: "center", gap: "0.3rem", cursor: "pointer", fontFamily: "inherit",
      }}>
      <span style={{ color: h.colour, height: 36, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, fontSize: h.emoji ? 26 : undefined }}>{h.emoji ? h.emoji : <h.Icon size={36} />}</span>
      <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text)", lineHeight: 1.2, textAlign: "center" }}>{h.label}</span>
    </button>
  )
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0.5rem", marginBottom: "0.75rem", position: "relative" }}>
      {HUBS.map(h => h.ask
        ? <AskQuestion key={h.key} pickTarget colour={h.colour} trigger={(open) => tile(h, open)} />
        : tile(h, () => router.push(h.path)))}
    </div>
  )
}

// Full-width pill below the Home grid (Iain, 2026-08-22, Book_a_Space_Scope_
// v2.md: "New dedicated Home tile -- a full-width pill below the second row
// -- not squeezed into the existing two-row grid"). Same shape as
// BarTabCard below -- reusing that pattern rather than inventing a new
// pill style, per the app's canonical-asset convention. Unlike BarTabCard
// this is NOT opt-in gated -- every resident can use Book a Space.
function SpaceBookingTile() {
  const router = useRouter()
  const [nextEvent, setNextEvent] = useState(undefined) // undefined = loading, null = none

  useEffect(() => {
    let cancelled = false
    async function load() {
      const todayStr = sydneyTodayStr()
      const { data } = await supabase
        .from("events")
        .select("id, title, event_date, event_time")
        .eq("hub_type", "space").eq("archived", false)
        .gte("event_date", todayStr)
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true })
        .limit(5)
      if (cancelled) return
      setNextEvent((data || []).find(e => !isEventPast(e)) || null)
    }
    load()
    return () => { cancelled = true }
  }, [])

  function label() {
    if (nextEvent === undefined) return "Loading…"
    if (!nextEvent) return "Book a room, or open one up to others"
    const [y, m, d] = nextEvent.event_date.split("-").map(Number)
    const dateStr = new Date(y, m - 1, d).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
    return `Next: ${nextEvent.title} — ${dateStr}`
  }

  return (
    <div onClick={() => router.push("/spaces")} style={{
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px",
      padding: "1rem 1.25rem", cursor: "pointer", display: "flex",
      alignItems: "center", justifyContent: "space-between", marginTop: "0.5rem", marginBottom: "0.75rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <span style={{ color: "var(--space)", lineHeight: 0, display: "flex", alignItems: "center" }}><SpaceIcon size={40} /></span>
        <div>
          <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>Book a Space</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{label()}</div>
        </div>
      </div>
      <span style={{ color: "var(--text-dim)", fontSize: "1.1rem" }}>›</span>
    </div>
  )
}

// Full-width pill below the Home grid, same shape as SpaceBookingTile above
// -- Voting is occasional (an election cycle or two a year), not a routine
// tile, so it lives here rather than in the fixed 6-col grid (Iain,
// 2026-09-02: "the option to Show/Hide the HUB so its not a constant").
// Gated entirely on hub_settings.voting.enabled -- an admin-only toggle
// (see app/api/hub-settings/route.js) -- so this renders nothing at all
// until an admin turns Voting on.
function VotingTile() {
  const router = useRouter()
  const [enabled, setEnabled] = useState(false)
  const [openEvent, setOpenEvent] = useState(undefined) // undefined = loading

  useEffect(() => {
    let cancelled = false
    async function load() {
      const hs = await fetch("/api/hub-settings").then(r => r.json()).catch(() => ({}))
      if (cancelled) return
      const isEnabled = !!hs?.voting?.enabled
      setEnabled(isEnabled)
      if (!isEnabled) { setOpenEvent(null); return }

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setOpenEvent(null); return }
      const res = await fetch("/api/voting", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null)
      const json = res ? await res.json().catch(() => ({})) : {}
      if (cancelled) return
      setOpenEvent((json.events || []).find(e => e.status === "open") || null)
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (!enabled) return null

  function label() {
    if (openEvent === undefined) return "Loading…"
    if (!openEvent) return "No vote is currently open"
    const closes = new Date(openEvent.closes_at)
    const closesStr = isNaN(closes.getTime()) ? "" : ` — closes ${closes.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}`
    return `${openEvent.title}${closesStr}`
  }

  return (
    <div onClick={() => router.push("/voting")} style={{
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px",
      padding: "1rem 1.25rem", cursor: "pointer", display: "flex",
      alignItems: "center", justifyContent: "space-between", marginTop: "0.5rem", marginBottom: "0.75rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <span style={{ color: "var(--voting)", lineHeight: 0, display: "flex", alignItems: "center" }}><VotingIcon size={40} /></span>
        <div>
          <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>Voting</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{label()}</div>
        </div>
      </div>
      <span style={{ color: "var(--text-dim)", fontSize: "1.1rem" }}>›</span>
    </div>
  )
}

function BarTabCard({ memberId }) {
  const router = useRouter()
  const [openTotal,    setOpenTotal]    = useState(null)
  const [outstanding,  setOutstanding]  = useState(0)

  useEffect(() => {
    if (!memberId) return
    async function load() {
      // Open (unreconciled) tab total
      const { data: openData } = await supabase
        .from("bar_tabs")
        .select("bar_products(price)")
        .eq("member_id", memberId)
        .is("reconciliation_id", null)
      const open = (openData || []).reduce((acc, row) => acc + parseFloat(row.bar_products?.price || 0), 0)
      setOpenTotal(open)

      // Outstanding: reconciled but unpaid
      const { data: reconTabs } = await supabase
        .from("bar_tabs")
        .select("quantity, reconciliation_id, bar_products(price)")
        .eq("member_id", memberId)
        .not("reconciliation_id", "is", null)
      const { data: paidPayments } = await supabase
        .from("bar_member_payments")
        .select("reconciliation_id")
        .eq("member_id", memberId)
      const paidIds = new Set((paidPayments || []).map(p => p.reconciliation_id))
      const out = (reconTabs || [])
        .filter(t => !paidIds.has(t.reconciliation_id))
        .reduce((acc, row) => acc + parseFloat(row.bar_products?.price || 0) * (row.quantity || 1), 0)
      setOutstanding(out)
    }
    load()
  }, [memberId])

  const hasOutstanding = outstanding > 0
  const grandTotal     = (openTotal || 0) + outstanding
  const loading        = openTotal === null

  function label() {
    if (loading) return "Loading..."
    if (hasOutstanding) return "$" + outstanding.toFixed(2) + " balance due — tap to view"
    if (grandTotal === 0) return "No open items"
    return "$" + grandTotal.toFixed(2) + " on your tab"
  }

  return (
    <div onClick={() => router.push("/bar")} style={{
      background: hasOutstanding ? "rgba(102,29,77,0.06)" : "var(--surface)",
      border: "1px solid " + (hasOutstanding ? "var(--wine)" : "var(--border)"),
      borderRadius: "14px",
      padding: "1rem 1.25rem", cursor: "pointer", display: "flex",
      alignItems: "center", justifyContent: "space-between", marginTop: "0.5rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <span style={{ color: "var(--wine)", lineHeight: 0 }}><BarIcon size={28} /></span>
        <div>
          <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>My Bar Tab</div>
          <div style={{ fontSize: "0.75rem", color: hasOutstanding ? "var(--wine-dark)" : "var(--text-dim)" }}>
            {label()}
          </div>
        </div>
      </div>
      <span style={{ color: hasOutstanding ? "var(--wine)" : "var(--text-dim)", fontSize: "1.1rem" }}>›</span>
    </div>
  )
}

export default function HomePage() {
  const { member, memberName, barOptIn, memberId } = useUser()
  const [mainText, setMainText] = useState("")
  const [subTexts, setSubTexts] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    fetch("/api/hub-settings")
      .then(r => r.json())
      .then(d => {
        setMainText(d.home?.text || "")
        setSubTexts(Array.isArray(d.home?.subs) ? d.home.subs.filter(Boolean) : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const firstName = member?.name?.split(" ")[0] || "there"

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {[72, 48, 96, 56].map((h, i) => (
            <div key={i} style={{ height: h, borderRadius: "12px", background: "var(--surface2)" }} />
          ))}
        </div>
      ) : (
        <>
          {/* Primary notice */}
          {mainText
            ? <MainNoticeCard text={mainText} memberName={memberName} />
            : (
              <div style={{
                background: "var(--surface)", borderRadius: "14px", padding: "0.9rem 1.1rem",
                border: "1px solid var(--border)", marginBottom: "0.75rem",
                color: "var(--text-dim)", fontSize: "0.88rem", textAlign: "center"
              }}>
                No announcements right now
              </div>
            )
          }

          {/* Hub tiles — between main and sub notices */}
          <HubTiles />

          {/* Book a Space — full-width pill, not part of the two-row grid (feature parked, see lib/features.js) */}
          {SPACE_BOOKINGS_ENABLED && <SpaceBookingTile />}
          <VotingTile />

          {/* Sub notices */}
          {subTexts.map((t, i) => <SubNoticeCard key={i} text={t} />)}

          {/* Bar tab — only for opted-in members (feature parked, see lib/features.js) */}
          {BAR_ENABLED && barOptIn && memberId && <BarTabCard memberId={memberId} />}
        </>
      )}
    </div>
  )
}
