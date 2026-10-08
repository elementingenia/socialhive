"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { authedFetch } from "@/lib/getAuthToken"
import { SWAP, StatusPill } from "@/components/SwapUI"
import { priceLabel } from "@/lib/swap"
import { isoToSydneyDateStr, sydneyTodayStr } from "@/lib/date"

// Swap & Sell -- Messages: every private conversation the resident is in,
// as buyer or seller. Unread ones are marked; tap to open the thread.
function when(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  const sameDay = isoToSydneyDateStr(d.toISOString()) === sydneyTodayStr()
  return sameDay
    ? d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" })
    : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" })
}

export default function SwapMessagesPage() {
  const router = useRouter()
  const [convos, setConvos] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    authedFetch("/api/swap/conversations").then(async res => {
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error || "Couldn't load your messages."); setConvos([]); return }
      setConvos(json.conversations || [])
    }).catch(() => { setError("Couldn't load your messages."); setConvos([]) })
  }, [])

  return (
    <div style={{ padding: "1rem 1rem 6rem", maxWidth: 680, margin: "0 auto" }}>
      <p style={{ fontSize: "0.85rem", color: "var(--text-dim)", margin: "0 0 1rem" }}>
        Private conversations between you and one other resident about one listing.
      </p>
      {convos === null ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}><div className="spinner" /></div>
      ) : error ? (
        <div role="alert" style={{ color: "var(--danger)", fontSize: "0.9rem" }}>{error}</div>
      ) : convos.length === 0 ? (
        <div style={{ color: "var(--text-dim)", fontSize: "0.92rem" }}>No messages yet. Open a listing and tap Message seller to start one.</div>
      ) : convos.map(c => (
        <button key={c.id} type="button" onClick={() => router.push(`/swap/messages/${c.id}`)} style={{
          display: "flex", gap: "0.75rem", width: "100%", textAlign: "left", alignItems: "center",
          background: "var(--surface)", border: `1px solid ${c.unread ? SWAP : "var(--border)"}`, borderRadius: 14,
          padding: "0.75rem", marginBottom: "0.6rem", cursor: "pointer", fontFamily: "inherit", color: "var(--text)",
          borderLeft: c.unread ? `5px solid ${SWAP}` : "1px solid var(--border)",
        }}>
          <div style={{ flex: "0 0 56px", width: 56, height: 56, borderRadius: 8, overflow: "hidden", background: "var(--surface2)" }}>
            {c.listing?.main_photo_url && <img src={c.listing.main_photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontWeight: c.unread ? 800 : 700, fontSize: "0.95rem" }}>{c.other_name}</span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{when(c.last_message_at)}</span>
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ overflowWrap: "anywhere" }}>{c.listing?.title || "Listing removed"}</span>
              {c.listing && <span style={{ color: SWAP, fontWeight: 700 }}>{priceLabel(c.listing)}</span>}
              {c.listing && <StatusPill type={c.listing.type} status={c.listing.status} />}
              {c.role === "seller" && <span>· your listing</span>}
            </div>
            {c.last_message && (
              <div style={{ fontSize: "0.85rem", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: c.unread ? 700 : 400 }}>
                {c.last_message.mine ? "You: " : ""}{c.last_message.body}
              </div>
            )}
          </div>
          {c.unread && <span aria-label="Unread" style={{ flex: "0 0 10px", width: 10, height: 10, borderRadius: 5, background: SWAP }} />}
        </button>
      ))}
    </div>
  )
}
