"use client"
import { useState, useMemo } from "react"
import { Sheet } from "@/components/Sheet"
import { authedFetch } from "@/lib/getAuthToken"
import { canInviteToEvent } from "@/lib/eventInvites"
import { formatAddress } from "@/lib/address"

// Invite a Neighbour (Iain, 2026-10-02). Sits beside Copy Link on every
// hub's event tile. Opens the app's standard bottom Sheet: live search
// (2-character minimum, A-Z), tap names to pick, Send. The server decides
// who's actually eligible (app/api/events/invite) -- this list is only
// what it returned. Hidden entirely once the event can't take invites.
// Residents who have never signed in show greyed out with "Not on the app
// yet" but stay selectable (Iain, 2026-10-07) -- the invite waits for their
// first sign-in, and the sender knows to mention it in person.

const inputStyle = {
  width: "100%", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box",
  fontFamily: "inherit",
}

export default function InviteNeighbourButton({ event, colour = "var(--amber)" }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [candidates, setCandidates] = useState([])
  const [remaining, setRemaining] = useState(0)
  const [query, setQuery] = useState("")
  const [picked, setPicked] = useState([])
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState(null)
  const [eventOpen, setEventOpen] = useState(true)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const pickedIds = new Set(picked.map(p => p.id))
    return candidates
      .filter(c => !pickedIds.has(c.id))
      .filter(c => c.name.toLowerCase().includes(q) || formatAddress(c.house_number, c.street_name).toLowerCase().includes(q))
      .slice(0, 20)
  }, [query, candidates, picked])

  if (!event?.id || !canInviteToEvent(event)) return null

  async function openSheet(e) {
    e.stopPropagation()
    setOpen(true); setQuery(""); setPicked([]); setMessage(null); setLoading(true)
    try {
      const res = await authedFetch(`/api/events/invite?event_id=${event.id}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || "Couldn't load neighbours")
      setCandidates(d.candidates || [])
      setRemaining(d.open ? d.remaining : 0)
      setEventOpen(!!d.open)
      if (!d.open) setMessage({ ok: false, text: "This event isn't taking invites any more." })
    } catch (err) {
      setMessage({ ok: false, text: err.message })
    } finally {
      setLoading(false)
    }
  }

  async function send() {
    if (picked.length === 0) return
    setSending(true); setMessage(null)
    try {
      const res = await authedFetch("/api/events/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: event.id, member_ids: picked.map(p => p.id) }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || "Couldn't send invites")
      const names = picked.map(p => p.name).join(", ")
      const notOnApp = picked.filter(p => p.not_signed_in).map(p => p.name)
      const nudge = notOnApp.length === 0 ? ""
        : ` ${notOnApp.join(", ")} ${notOnApp.length === 1 ? "hasn't" : "haven't"} signed in to the app yet, so they won't see it until they do. A quick word in person would help.`
      setMessage({ ok: true, text: `Invite sent to ${names}.${nudge}` })
      setCandidates(cs => cs.filter(c => !picked.some(p => p.id === c.id)))
      setRemaining(d.remaining ?? 0)
      setPicked([]); setQuery("")
    } catch (err) {
      setMessage({ ok: false, text: err.message })
    } finally {
      setSending(false)
    }
  }

  const atCap = picked.length >= remaining

  // The wrapping span stops clicks (including the Sheet's backdrop, which
  // is portalled but still bubbles through the React tree) from reaching
  // the tile's own onClick and opening the booking modal underneath.
  return (
    <span onClick={e => e.stopPropagation()}>
      <button type="button" onClick={openSheet} title="Invite a neighbour to this event"
        style={{
          display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700,
          padding: "3px 8px", borderRadius: 20, border: `1px solid ${colour}`, color: colour,
          background: "transparent", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
        }}>
        ✉️ Invite a neighbour
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Invite a neighbour"
        footer={
          <button type="button" onClick={send} disabled={sending || picked.length === 0}
            style={{
              width: "100%", padding: "0.8rem", borderRadius: 10, border: "none", fontFamily: "inherit",
              fontSize: "0.95rem", fontWeight: 700, color: "#fff",
              background: picked.length === 0 ? "var(--border)" : "var(--teal)",
              cursor: picked.length === 0 ? "not-allowed" : "pointer", opacity: sending ? 0.7 : 1,
            }}>
            {sending ? "Sending…" : picked.length === 0 ? "Pick someone to invite" : `Send invite${picked.length === 1 ? "" : "s"} (${picked.length})`}
          </button>
        }>
        <div onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: "0.9rem", color: "var(--text)", marginBottom: "0.4rem", fontWeight: 600 }}>{event.title}</div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginBottom: "0.8rem", lineHeight: 1.4 }}>
            They'll get a notification saying you think they'd enjoy it, with a link straight to the event.
          </div>

          {message && (
            <div style={{
              fontSize: "0.85rem", marginBottom: "0.8rem", padding: "0.6rem 0.8rem", borderRadius: 10,
              background: message.ok ? "var(--teal-light, rgba(13,148,136,0.1))" : "rgba(229,62,62,0.1)",
              color: message.ok ? "var(--teal)" : "#e53e3e", fontWeight: 600,
            }}>{message.text}</div>
          )}

          {loading ? (
            <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>Loading neighbours…</div>
          ) : !eventOpen ? null : remaining === 0 ? (
            <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>You've used all your invites for this event.</div>
          ) : (
            <>
              {picked.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "0.7rem" }}>
                  {picked.map(p => (
                    <button key={p.id} type="button" onClick={() => setPicked(ps => ps.filter(x => x.id !== p.id))}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20,
                        border: `1px solid ${p.not_signed_in ? "var(--border)" : "var(--teal)"}`, background: "transparent",
                        color: p.not_signed_in ? "var(--text-dim)" : "var(--teal)",
                        fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                      }}>
                      {p.name}{p.not_signed_in && " (not on app)"} <span aria-label={`Remove ${p.name}`}>✕</span>
                    </button>
                  ))}
                </div>
              )}

              <input value={query} onChange={e => setQuery(e.target.value)} disabled={atCap}
                placeholder={atCap ? "Invite limit reached for this event" : "Type a name or house number…"}
                style={{ ...inputStyle, opacity: atCap ? 0.6 : 1 }} />
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", margin: "0.35rem 0 0.6rem" }}>
                {remaining - picked.length} of your invites left for this event
              </div>

              {query.trim().length >= 2 && !atCap && (
                matches.length === 0 ? (
                  <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
                    No-one found. People already booked or already invited don't show here.
                  </div>
                ) : (
                  <div>
                    {matches.map(c => (
                      <button key={c.id} type="button" onClick={() => { setPicked(ps => [...ps, c]); setQuery("") }}
                        style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
                          padding: "0.7rem 0.4rem", border: "none", borderBottom: "1px solid var(--border)",
                          background: "transparent", color: c.not_signed_in ? "var(--text-dim)" : "var(--text)", fontSize: "0.95rem",
                          textAlign: "left", cursor: "pointer", fontFamily: "inherit", gap: 8,
                        }}>
                        <span style={{ minWidth: 0 }}>
                          {c.name}
                          {c.not_signed_in && <span style={{ display: "block", fontSize: "0.75rem", fontStyle: "italic" }}>Not on the app yet</span>}
                        </span>
                        {(c.house_number || c.street_name) && <span style={{ fontSize: "0.8rem", color: "var(--text-dim)", flexShrink: 0 }}>{formatAddress(c.house_number, c.street_name)}</span>}
                      </button>
                    ))}
                  </div>
                )
              )}
            </>
          )}
        </div>
      </Sheet>
    </span>
  )
}
