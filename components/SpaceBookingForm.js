"use client"
import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import TimeField from "@/components/TimeField"
import { authedFetch } from "@/lib/getAuthToken"
import { BOOKING_REASON_MAX } from "@/lib/spaceBookings"
import { useSameDateWarning } from "@/components/SameDateWarning"

// Book a Space — Personal Space Booking. Scope:
// Social_Hive_Personal_Space_Booking_Scope.md (decisions locked 2026-08-01).
//
// Deliberate flow order, per Iain 2026-08-01: "enforce a user date and time
// from/to decision, before then enabling location, as this would filter the
// available locations based on the date and time nominated." Date/time first,
// THEN the location list — never the other way round. This is also how the
// visibility question got answered: a resident sees what's genuinely free
// for their chosen window by construction, rather than a separate browsable
// list of every booking's private reason.
//
// Any resident can book any bookable space for their own use, independent of
// every hub/club — this form is deliberately NOT scoped to one.

function Portal({ children }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted ? createPortal(children, document.body) : null
}

const LABEL = { display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.05em" }
const FIELD = { marginBottom: "1.1rem" }
const INPUT = { width: "100%", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box", fontFamily: "inherit" }

function addHour(time) {
  if (!time) return ""
  const [h, m] = time.split(":").map(Number)
  const nh = (h + 1) % 24
  return `${String(nh).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

export default function SpaceBookingForm({ open, onClose, onBooked }) {
  const [date, setDate] = useState("")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [locations, setLocations] = useState(null) // null = not checked yet
  const [locationsLoading, setLocationsLoading] = useState(false)
  const [locationId, setLocationId] = useState("")
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [acknowledgedClash, setAcknowledgedClash] = useState(null) // same-date events the resident proceeded past, or null
  const fetchTag = useRef(0)
  const { ask: askSameDate, Modal: SameDateModal } = useSameDateWarning()

  const today = new Date().toISOString().split("T")[0]
  const windowValid = !!(date && startTime && endTime && endTime > startTime)

  // Reset everything when the sheet is closed and reopened, so a stale
  // half-filled booking from last time can't be accidentally submitted.
  useEffect(() => {
    if (open) {
      setDate(""); setStartTime(""); setEndTime("")
      setLocations(null); setLocationId(""); setReason("")
      setError(""); setSuccess(false); setSubmitting(false)
      setAcknowledgedClash(null)
    }
  }, [open])

  // When start time changes, keep end time sensible (start + 1hr) rather
  // than leaving an invalid or empty end time silently blocking the form.
  function handleStartChange(v) {
    setStartTime(v)
    if (v && (!endTime || endTime <= v)) setEndTime(addHour(v))
  }

  const loadLocations = useCallback(async () => {
    if (!windowValid) { setLocations(null); return }
    const tag = ++fetchTag.current
    setLocationsLoading(true)
    setLocationId("")
    try {
      const res = await authedFetch(`/api/spaces?event_date=${date}&event_time=${startTime}&event_end_time=${endTime}`)
      const data = await res.json()
      if (tag !== fetchTag.current) return
      if (!res.ok) { setError(data.error || "Could not check availability"); setLocations([]); return }
      setError("")
      setLocations(data.locations || [])
    } catch {
      if (tag === fetchTag.current) { setError("Could not check availability — check your connection"); setLocations([]) }
    } finally {
      if (tag === fetchTag.current) setLocationsLoading(false)
    }
  }, [date, startTime, endTime, windowValid])

  useEffect(() => { loadLocations() }, [loadLocations])

  const reasonTrimmed = reason.trim()
  const canSubmit = windowValid && locationId && reasonTrimmed && reasonTrimmed.length <= BOOKING_REASON_MAX && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true); setError("")

    // Soft same-day warning, in keeping with the event booking modal (Iain,
    // 2026-08-04): another Hive event that day, in any room, was previously
    // invisible here -- a resident could book the Lounge with no idea Show
    // Time had the Cinema running that same evening. Reuses the exact same
    // precheck endpoint and SameDateWarning UI that Social/Screenings/Clubs
    // already use, rather than inventing a second version of this pattern.
    // Only a soft heads-up -- it never blocks the booking, matching the
    // existing "hard block first, soft warning second, never both" priority.
    let clashEvents = null
    try {
      const pre = await authedFetch("/api/events/precheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_date: date, event_time: startTime, event_end_time: endTime,
          location_type: "onsite", location_id: locationId,
        }),
      }).then(r => r.json()).catch(() => ({}))
      if (pre.sameDateEvents?.length) {
        if (!(await askSameDate(pre.sameDateEvents))) { setSubmitting(false); return }
        clashEvents = pre.sameDateEvents
      }
    } catch {
      // Precheck is advisory only -- if it fails, fall through to the real
      // booking attempt rather than blocking on a check that isn't the
      // actual source of truth (the POST below re-validates regardless).
    }

    try {
      const res = await authedFetch("/api/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: locationId, event_date: date, event_time: startTime, event_end_time: endTime, reason: reasonTrimmed }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Could not book that space"); setSubmitting(false); return }
      setAcknowledgedClash(clashEvents)
      setSuccess(true)
      // Bug fix (Iain, 2026-08-04 live-fire find): this used to never reset,
      // which permanently disabled handleClose's `if (!submitting)` guard
      // after every successful booking -- the X button (and the backdrop
      // click) silently did nothing, and only "Done" (which calls onClose
      // directly, bypassing the guard) could close the sheet.
      setSubmitting(false)
      onBooked?.(data)
    } catch {
      setError("Could not book that space — check your connection")
      setSubmitting(false)
    }
  }

  function handleClose() { if (!submitting) onClose?.() }

  return (
    <>
    <Portal>
      <div onClick={handleClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300,
        opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: "opacity 0.25s ease",
      }} />

      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "min(440px, 96vw)",
        background: "var(--surface)", zIndex: 301, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch",
        transform: open ? "translateX(0)" : "translateX(100%)", pointerEvents: open ? "auto" : "none",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.15)", paddingBottom: 32,
      }}>
        <div style={{ height: 6, background: "var(--amber)" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px",
          borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Book a Space</div>
          <button onClick={handleClose} style={{ background: "var(--surface2)", border: "none", borderRadius: "50%",
            width: 36, height: 36, fontSize: 20, cursor: "pointer", color: "var(--text)",
            display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        {success ? (
          <div style={{ padding: "2rem 1.25rem", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: "0.4rem" }}>Space booked</div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: "1.5rem" }}>
              {acknowledgedClash?.length ? (
                <>Note: {acknowledgedClash.map(e => e.title).join(", ")} {acknowledgedClash.length === 1 ? "is" : "are"} also on
                that day. Remember to check and book the space in the Ingenia app too.</>
              ) : (
                <>No other Hive event or booking clashes with this. Remember to check and book the space in the Ingenia app too.</>
              )}
            </div>
            <button onClick={onClose} style={{ background: "var(--teal)", color: "#fff", border: "none", borderRadius: 10,
              padding: "0.8rem 1.5rem", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer", width: "100%" }}>
              Done
            </button>
          </div>
        ) : (
        <div style={{ padding: "1.1rem 1.1rem 0" }}>
          <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginBottom: "1.25rem", lineHeight: 1.5 }}>
            Book a common-area space for your own use — a family gathering, a hobby group, anything
            that isn't already covered by Show Time, Social, or Groups &amp; Clubs.
          </div>

          <div style={FIELD}>
            <label style={LABEL}>Date</label>
            <input type="date" value={date} min={today} onChange={e => setDate(e.target.value)} style={INPUT} />
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <div style={{ ...FIELD, flex: 1 }}>
              <label style={LABEL}>Start</label>
              <TimeField value={startTime} onChange={handleStartChange} colour={startTime ? "var(--green)" : "var(--border)"} />
            </div>
            <div style={{ ...FIELD, flex: 1 }}>
              <label style={LABEL}>End</label>
              <TimeField value={endTime} onChange={setEndTime} colour={endTime && endTime > startTime ? "var(--green)" : "var(--danger)"} />
            </div>
          </div>
          {startTime && endTime && endTime <= startTime && (
            <div style={{ fontSize: "0.78rem", color: "var(--danger)", marginTop: "-0.75rem", marginBottom: "1rem" }}>
              End time must be after the start time.
            </div>
          )}

          {windowValid && (
            <div style={FIELD}>
              <label style={LABEL}>Space</label>
              {locationsLoading ? (
                <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", padding: "0.6rem 0" }}>Checking what's free…</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {(locations || []).map(loc => (
                    <button
                      key={loc.id}
                      type="button"
                      disabled={!loc.available}
                      onClick={() => loc.available && setLocationId(loc.id)}
                      style={{
                        textAlign: "left", padding: "0.7rem 0.9rem", borderRadius: 10,
                        border: `1px solid ${locationId === loc.id ? "var(--teal)" : "var(--border)"}`,
                        background: locationId === loc.id ? "var(--surface2)" : "var(--surface)",
                        cursor: loc.available ? "pointer" : "not-allowed",
                        opacity: loc.available ? 1 : 0.55,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{loc.name}</span>
                        {locationId === loc.id && <span style={{ color: "var(--teal)" }}>✓</span>}
                      </div>
                      {!loc.available && loc.reason && (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.2rem" }}>{loc.reason}</div>
                      )}
                    </button>
                  ))}
                  {locations && locations.length === 0 && (
                    <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>No bookable spaces found.</div>
                  )}
                  {locations && locations.length > 0 && !locations.some(l => l.available) && (
                    <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                      Nothing's free for that window — try a different time.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {locationId && (
            <div style={FIELD}>
              <label style={LABEL}>What's it for?</label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value.slice(0, BOOKING_REASON_MAX))}
                placeholder="e.g. Family birthday lunch"
                rows={3}
                style={{ ...INPUT, resize: "vertical" }}
              />
              <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "0.3rem", textAlign: "right" }}>
                {BOOKING_REASON_MAX - reasonTrimmed.length} characters left
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: "var(--danger-bg, #fdecea)", color: "var(--danger)", border: "1px solid var(--danger)",
              borderRadius: 10, padding: "0.7rem 0.9rem", fontSize: "0.85rem", marginBottom: "1rem" }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              background: "var(--teal)", color: "#fff", border: "none", borderRadius: 10,
              padding: "0.85rem 1.5rem", fontWeight: 700, fontSize: "0.95rem", width: "100%",
              cursor: canSubmit ? "pointer" : "not-allowed", opacity: canSubmit ? 1 : 0.5, marginBottom: "1.5rem",
            }}
          >
            {submitting ? "Booking…" : "Book this space"}
          </button>
        </div>
        )}
      </div>
    </Portal>
    {SameDateModal}
    </>
  )
}
