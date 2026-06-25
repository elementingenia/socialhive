"use client"
import { useEffect, useState } from "react"
import { FormattedText } from "@/lib/textFormatter"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"

const HUBS = [
  { key: "movies",   label: "Cinema",    icon: "🎬", path: "/movies",   colour: "var(--teal)" },
  { key: "social",   label: "Social",    icon: "🎉", path: "/social",   colour: "var(--terracotta)" },
  { key: "bookclub", label: "Book Club", icon: "📚", path: "/bookclub", colour: "var(--purple)" },
]

function MainNoticeCard({ text, memberName }) {
  if (!text) return null
  return (
    <div style={{
      background: "var(--teal)", color: "#fff", borderRadius: "14px",
      padding: "1.1rem 1.25rem", marginBottom: "0.75rem",
    }}>
      {memberName && (
        <div style={{ fontSize: "0.88rem", fontWeight: 700, opacity: 0.9, marginBottom: "0.4rem" }}>
          Welcome {memberName},
        </div>
      )}
      <div style={{ fontSize: "0.95rem", lineHeight: 1.5 }}>
        <FormattedText text={text} c1Colour="rgba(255,255,255,0.85)" c2Colour="rgba(255,255,255,0.65)" />
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
      <FormattedText text={text} c1Colour="var(--amber)" c2Colour="var(--text-dim)" />
    </div>
  )
}

function HubTiles() {
  const router = useRouter()
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem", marginBottom: "0.75rem" }}>
      {HUBS.map(h => (
        <button key={h.key} onClick={() => router.push(h.path)} style={{
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px",
          padding: "0.65rem 0.25rem", display: "flex", flexDirection: "column",
          alignItems: "center", gap: "0.3rem", cursor: "pointer",
        }}>
          <span style={{ fontSize: "1.35rem" }}>{h.icon}</span>
          <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text)", lineHeight: 1.2, textAlign: "center" }}>{h.label}</span>
        </button>
      ))}
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
      background: hasOutstanding ? "rgba(217,119,6,0.06)" : "var(--surface)",
      border: "1px solid " + (hasOutstanding ? "var(--amber)" : "var(--border)"),
      borderRadius: "14px",
      padding: "1rem 1.25rem", cursor: "pointer", display: "flex",
      alignItems: "center", justifyContent: "space-between", marginTop: "0.5rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <span style={{ fontSize: "1.4rem" }}>🍺</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>My Bar Tab</div>
          <div style={{ fontSize: "0.75rem", color: hasOutstanding ? "var(--amber-dark)" : "var(--text-dim)" }}>
            {label()}
          </div>
        </div>
      </div>
      <span style={{ color: hasOutstanding ? "var(--amber)" : "var(--text-dim)", fontSize: "1.1rem" }}>›</span>
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

          {/* Bar tab — only for opted-in members */}
          {barOptIn && memberId && <BarTabCard memberId={memberId} />}
        </>
      )}
    </div>
  )
}
