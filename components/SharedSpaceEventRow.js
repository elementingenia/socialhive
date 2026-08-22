"use client"

// Extracted from app/(app)/spaces/page.js (2026-08-22, in response to
// Iain flagging Space Bookings had a Home page but no Scheduled page --
// every other hub has both). Shared between /spaces (a single "Next
// Booked Space" preview) and /spaces/scheduled (the full chronological
// list), same Home-preview + Scheduled-full-list convention every other
// hub already follows (e.g. Show Time's NextScreeningCard vs its
// /screenings list).

export function fmtSpaceEventDate(str) {
  if (!str) return ""
  const [y, m, d] = str.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
}
export function fmtSpaceEventTime(str) {
  if (!str) return ""
  const [h, m] = str.split(":").map(Number)
  const ampm = h >= 12 ? "pm" : "am"
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${ampm}`
}

export default function SharedSpaceEventRow({ event, onOpen }) {
  const confirmed = (event.bookings || []).filter(b => b.status === "confirmed")
  const seatsBooked = confirmed.reduce((s, b) => s + (b.seats || 1), 0)
  return (
    <div onClick={onOpen} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && onOpen()}
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderLeft: "4px solid var(--space)", borderRadius: "14px",
        padding: "0.9rem 1.1rem", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem",
      }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text)" }}>{event.title}</div>
        <div style={{ fontSize: "0.8rem", color: "var(--space)", fontWeight: 600, marginTop: 2 }}>
          {fmtSpaceEventDate(event.event_date)} · {fmtSpaceEventTime(event.event_time)}{event.locations?.name ? ` · ${event.locations.name}` : ""}
        </div>
      </div>
      <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", flexShrink: 0 }}>
        {seatsBooked}{event.max_seats ? `/${event.max_seats}` : ""} booked
      </div>
    </div>
  )
}
