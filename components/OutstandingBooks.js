"use client"
import { useCallback, useEffect, useState } from "react"
import { authedFetch } from "@/lib/getAuthToken"

// Kit copies still out with residents, across every event of this club.
// Moved from the old Admin > Book Club tile to the club's own Manage screen
// (Admin clean-up, Iain 2026-10-10) so the Book Club Owner can use it too.
// Reads via GET /api/clubs/outstanding-books (service role, admin or this
// club's Owner) and marks returned via PATCH /api/coordinator set_has_book.

function fmtDate(str) {
  if (!str) return ""
  const [y, m, d] = str.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
}

function daysOut(givenAt) {
  if (!givenAt) return null
  const days = Math.floor((Date.now() - new Date(givenAt).getTime()) / 86400000)
  if (days <= 0) return "Given today"
  return `${days} day${days !== 1 ? "s" : ""} out`
}

export default function OutstandingBooks({ clubId, colour = "var(--purple)" }) {
  const [rows, setRows] = useState(null) // null = loading
  const [error, setError] = useState("")
  const [clearing, setClearing] = useState(null)

  const load = useCallback(async () => {
    setError("")
    try {
      const res = await authedFetch(`/api/clubs/outstanding-books?club_id=${encodeURIComponent(clubId)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || "Couldn't load outstanding books."); setRows([]); return }
      setRows(data.rows || [])
    } catch {
      setError("Couldn't load outstanding books."); setRows([])
    }
  }, [clubId])
  useEffect(() => { if (clubId) load() }, [clubId, load])

  async function markReturned(r) {
    setClearing(r.id); setError("")
    try {
      const res = await authedFetch("/api/coordinator", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: r.eventId, action: "set_has_book", booking_id: r.id, has_book: false }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || "Couldn't mark that book returned."); return }
      await load()
    } finally {
      setClearing(null)
    }
  }

  return (
    <div>
      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.85rem" }}>
        Outstanding Books {rows && rows.length > 0 && `(${rows.length})`}
      </div>
      {error && <div style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: "0.6rem" }}>{error}</div>}
      {rows === null ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "1.5rem" }}><div className="spinner" /></div>
      ) : rows.length === 0 ? (
        !error && <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--text-dim)", fontSize: "0.9rem" }}>No kit copies currently checked out</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {rows.map(r => (
            <div key={r.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.75rem",
              background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: "0.7rem 0.9rem" }}>
              <div style={{ minWidth: 0, flex: "1 1 12rem" }}>
                <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>
                  {r.name}
                  {r.cancelled && <span style={{ color: "var(--danger)", fontWeight: 600, fontSize: "0.72rem" }}> · Cancelled</span>}
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: "0.15rem" }}>{r.bookTitle}</div>
                <div style={{ fontSize: "0.72rem", color: colour, fontWeight: 600, marginTop: "0.2rem" }}>
                  {daysOut(r.givenAt)}
                  {r.returnDate && ` · Due back ${fmtDate(r.returnDate)}`}
                </div>
              </div>
              <button onClick={() => markReturned(r)} disabled={clearing === r.id}
                style={{ fontSize: "0.78rem", fontWeight: 700, padding: "0.4rem 0.8rem", borderRadius: 8, border: `1px solid ${colour}`, fontFamily: "inherit",
                  background: "none", color: colour, cursor: clearing === r.id ? "not-allowed" : "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                {clearing === r.id ? "Saving…" : "Mark Returned"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
