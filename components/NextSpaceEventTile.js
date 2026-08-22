"use client"
import EventCoordinators from "@/components/EventCoordinators"
import { BusIcon } from "@/components/NavIcons"
import { bookingsClosed } from "@/lib/booking"
import { fmtSpaceEventDate, fmtSpaceEventTime } from "@/components/SharedSpaceEventRow"

// Standard "Next Event" tile, adapted for Space Bookings from Social's own
// NextEventTile (app/(app)/social/page.js) -- Iain, 2026-08-23: "The
// standard UI presentation for Next Event and for My bookings needs to be
// identical to Social's home page which is followed in principle
// elsewhere in Showtime and Groups and Clubs." Same structure, same
// fields, same order: title, date/time, location, coordinator, bus driver
// (when applicable), a seats status bar, and a seats-booked pill (or a
// Tap-to-book / Bookings Closed CTA) at the bottom. No payment block --
// Book a Space has no payment tracking (Book_a_Space_Scope_v2.md,
// explicitly out of scope), so that part of Social's tile is dropped
// rather than left rendering nothing.

const COLOUR = "var(--space)"
// Iain, 2026-08-23: the status/CTA pills below need a colour + alpha-suffix
// background (`COLOUR + "18"`), but that trick only works on a literal hex --
// `var(--space)` + "18" produces the invalid CSS string "var(--space)18",
// which the browser silently drops, leaving no background at all (exactly
// the "not a pill" bug he flagged, comparing this tile against Social's own
// NextEventTile). Same failure class already documented in RichEditor.js's
// resolveColour() comment. --space is fixed to this one hub, so a literal
// constant is simplest -- no need for RichEditor's var()->hex resolver.
const COLOUR_HEX = "#f97316"

function CapacityBar({ booked, max }) {
  if (!max || max <= 0) return null
  const pct    = Math.min(100, (booked / max) * 100)
  const left   = Math.max(0, max - booked)
  const colour = pct >= 85 ? "var(--danger)" : pct >= 55 ? "var(--amber)" : "var(--green)"
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div style={{ height: 5, background: "var(--surface2)", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: colour, borderRadius: 4, minWidth: pct > 0 ? 4 : 0 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-dim)" }}>
        <span>{booked}/{max} seats</span>
        <span style={{ color: left === 0 ? "var(--danger)" : colour, fontWeight: 600 }}>
          {left === 0 ? "Full" : `${left} left`}
        </span>
      </div>
    </div>
  )
}

// event: widened hub_type='space' event row (title, event_date, event_time,
// description, location, location_type, max_seats, has_bus, bus_driver,
// reservation_cutoff).
// coordinators: [{name, username}] for this event (its organiser(s)).
// myBooking: the viewer's own active booking on this event, or null.
// bookedCount: sum of confirmed seats across all attendees.
export default function NextSpaceEventTile({ event, coordinators = [], myBooking, bookedCount = 0, onOpen, isCoordinator = false, onEdit }) {
  if (!event) {
    return (
      <div style={{
        background: "var(--surface)", borderRadius: "16px",
        border: "1px solid var(--border)", overflow: "hidden",
        boxShadow: "var(--shadow)", marginBottom: "1.25rem",
      }}>
        <div style={{ background: COLOUR, padding: "0.6rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}>Next Scheduled Space</span>
        </div>
        <div style={{ padding: "1.25rem 1rem", textAlign: "center" }}>
          <div style={{ fontSize: "1.8rem", marginBottom: "0.4rem" }}>🏡</div>
          <div style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>
            No shared space bookings coming up — book a room, or open one up to others
          </div>
        </div>
      </div>
    )
  }

  const today     = new Date(); today.setHours(0, 0, 0, 0)
  const [y, m, d] = event.event_date.split("-").map(Number)
  const evDate    = new Date(y, m - 1, d)
  const daysUntil = Math.round((evDate - today) / 86400000)
  const daysLabel = daysUntil === 0 ? "Today!" : daysUntil === 1 ? "Tomorrow" : `In ${daysUntil} days`

  const isConfirmed = myBooking?.status === "confirmed"
  const isWaitlist  = myBooking?.status === "waitlist"
  const ecNames     = coordinators.map(c => c.name || c.username).filter(Boolean)
  const closed      = bookingsClosed(event)
  const blocked     = closed && !isConfirmed && !isWaitlist

  return (
    <div onClick={blocked ? undefined : onOpen} style={{
      background: "var(--surface)", borderRadius: "16px",
      border: "1px solid var(--border)", overflow: "hidden",
      boxShadow: "var(--shadow)", marginBottom: "1.25rem", cursor: blocked ? "default" : "pointer",
    }}>
      <div style={{
        background: COLOUR, padding: "0.6rem 1rem",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}>Next Scheduled Space</span>
        <span style={{ color: "rgba(255,255,255,0.9)", fontSize: "0.78rem", fontWeight: 600 }}>{daysLabel} ›</span>
      </div>

      <div style={{ padding: "0.9rem 1rem" }}>
        <div style={{ fontWeight: 800, fontSize: "1.05rem", lineHeight: 1.2, marginBottom: "0.3rem" }}>
          {event.title}
        </div>

        <div style={{ fontSize: "0.8rem", color: COLOUR, fontWeight: 600, marginBottom: "0.2rem" }}>
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
            <BusIcon size={14} /> <span>{event.bus_driver.name || event.bus_driver.username}</span>
          </div>
        )}

        {event.description && (
          <div style={{
            fontSize: "0.78rem", color: "var(--text-dim)", lineHeight: 1.45,
            marginBottom: "0.4rem",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{event.description}</div>
        )}

        <CapacityBar booked={bookedCount} max={event.max_seats} />

        <div style={{ marginTop: "0.6rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {isConfirmed ? (
            <div style={{
              display: "inline-flex", alignItems: "center",
              background: COLOUR_HEX + "18", color: COLOUR,
              borderRadius: "20px", padding: "0.25rem 0.75rem",
              fontSize: "0.78rem", fontWeight: 700,
            }}>{`✓ ${myBooking.seats || 1} seat${(myBooking.seats || 1) !== 1 ? "s" : ""} booked`}</div>
          ) : isWaitlist ? (
            <div style={{
              display: "inline-flex", alignItems: "center",
              background: "var(--surface2)", color: "var(--text-dim)",
              borderRadius: "20px", padding: "0.25rem 0.75rem",
              fontSize: "0.78rem", fontWeight: 700,
            }}>⏳ You're on the waitlist</div>
          ) : (
            <div style={{
              display: "inline-flex", alignItems: "center",
              background: closed ? "#fee2e2" : COLOUR_HEX + "18", color: closed ? "#991b1b" : COLOUR,
              borderRadius: "20px", padding: "0.25rem 0.75rem",
              fontSize: "0.78rem", fontWeight: 700,
            }}>{closed ? "Bookings Closed" : "Tap to book →"}</div>
          )}
          {/* Edit -- organiser only (Iain, 2026-08-23: "Edit option for the
              event owner, user that booked the space ONLY"), same place as
              My Space Bookings' own Edit pill so both surfaces are
              consistent. Not admin-gated in the UI even though the backend
              (updateSpaceEvent) also allows admin -- this button is
              specifically the owner's control, matching his wording. */}
          {isCoordinator && onEdit && (
            <button type="button" onClick={e => { e.stopPropagation(); onEdit() }} style={{
              background: "none", border: "1px solid var(--border)", color: "var(--text-dim)",
              borderRadius: "20px", padding: "0.24rem 0.7rem", fontSize: "0.75rem",
              fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
            }}>
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
