"use client"
import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { authedFetch } from "@/lib/getAuthToken"
import { SPACE_EVENT_TITLE_MAX } from "@/lib/spaceBookings"
import AttendeeNamingPicker from "@/components/AttendeeNamingPicker"

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
//
// Extra-attendee rules (Iain, 2026-08-22, "NO variation from what we
// already have"): reuses the exact same shared AttendeeNamingPicker
// Social/Clubs/Show Time all use, gated the same way (max seats per
// booking > 1), same field names (allow_nonresident_guests,
// require_attendee_names). No Community Bus field here -- Social only
// ever offers Bus for an offsite event, and a promoted space booking is
// always an ONSITE event (see promoteSpaceBookingToEvent), so a Bus
// toggle here would be UI that can never actually apply -- offering it
// anyway would itself be a variation from the existing pattern, not
// consistency with it. Flagged to Iain separately: real Bus support here
// would need genuine offsite-gathering creation, a materially bigger
// scope item than this promote flow.

function Portal({ children }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted ? createPortal(children, document.body) : null
}

const LABEL = { display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.05em" }
const INPUT = { width: "100%", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box", fontFamily: "inherit" }
const FIELD = { marginBottom: "1.1rem" }

// booking: { id, title } -- the private space_bookings row being promoted.
// onPromoted(event_id) fires on success so the caller can e.g. navigate to
// the new event or just refresh its list.
//
// editEvent (optional): pass an ALREADY-SHARED event instead of a private
// booking to switch this into edit mode (Iain, 2026-08-23: "the creator/
// owner of the booking" needs a way to "modify the details" of a space
// booking once shared, not just Cancel it -- previously unbuilt). Same
// fields, same form, different verb: prefills from the event's current
// values and PATCHes action=update_space_event instead of promote_to_event.
// Deliberately reuses this component rather than a second near-identical
// one -- the field set (title/seats/naming) is identical either way.
export default function PromoteBookingModal({ booking, editEvent, onClose, onPromoted }) {
  const isEdit = !!editEvent
  const source = editEvent || booking
  const [title, setTitle] = useState("")
  const [maxSeats, setMaxSeats] = useState("10")
  const [maxPerBooking, setMaxPerBooking] = useState("4")
  // Matches Social's new-event defaults exactly (app/(app)/social/events/
  // page.js): "Anyone" is the default for allow_nonresident_guests, naming
  // is optional (require_attendee_names off) by default. Edit mode prefills
  // the event's REAL current values instead of these defaults.
  const [allowGuests, setAllowGuests] = useState(true)
  const [requireNames, setRequireNames] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!source) return
    setTitle(source.title || "")
    if (isEdit) {
      setMaxSeats(String(editEvent.max_seats ?? 10))
      setMaxPerBooking(String(editEvent.max_seats_per_booking ?? 4))
      setAllowGuests(!!editEvent.allow_nonresident_guests)
      setRequireNames(!!editEvent.require_attendee_names)
    } else {
      setMaxSeats("10"); setMaxPerBooking("4")
      setAllowGuests(true); setRequireNames(false)
    }
    setError(""); setSubmitting(false)
  }, [booking, editEvent, isEdit, source])

  if (!source) return null

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
          action: isEdit ? "update_space_event" : "promote_to_event", id: source.id,
          title: titleTrimmed, max_seats: seatsNum, max_seats_per_booking: perBookingNum,
          allow_nonresident_guests: allowGuests,
          require_attendee_names: requireNames,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || (isEdit ? "Could not save these changes" : "Could not share this booking")); setSubmitting(false); return }
      onPromoted?.(data.event_id)
    } catch {
      setError((isEdit ? "Could not save these changes" : "Could not share this booking") + " — check your connection")
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
          <div style={{ fontWeight: 800, fontSize: "1.05rem", marginBottom: 4 }}>
            {isEdit ? "Edit this booking" : "Allow others to join"}
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: 16 }}>
            {isEdit
              ? "Anyone already booked in will be told about any change you make here."
              : "This turns your booking into a shared event other residents can see and book into."}
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

          {perBookingNum > 1 && (
            <AttendeeNamingPicker
              allowGuests={allowGuests}
              onAllowGuestsChange={setAllowGuests}
              required={requireNames}
              onRequiredChange={setRequireNames}
              colour="var(--space)"
            />
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
              {isEdit ? (submitting ? "Saving…" : "Save changes") : (submitting ? "Sharing…" : "Share this booking")}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
