"use client"
import { useState } from "react"
import { authedFetch } from "@/lib/getAuthToken"

// "Who hearted this" list -- post author, admins and the event's Owner/EC
// only (Iain, 2026-10-05: "its for a select group, not broadcast wide").
// The caller only renders this when the server said can_see_heart_names;
// GET .../hearts checks again server-side. Loads on first expand.
export default function HeartNames({ postId, count }) {
  const [open, setOpen] = useState(false)
  const [people, setPeople] = useState(null)
  const [error, setError] = useState("")

  if (!count) return null

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next) {
      setError("")
      const res = await authedFetch(`/api/happenings-news/${postId}/hearts`).catch(() => null)
      const json = res ? await res.json().catch(() => ({})) : {}
      if (!res?.ok) { setError(json.error || "Couldn't load the list"); return }
      setPeople(json.people || [])
    }
  }

  return (
    <div style={{ marginTop: 6 }}>
      <button type="button" onClick={toggle} aria-expanded={open} style={{
        background: "none", border: "none", padding: "0.4rem 0", cursor: "pointer", fontFamily: "inherit",
        color: "var(--happenings-news)", fontWeight: 700, fontSize: "0.82rem", minHeight: 36,
      }}>
        See who hearted ({count}) {open ? "▲" : "▼"}
      </button>
      {open && (
        <div style={{ fontSize: "0.85rem", color: "var(--text)", lineHeight: 1.6, paddingLeft: 2 }}>
          {error ? <span style={{ color: "var(--terracotta)" }}>{error}</span>
            : people === null ? <span style={{ color: "var(--text-dim)" }}>Loading…</span>
            : people.length === 0 ? <span style={{ color: "var(--text-dim)" }}>No hearts yet.</span>
            : people.map(p => (
                <div key={p.member_id} style={{ fontWeight: p.is_own ? 700 : 400 }}>
                  {p.name}{p.is_private && !p.is_own ? <span style={{ color: "var(--text-dim)" }}> (P)</span> : null}
                </div>
              ))}
        </div>
      )}
    </div>
  )
}
