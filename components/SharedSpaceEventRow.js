"use client"

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

const SPACE_HEX = "#f97316"

// onEdit (optional, compact mode only): Iain, 2026-08-23 round 4 --
// "Edit option is STILL no as requested, inside the tile with seat booked
// pill aligned with date and time." Previously MySpaceBookings.js rendered
// its own Edit button as a SEPARATE sibling div below this component's own
// tile -- not "inside the tile", and not aligned with anything in
// particular. Moved in here as part of the same clickable card, sharing
// the date/time row with the seat pill (title keeps its own row, full
// width, unobstructed) so both the pill and Edit read as properties of
// THIS booking's status line rather than a bolted-on extra row.
export default function SharedSpaceEventRow({ event, onOpen, onEdit, mySeats, compact = false }) {
  const confirmed = (event.bookings || []).filter(b => b.status === "confirmed")
  const seatsBooked = confirmed.reduce((s, b) => s + (b.seats || 1), 0)
  const countLabel = mySeats != null
    ? `${mySeats} seat${mySeats === 1 ? "" : "s"} booked`
    : `${seatsBooked}${event.max_seats ? `/${event.max_seats}` : ""} booked`

  if (compact) {
    return (
      <div onClick={onOpen} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && onOpen()}
        style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderLeft: "4px solid var(--space)", borderRadius: "14px",
          padding: "0.9rem 1.1rem", cursor: "pointer",
        }}>
        <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text)" }}>{event.title}</div>
        {/* Accessibility fix (2026-08-31): flexWrap + ellipsis so the seat
            pill/Edit button can't be clipped off-screen by app/globals.css's
            html{overflow-x:hidden} at larger text sizes -- same root cause
            as the confirmed ClubHome.js Edit-button bug. */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", marginTop: 2 }}>
          <div style={{ fontSize: "0.8rem", color: "var(--space)", fontWeight: 600, minWidth: 0, flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {fmtSpaceEventDate(event.event_date)} · {fmtSpaceEventTime(event.event_time)}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
            <span style={{
              background: SPACE_HEX + "18", color: "var(--space)",
              borderRadius: "20px", padding: "0.2rem 0.65rem", fontSize: "0.75rem", fontWeight: 700, whiteSpace: "nowrap",
            }}>
              ✓ {countLabel}
            </span>
            {onEdit && (
              <button type="button" onClick={e => { e.stopPropagation(); onEdit() }} style={{
                background: "none", border: "1px solid var(--space)", color: "var(--space)",
                borderRadius: "20px", padding: "0.2rem 0.65rem", fontSize: "0.75rem",
                fontWeight: 700, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
              }}>
                Edit
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

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
          {fmtSpaceEventDate(event.event_date)} · {fmtSpaceEventTime(event.event_time)}
          {event.locations?.name ? ` · ${event.locations.name}` : ""}
        </div>
      </div>
      <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", flexShrink: 0 }}>
        {countLabel}
      </div>
    </div>
  )
}
