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

// Iain, 2026-08-23: the compact pill below wasn't rendering as a pill at
// all -- "var(--space)" + "18" is the invalid CSS string "var(--space)18",
// silently dropped by the browser, leaving no background. A colour+alpha
// suffix needs a literal hex; --space is fixed to this one hub so a literal
// constant is simplest (same fix applied to NextSpaceEventTile.js).
const SPACE_HEX = "#f97316"

// mySeats (optional): when the caller already knows the LOGGED-IN
// resident's own seat count on this event (e.g. MySpaceBookings, which
// fetches it via /api/spaces?mine=1's event_bookings), show that instead
// of the event-wide capacity fill. Iain, 2026-08-23: "any other user
// would only see the number of seats they are booked for in that event"
// -- the X/Y-of-total-capacity view only makes sense when the resident is
// BROWSING to decide whether to join (the /spaces "Next Booked Space"
// preview and /spaces/scheduled, neither of which pass this prop); once
// they're already booked into it, what they care about is their own seat
// count, the same way every other hub's My Bookings tile shows "you have
// N seats" rather than the whole event's fill level.
//
// compact (optional): matches Social's own "My Bookings" row exactly
// (Iain, 2026-08-23, item 5.2 -- title, date/time, a seats PILL to the
// right; no location line) -- used by MySpaceBookings for a shared event
// the caller already holds a seat on. Default (false) keeps the existing
// richer row (title, date/time · location, plain count) used for
// /spaces/scheduled's browse-to-join list, where location is exactly the
// thing a resident is deciding on.
export default function SharedSpaceEventRow({ event, onOpen, mySeats, compact = false }) {
  const confirmed = (event.bookings || []).filter(b => b.status === "confirmed")
  const seatsBooked = confirmed.reduce((s, b) => s + (b.seats || 1), 0)
  const countLabel = mySeats != null
    ? `${mySeats} seat${mySeats === 1 ? "" : "s"} booked`
    : `${seatsBooked}${event.max_seats ? `/${event.max_seats}` : ""} booked`
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
          {!compact && event.locations?.name ? ` · ${event.locations.name}` : ""}
        </div>
      </div>
      {compact ? (
        <span style={{
          flexShrink: 0, background: SPACE_HEX + "18", color: "var(--space)",
          borderRadius: "20px", padding: "0.2rem 0.65rem", fontSize: "0.75rem", fontWeight: 700,
        }}>
          ✓ {countLabel}
        </span>
      ) : (
        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", flexShrink: 0 }}>
          {countLabel}
        </div>
      )}
    </div>
  )
}
