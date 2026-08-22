"use client"
import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { authedFetch } from "@/lib/getAuthToken"
import { SPACE_EVENT_TITLE_MAX } from "@/lib/spaceBookings"

// "Allow others to join" -- Book a Space's toggle from a private booking
// into a real, capacity-managed shared event. Scope: Book_a_Space_Scope_v2.md
// / Book_a_Space_Technical_Design.md (Iain, 2026-08-22). Confirmed flippable
// after creation, not just at booking time ("Yes can be flipped after the
// fact") -- so this is a standalone action on an EXISTING private booking,
// not a field bolted onto SpaceBookingForm's already-complex create/edit
// flow. Deliberately doesn't touch SpaceBookingForm at all, so the live
// Personal Space Booking feature this hub absorbs stays exactly as tested.
//
// Once promoted, the booking can no longer be un-shared here (demoting is
// out of scope -- see lib/spaceBookings.js's promoteSpaceBookingToEvent
// comment) -- managing the resulting event (seats, cancel, attendees) is a
// job for the event itself via EventSlideOut, same as every other hub.

function Portal({ children }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted ? createPortal(children, document.body) : null
}

const LABEL = { display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.05em" }
const INPUT = { width: "100%", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box", fontFamily: "inherit" }
const FIELD = { marginBottom: "1.1rem" }

function Toggle({ value, onChange, label, colour = "var(--space)" }) {
  return (
    <div onClick={() => onChange(!value)} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0.65rem 0.85rem", background: "var(--surface2)",
      borderRadius: 10, cursor: "pointer", userSelect: "none",
      border: "1px solid var(--border)",
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{label}</span>
      <div style={{
        width: 40, height: 22, borderRadius: 11,
        background: value ? colour : "var(--border)",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", top: 2, left: value ? 20 : 2,
          width: 18, height: 18, borderRadius: "50%",
          background: "#fff", transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </div>
    </div>
  )
}

// booking: { id, title } -- the private space_bookings row being promoted.
// onPromoted(event_id) fires on success so the caller can e.g. navigate to
// the new event or just refresh its list.
export default function PromoteBookingModal({ booking, onClose, onPromoted }) {
  const [title, setTitle] = useState("")
  const [maxSeats, setMaxSeats] = useState("10")
  const [maxPerBooking, setMaxPerBooking] = useState("4")
  const [allowGuests, setAllowGuests] = useState(false)
  const [hasBus, setHasBus] = useState(false)
  const [busMaxSeats, setBusMaxSeats] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (booking) {
      setTitle(booking.title || "")
      setMaxSeats("10"); setMaxPerBooking("4")
      setAllowGuests(false); setHasBus(false); setBusMaxSeats("")
      setError(""); setSubmitting(false)
    }
  }, [booking])

  if (!booking) return null

  const titleTrimmed = title.trim()
  const seatsNum = Number(maxSeats)
  const perBookingNum = Number(maxPerBooking)
  const canSubmit = titleTrimmed && titleTrimmed.length <= SPACE_EVENT_TITLE_MAX &&
    Number.isInteger(seatsNum) && seatsNum >= 1 &&
    Number.isInteger(perBookingNum) && perBookingNum >= 1 && perBookingNum <= seatsNum &&
    !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true); setError("")
    try {
      const res = await authedFetch("/api/spaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "promote_to_event", id: booking.id,
          title: titleTrimmed, max_seats: seatsNum, max_seats_per_booking: perBookingNum,
          allow_nonresident_guests: allowGuests,
          has_bus: hasBus, bus_max_seats: hasBus && busMaxSeats ? Number(busMaxSeats) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Could not share this booking"); setSubmitting(false); return }
      onPromoted?.(data.event_id)
    } catch {
      setError("Could not share this booking — check your connection")
      setSubmitting(false)
    }
  }

  return (
    <Portal>
      <div onClick={() => !submitting && onClose?.()} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500,
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: "var(--surface)", borderRadius: 16, padding: "1.25rem",
          maxWidth: 400, width: "100%", maxHeight: "90vh", overflowY: "auto",
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
        }}>
          <div style={{ fontWeight: 800, fontSize: "1.05rem", marginBottom: 4 }}>Allow others to join</div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: 16 }}>
            This turns your booking into a shared event other residents can see and book into.
          </div>

          <div style={FIELD}>
            <label style={LABEL}>Title</label>
            <input style={INPUT} value={title} onChange={e => setTitle(e.target.value)}
              maxLength={SPACE_EVENT_TITLE_MAX} placeholder="What's happening?" />
          </div>

          <div style={{ display: "flex", gap: "0.75rem", ...FIELD }}>
            <div style={{ flex: 1 }}>
              <label style={LABEL}>Total Seats</label>
              <input style={INPUT} type="number" min={1} value={maxSeats} onChange={e => setMaxSeats(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={LABEL}>Max per Booking</label>
              <input style={INPUT} type="number" min={1} value={maxPerBooking} onChange={e => setMaxPerBooking(e.target.value)} />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1.1rem" }}>
            <Toggle value={allowGuests} onChange={setAllowGuests} label="Anyone can book (not just residents)" />
            <Toggle value={hasBus} onChange={setHasBus} label="Offer the Community Bus" />
          </div>

          {hasBus && (
            <div style={FIELD}>
              <label style={LABEL}>Bus Seats</label>
              <input style={INPUT} type="number" min={1} value={busMaxSeats} onChange={e => setBusMaxSeats(e.target.value)} placeholder="Leave blank for no limit" />
            </div>
          )}

          {error && (
            <div style={{ background: "rgba(220,38,38,0.08)", color: "var(--danger)", borderRadius: 10,
              padding: "0.65rem 0.85rem", fontSize: "0.82rem", marginBottom: "1rem" }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => !submitting && onClose?.()}
              style={{ flex: 1, padding: "0.7rem", borderRadius: 10, border: "1px solid var(--border)",
                background: "var(--surface)", color: "var(--text)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={!canSubmit}
              style={{ flex: 1, padding: "0.7rem", borderRadius: 10, border: "none",
                background: "var(--space)", color: "#fff", fontWeight: 700, fontFamily: "inherit",
                cursor: canSubmit ? "pointer" : "default", opacity: canSubmit ? 1 : 0.6 }}>
              {submitting ? "Sharing…" : "Share this booking"}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
