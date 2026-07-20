"use client"
import { useEffect, useState } from "react"
import { FormattedText } from "@/lib/textFormatter"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import { MoviesIcon, SocialIcon, BookClubIcon, BarIcon, InfoIcon, ClubsIcon, ShedIcon } from "@/components/NavIcons"
import { BAR_ENABLED } from "@/lib/features"
import AskQuestion from "@/components/AskQuestion"

// Home hub grid — kept to at most TWO rows (Iain: mobile vertical space is
// premium). Row 1 = three tiles (span 2 of a 6-col grid), row 2 = two tiles
// (span 3). Shed is a Phase 3 build — shown now as a greyed "coming soon"
// placeholder so the grid doesn't reflow when it lands.
const HUBS = [
  { key: "movies", label: "Movies", Icon: MoviesIcon, path: "/movies",        colour: "var(--teal)",       span: 2 },
  { key: "social", label: "Social", Icon: SocialIcon, path: "/social",        colour: "var(--terracotta)", span: 2 },
  { key: "shed",   label: "Shed",   Icon: ShedIcon,   path: null,             colour: "var(--text-dim)",   span: 2, comingSoon: true },
  { key: "clubs",  label: "Clubs",  Icon: ClubsIcon,  path: "/clubs",         colour: "var(--purple)",     span: 2 },
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

function MainNoticeCard({ text, memberName }) {
  if (!text) return null
  return (
    <div style={{
      background: "var(--amber)", color: "#000", borderRadius: "14px",
      padding: "1.1rem 1.25rem", marginBottom: "0.75rem",
    }}>
      {memberName && (
        <div style={{ fontSize: "0.88rem", fontWeight: 700, opacity: 0.8, marginBottom: "0.4rem" }}>
          Welcome {memberName},
        </div>
      )}
      <div style={{ fontSize: "0.95rem", lineHeight: 1.5 }}>
        <HubContent text={text} c1Colour="var(--teal)" c2Colour="rgba(0,0,0,0.65)" />
      </div>
    </div>
  )
}

function SubNoticeCard({ text }) {
  if (!text) return null
  return (
    <div style={{
      background: "var(--surface)", color: "var(--text)", borderRadius: "12px",
      padding: "0.85rem 1.1rem", marginBottom: "0.6rem",
      border: "1px solid var(--border)", fontSize: "0.88rem", lineHeight: 1.5,
    }}>
      <HubContent text={text} c1Colour="var(--amber)" c2Colour="var(--text-dim)" />
    </div>
  )
}

function HubTiles() {
  const router = useRouter()
  const [shedToast, setShedToast] = useState(false)
  const tile = (h, onClick) => (
    <button key={h.key} onClick={onClick} aria-disabled={h.comingSoon || undefined}
      style={{
        gridColumn: `span ${h.span || 2}`,
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px",
        padding: "0.65rem 0.25rem", display: "flex", flexDirection: "column",
        alignItems: "center", gap: "0.3rem", cursor: "pointer", opacity: h.comingSoon ? 0.55 : 1, fontFamily: "inherit",
      }}>
      <span style={{ color: h.colour, height: 36, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, fontSize: h.emoji ? 26 : undefined }}>{h.emoji ? h.emoji : <h.Icon size={36} />}</span>
      <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text)", lineHeight: 1.2, textAlign: "center" }}>{h.label}</span>
      {h.comingSoon && <span style={{ fontSize: "0.58rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Coming soon</span>}
    </button>
  )
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0.5rem", marginBottom: "0.75rem", position: "relative" }}>
      {HUBS.map(h => h.ask
        ? <AskQuestion key={h.key} contextType="general" contextLabel="the Hive" colour={h.colour} trigger={(open) => tile(h, open)} />
        : tile(h, () => h.comingSoon ? (setShedToast(true), setTimeout(() => setShedToast(false), 2200)) : router.push(h.path)))}
      {shedToast && (
        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: "-2.2rem", zIndex: 5,
          background: "var(--text)", color: "var(--bg)", fontSize: "0.75rem", fontWeight: 600,
          padding: "0.4rem 0.75rem", borderRadius: "8px", whiteSpace: "nowrap" }}>
          The Work Shed is coming soon
        </div>
      )}
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

          {/* Sub notices */}
          {subTexts.map((t, i) => <SubNoticeCard key={i} text={t} />)}

          {/* Bar tab — only for opted-in members (feature parked, see lib/features.js) */}
          {BAR_ENABLED && barOptIn && memberId && <BarTabCard memberId={memberId} />}
        </>
      )}
    </div>
  )
}
