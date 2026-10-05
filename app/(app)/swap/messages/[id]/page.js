"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { authedFetch } from "@/lib/getAuthToken"
import { SWAP, StatusPill, inputStyle, primaryButton, usePrivacyAck } from "@/components/SwapUI"
import { priceLabel, statusLabel, MAX_MESSAGE, CONVERSATION_CLOSE_DAYS } from "@/lib/swap"

// One Swap & Sell conversation. The seller gets the status buttons here as
// a shortcut (the main place is My Listings). Either person can report it,
// which is the only thing that lets an admin read it.
function stamp(iso) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? "" : d.toLocaleString("en-AU", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney",
  })
}

export default function SwapThreadPage({ params }) {
  const router = useRouter()
  const { ensure, Modal } = usePrivacyAck()
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState("")
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState("")
  const [me, setMe] = useState(null)
  const endRef = useRef(null)

  const load = useCallback(async () => {
    const res = await authedFetch(`/api/swap/conversations/${params.id}`).catch(() => null)
    const json = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) { setLoadError(json.error || "Couldn't load this conversation."); return }
    setData(json)
  }, [params.id])

  useEffect(() => { load() }, [load])
  // Privacy-ack state lives on /api/swap's `me`.
  useEffect(() => {
    authedFetch("/api/swap?mine=1").then(r => r.ok ? r.json() : null).then(j => j && setMe(j.me)).catch(() => {})
  }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }) }, [data?.messages?.length])

  async function send() {
    setError("")
    if (!(await ensure(me))) { setError("Couldn't save — please try again."); return }
    setMe(m => m ? { ...m, needsPrivacyAck: false } : m)
    setBusy(true)
    const res = await authedFetch(`/api/swap/conversations/${params.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res?.ok) { setError(json.error || "Couldn't send — check your connection and try again."); return }
    setText("")
    setData(d => ({ ...d, messages: [...d.messages, json.message] }))
  }

  async function setStatus(status) {
    setBusy(true); setError("")
    const res = await authedFetch(`/api/swap/${data.listing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res?.ok) { setError(json.error || "Couldn't change the status."); return }
    load()
  }

  async function report() {
    setBusy(true); setError("")
    const res = await authedFetch("/api/swap/reports", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: params.id, reason }),
    }).catch(() => null)
    setBusy(false)
    if (!res?.ok) { setError("Couldn't send the report — please try again."); return }
    setReporting(false); setReason(""); setNotice("Reported. An admin can now read this conversation and will follow up.")
    load()
  }

  const back = (
    <button type="button" onClick={() => router.push("/swap/messages")} style={{
      background: "none", border: "none", color: SWAP, fontWeight: 600, fontSize: "0.9rem", cursor: "pointer",
      padding: "0.25rem 0 0.75rem", fontFamily: "inherit",
    }}>← Messages</button>
  )

  if (loadError) return <div style={{ padding: "1rem" }}>{back}<div role="alert" style={{ color: "var(--danger)" }}>{loadError}</div></div>
  if (!data) return <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}><div className="spinner" /></div>

  const { conversation: c, listing, messages } = data
  const isSeller = c.role === "seller"
  const isAdminView = c.role === "admin"

  return (
    <div style={{ padding: "1rem 1rem 6rem", maxWidth: 680, margin: "0 auto" }}>
      {back}
      {listing && (
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "0.75rem", marginBottom: "0.75rem" }}>
          <div style={{ flex: "0 0 56px", width: 56, height: 56, borderRadius: 8, overflow: "hidden", background: "var(--surface2)" }}>
            {listing.main_photo_url && <img src={listing.main_photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{listing.title}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: "0.85rem" }}>
              <span style={{ color: SWAP, fontWeight: 800 }}>{priceLabel(listing)}</span>
              <StatusPill type={listing.type} status={listing.status} />
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-dim)" }}>
              {isAdminView ? `${c.seller_name} (listed) and ${c.buyer_name}` : `With ${c.other_name}`}
            </div>
          </div>
        </div>
      )}

      {isAdminView && (
        <div style={{ background: "var(--amber-light)", borderRadius: 10, padding: "0.6rem 0.8rem", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
          Admin view — you can read this because it was reported.
        </div>
      )}

      {isSeller && listing && !c.closed && !listing.hidden && (
        <div role="group" aria-label="Listing status" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "0.75rem" }}>
          {["available", "reserved", "gone"].map(s => {
            const current = listing.status === s
            return (
              <button key={s} type="button" disabled={busy || current} onClick={() => setStatus(s)} aria-pressed={current} style={{
                flex: "1 1 0", minWidth: 90, padding: "0.55rem 0.4rem", borderRadius: 10, fontFamily: "inherit",
                fontSize: "0.88rem", fontWeight: 700, cursor: current ? "default" : "pointer",
                border: `1px solid ${current ? SWAP : "var(--border)"}`,
                background: current ? SWAP : "var(--surface)", color: current ? "#fff" : "var(--text)",
              }}>{statusLabel(listing.type, s)}</button>
            )
          })}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1rem" }}>
        {messages.map(m => (
          <div key={m.id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "85%" }}>
            <div style={{
              background: m.mine ? SWAP : "var(--surface)", color: m.mine ? "#fff" : "var(--text)",
              border: m.mine ? "none" : "1px solid var(--border)", borderRadius: 14, padding: "0.6rem 0.85rem",
              fontSize: "0.95rem", lineHeight: 1.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere",
            }}>{m.body}</div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: 2, textAlign: m.mine ? "right" : "left" }}>
              {isAdminView ? `${m.sender_name} · ` : ""}{stamp(m.created_at)}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {c.can_post ? (
        <div>
          <textarea value={text} onChange={e => setText(e.target.value)} maxLength={MAX_MESSAGE} rows={3}
            placeholder="Write a message" aria-label="Write a message" style={{ ...inputStyle, resize: "vertical" }} />
          <button type="button" onClick={send} disabled={busy || !text.trim()} style={{ ...primaryButton(busy || !text.trim()), marginTop: 8 }}>
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      ) : !isAdminView && (
        <div style={{ fontSize: "0.88rem", color: "var(--text-dim)" }}>
          This conversation has closed ({CONVERSATION_CLOSE_DAYS} days after the listing ended).
        </div>
      )}

      {error && <div role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem", marginTop: 8 }}>{error}</div>}
      {notice && <div style={{ color: SWAP, fontSize: "0.85rem", marginTop: 8, fontWeight: 600 }}>{notice}</div>}

      {!isAdminView && !c.reported && !notice && (
        reporting ? (
          <div style={{ marginTop: "1rem" }}>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500}
              placeholder="What's happened? (optional)" style={{ ...inputStyle, resize: "vertical" }} />
            <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", margin: "6px 0" }}>Reporting lets an admin read this conversation.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={report} disabled={busy} style={{ ...primaryButton(busy), background: "var(--danger)" }}>Send report</button>
              <button type="button" onClick={() => { setReporting(false); setReason("") }} style={{ ...primaryButton(false), background: "var(--surface2)", color: "var(--text)" }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setReporting(true)} style={{
            background: "none", border: "none", color: "var(--text-dim)", textDecoration: "underline",
            fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit", padding: "1rem 0 0",
          }}>Report this conversation</button>
        )
      )}
      {Modal}
    </div>
  )
}
