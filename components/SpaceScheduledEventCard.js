"use client"
import { useState } from "react"
import EventCoordinators from "@/components/EventCoordinators"
import { BusIcon } from "@/components/NavIcons"
import { bookingsClosed } from "@/lib/booking"
import { byOwnThenName } from '@/lib/sortNames'
import { fmtSpaceEventDate, fmtSpaceEventTime } from "@/components/SharedSpaceEventRow"

// Full "system standard" event card for /spaces/scheduled -- Iain,
// 2026-08-23: "Schedule Events needs to conform to the system standard as
// per the attached screen shot. Matching all details including Edit option
// for the event owner (user that booked the space ONLY)." The attached
// reference was Social's own EventCard (app/(app)/social/events/page.js):
// title + status pill (+ Edit, owner-only here rather than admin-only) on
// one row, date/time, location, coordinator, bus driver when applicable,
// description, a capacity bar, and an Attendees accordion. No payment
// block -- Book a Space has no payment tracking, unlike Social/Clubs/Show
// Time, so that part of the reference card doesn't apply.

const COLOUR = "var(--space)"
const COLOUR_HEX = "#f97316" // see NextSpaceEventTile.js -- var()+alpha-suffix is invalid CSS

function CapacityBar({ booked, max, waitlist }) {
  if (!max || max <= 0) return null
  const pct    = Math.min(100, (booked / max) * 100)
  const left   = Math.max(0, max - booked)
  const colour = pct >= 85 ? "var(--danger)" : pct >= 55 ? "var(--amber)" : "var(--green)"
  return (
    <div>
      <div style={{ height: 6, background: "var(--surface2)", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: colour, borderRadius: 4, minWidth: pct > 0 ? 4 : 0 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-dim)" }}>
        <span>{booked}/{max} seats{waitlist > 0 && ` · ${waitlist} waiting`}</span>
        <span style={{ color: left === 0 ? "var(--danger)" : colour, fontWeight: 600 }}>
          {left === 0 ? "Full" : `${left} left`}
        </span>
      </div>
    </div>
  )
}

// event: the widened row from GET /api/spaces?calendar_from=&calendar_to=
// (route.js's non-location-filtered branch) -- already carries isCoordinator
// and per-booking display_name resolved server-side (masking respected).
export default function SpaceScheduledEventCard({ event, onOpen, onEdit }) {
  const [showAttendees, setShowAttendees] = useState(false)

  const coordinators = (event.event_coordinators || [])
    .filter(c => !c.replaced_at)
    .map(c => c.members)
    .filter(Boolean)
  const ecNames = coordinators.map(c => c.display_name || c.name || c.username).filter(Boolean)

  // You always first, then A-Z (Iain, 2026-08-23 round 4).
  const bySelfFirst = (a, b) => byOwnThenName(a.isOwn, b.isOwn, a.display_name, b.display_name)
  const confirmedBookings = (event.bookings || []).filter(b => b.status === "confirmed").sort(bySelfFirst)
  const waitlistBookings = (event.bookings || []).filter(b => b.status === "waitlist").sort(bySelfFirst)
  const booked  = confirmedBookings.reduce((s, b) => s + (b.seats || 1), 0)
  const waiting = waitlistBookings.length
  const myBooking = (event.bookings || []).find(b => b.isOwn && b.status !== "cancelled") || null

  const today     = new Date(); today.setHours(0, 0, 0, 0)
  const [y, m, d] = event.event_date.split("-").map(Number)
  const evDate    = new Date(y, m - 1, d)
  const isPast    = evDate < today
  const daysUntil = Math.round((evDate - today) / 86400000)
  const daysLabel = isPast ? null : daysUntil === 0 ? "Today!" : daysUntil === 1 ? "Tomorrow" : `In ${daysUntil} days`

  const isConfirmed = myBooking?.status === "confirmed"
  const isWaitlist  = myBooking?.status === "waitlist"
  const closed  = bookingsClosed(event)
  const blocked = closed && !isConfirmed && !isWaitlist

  return (
    <div onClick={blocked ? undefined : onOpen} style={{
      background: "var(--surface)", borderRadius: "14px",
      border: "1px solid var(--border)", overflow: "hidden",
      opacity: isPast ? 0.65 : 1, cursor: blocked ? "default" : "pointer",
    }}>
      <div style={{ padding: "0.9rem 1rem" }}>
        {/* Title + status pill + Edit, all on one row -- same layout as
            Social's EventCard so a resident sees the same pattern everywhere. */}
        {/* Accessibility fix (2026-08-31): flexWrap + title ellipsis so a
            long event title can't push the status pill/Edit button past the
            visible area -- app/globals.css's html{overflow-x:hidden} means
            that overflow isn't scrollable, it's just invisible. Same root
            cause as the confirmed ClubHome.js Edit-button bug. */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.35rem" }}>
          <div style={{ fontWeight: 700, fontSize: "1rem", lineHeight: 1.2, flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.title}</div>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: "0.4rem", flexShrink: 0 }}>
            {isConfirmed && (
              <span style={{
                background: COLOUR_HEX + "18", color: COLOUR,
                borderRadius: "20px", padding: "0.2rem 0.55rem",
                fontSize: "0.7rem", fontWeight: 700, whiteSpace: "nowrap",
              }}>{`✓ ${myBooking.seats || 1} seat${(myBooking.seats || 1) !== 1 ? "s" : ""} booked`}</span>
            )}
            {isWaitlist && (
              <span style={{ background: "#f1f5f9", color: "#64748b", borderRadius: "20px", padding: "0.2rem 0.55rem", fontSize: "0.7rem", fontWeight: 700, whiteSpace: "nowrap" }}>Waitlisted</span>
            )}
            {daysLabel && !isConfirmed && !isWaitlist && (
              <span style={{
                background: closed ? "#fee2e2" : COLOUR_HEX + "18", color: closed ? "#991b1b" : COLOUR,
                borderRadius: "20px", padding: "0.2rem 0.55rem", fontSize: "0.7rem", fontWeight: 700, whiteSpace: "nowrap",
              }}>{closed ? "Bookings Closed" : daysLabel}</span>
            )}
            {/* Owner-only, not admin-gated -- Iain, 2026-08-23: "Edit option
                for the event owner (user that booked the space ONLY)". */}
            {event.isCoordinator && onEdit && (
              <button onClick={e => { e.stopPropagation(); onEdit(event) }} style={{
                background: "var(--surface2)", border: "1px solid var(--border)",
                borderRadius: "8px", padding: "0.2rem 0.6rem",
                fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
                color: "var(--text-dim)", fontFamily: "inherit", flexShrink: 0,
              }}>Edit</button>
            )}
          </div>
        </div>

        <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginBottom: "0.2rem" }}>
          {fmtSpaceEventDate(event.event_date)}{event.event_time ? ` · ${fmtSpaceEventTime(event.event_time)}` : ""}
        </div>

        {event.location && (
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.2rem" }}>
            📍 {event.location_type === "offsite" ? event.location.split("\n")[0] : event.location}
          </div>
        )}

        <EventCoordinators eventId={event.id} eventTitle={event.title} names={ecNames}
          colour={COLOUR} style={{ marginBottom: "0.2rem" }} />

        {event.has_bus && event.bus_driver && (
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.2rem", display: "flex", alignItems: "center", gap: 5 }}>
            <BusIcon size={14} /> <span>{event.bus_driver.display_name || event.bus_driver.name || event.bus_driver.username}</span>
          </div>
        )}

        {event.description && (
          <div style={{
            fontSize: "0.78rem", color: "var(--text-dim)", lineHeight: 1.45, marginBottom: "0.5rem",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{event.description}</div>
        )}

        <CapacityBar booked={booked} max={event.max_seats} waitlist={waiting} />
      </div>

      {event.max_seats > 0 && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface2)" }}>
          <button onClick={e => { e.stopPropagation(); setShowAttendees(v => !v) }}
            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 1rem", background: "none", border: "none", cursor: "pointer", fontSize: "0.75rem", color: "var(--text-dim)", fontFamily: "inherit" }}>
            <span>
              <strong style={{ color: "var(--text)" }}>{booked} seat{booked !== 1 ? "s" : ""}</strong>
              <span style={{ marginLeft: "0.4rem" }}>of {event.max_seats}</span>
              {waiting > 0 && <span style={{ color: "var(--amber-dark)", marginLeft: "0.4rem" }}>· {waiting} waitlist</span>}
            </span>
            <span style={{ fontSize: "0.65rem", color: "var(--teal)" }}>{showAttendees ? "▲ Hide" : "▼ Attendees"}</span>
          </button>
          {showAttendees && (
            <div style={{ padding: "0 1rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              {confirmedBookings.length === 0 && waitlistBookings.length === 0 && (
                <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>No one booked yet.</div>
              )}
{confirmedBookings.map(b => (
  <div key={b.id}>
  <div style={{ fontSize: "0.8rem", color: "var(--text)", display: "flex", justifyContent: "space-between" }}>
                       <span>{b.isOwn ? <strong>You</strong> : b.display_name}</span>
                       <span style={{ color: "var(--text-dim)" }}>{b.seats || 1} seat{(b.seats || 1) !== 1 ? "s" : ""}</span>
  </div>
{(b.party || []).length > 0 && (
  <div style={{ paddingLeft: "0.85rem", marginTop: "0.05rem", display: "flex", flexDirection: "column", gap: "0.05rem" }}>
{b.party.map((p, j) => (
  <span key={j} style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
             + {p.isOwn ? "You" : p.display_name}{p.guest_name ? " (guest)" : ""}
</span>
))}
</div>
)}
</div>
              ))}
              {waitlistBookings.map(b => (
                <div key={b.id} style={{ fontSize: "0.8rem", color: "var(--text-dim)", display: "flex", justifyContent: "space-between" }}>
                  <span>{b.isOwn ? <strong>You</strong> : b.display_name} (waitlist)</span>
                  <span>{b.seats || 1} seat{(b.seats || 1) !== 1 ? "s" : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
