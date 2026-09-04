"use client"
import EventCoordinators from "@/components/EventCoordinators"
import { useEffect, useState, useCallback, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { getAuthToken } from "@/lib/getAuthToken"
import { useUser } from "@/lib/UserContext"
import EventSlideOut from "@/components/EventSlideOut"
import { BusIcon } from "@/components/NavIcons"
import RichEditor, { bbToHtml } from "@/components/RichEditor"
import EventImagePicker from "@/components/EventImagePicker"
import ExpandableText from "@/components/ExpandableText"
import { sumUnpaidSeats, bookingStatusBadge, seatsCost, isPaid as computeIsPaid, isSubmitted as computeIsSubmitted, isPartial as computeIsPartial, isRefundPending, isRefundIssued, paymentSummary, reconciliationIsStale, balancePhrase, remainingBalance, wholeDollar, amountOwing } from "@/lib/payments"
import { cutoffToInputValue, cutoffFromInputValue, bookingsClosed } from "@/lib/booking"
import { useLocations } from "@/lib/useLocations"
import TimeField from "@/components/TimeField"
import { needsSpaceValidation } from "@/lib/eventClash"
import { useSameDateWarning } from "@/components/SameDateWarning"
import { useRequestOnlyAcknowledge } from "@/components/RequestOnlyAcknowledge"
import AttendeeNamingPicker from "@/components/AttendeeNamingPicker"
import { INVALID_FIELD_STYLE, scrollToFirstInvalid } from "@/lib/formValidation"
import { byOwnThenName } from "@/lib/sortNames"
import { resolveMemberName } from "@/lib/memberName"
import { busSeatsUsed } from "@/lib/busSeats"

// ── Design tokens ─────────────────────────────────────────────────────────────
const INPUT = {
  width: "100%", padding: "0.75rem 1rem", borderRadius: "10px",
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--text)", fontSize: "1rem", boxSizing: "border-box",
  fontFamily: "inherit", appearance: "none", WebkitAppearance: "none",
}
const LABEL = {
  display: "block", fontSize: "0.78rem", fontWeight: 700,
  color: "var(--text-dim)", textTransform: "uppercase",
  letterSpacing: "0.06em", marginBottom: "0.4rem",
}
const FIELD = { marginBottom: "1rem" }

function Toast({ msg, type }) {
  if (!msg) return null
  const bg = type === "error" ? "var(--danger)" : type === "warn" ? "var(--amber-dark)" : "#15803d"
  return (
    <div style={{ position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 9999,
      background: bg, color: "#fff", padding: "10px 20px", borderRadius: 12, fontSize: 14, fontWeight: 600,
      boxShadow: "0 4px 20px rgba(0,0,0,0.2)", maxWidth: "90vw", textAlign: "center" }}>{msg}</div>
  )
}

// Venues now live in the admin-managed `locations` table (migration 050) —
// see lib/useLocations. This constant is only a fallback for the brief moment
// before the list loads.
const ONSITE_LOCATIONS_FALLBACK = []

// ── Helpers ───────────────────────────────────────────────────────────────────
function localDate(str) {
  if (!str) return null
  const [y, m, d] = str.split("-").map(Number)
  return new Date(y, m - 1, d)
}
function fmtDate(str) {
  if (!str) return ""
  return localDate(str).toLocaleDateString("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })
}
function fmtTime(str) {
  if (!str) return ""
  const [h, m] = str.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h >= 12 ? "pm" : "am"}`
}
function fmtTime24(str) {
  if (!str) return ""
  const [h, m] = str.split(":").map(Number)
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

// ── Capacity Bar ──────────────────────────────────────────────────────────────
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


// ── Booking Status Strip ───────────────────────────────────────────────────────
// Always-visible bottom strip — shows booking state and tells the user what tapping does
function BookingStrip({ myBooking, event, isFull, closed, blocked }) {
  const isConfirmed = myBooking?.status === "confirmed"
  const isWaitlist  = myBooking?.status === "waitlist"
  const seats       = myBooking?.seats || 1
  const base = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.55rem 1rem", fontSize: "0.82rem", fontWeight: 600, gap: "0.5rem" }

  if (isConfirmed) {
    // Bug fixed 2026-07-08: this hardcoded "confirmed" regardless of
    // payment, so this strip could (and did) contradict the "Booked"/
    // "Confirmed" badge shown higher up on the same card — same card, two
    // different answers to the same question. Route through the shared
    // helper like every other status display now does.
    const badge = bookingStatusBadge(myBooking, event)
    const total = seatsCost(event, seats)
    const statusWord = badge.label.toLowerCase() // "booked" or "confirmed" — canonical, see lib/payments.js
    // Partial (2026-08-11 follow-up, Iain -- Spring Ball): this strip used
    // to re-show the FULL amount owed on a partial booking ("1 seat
    // partial - Unpaid $40" even though $30 was already in) -- the same
    // bug as the coordinator amount-entry flow, just on the resident's own
    // card. Show the actual remaining balance instead.
    const isPartialBooking = badge.label === "Partial"
    const balance = isPartialBooking ? balancePhrase(myBooking, event, seats) : null
    const submitted = badge.label !== "Confirmed" && !isPartialBooking && computeIsSubmitted(myBooking)
    const label = badge.label === "Confirmed"
      ? `✓ ${seats} seat${seats !== 1 ? "s" : ""} ${statusWord}${total ? " · Paid " + total : ""}`
      : isPartialBooking
        ? `${seats} seat${seats !== 1 ? "s" : ""} ${statusWord} · Unpaid ${balance}`
        : submitted
          ? `${seats} seat${seats !== 1 ? "s" : ""} ${statusWord} · Payment submitted${total ? " " + total : ""}`
          : `${seats} seat${seats !== 1 ? "s" : ""} ${statusWord}${total ? " · Unpaid " + total : ""}`
    const bg = badge.label === "Confirmed" ? "#f0fdf4" : submitted ? "#f0fdfa" : "#fffbeb"
    const border = badge.label === "Confirmed" ? "#bbf7d0" : submitted ? "#99f6e4" : "#fde68a"
    const textColour = badge.label === "Confirmed" ? badge.color : submitted ? "#0f766e" : badge.color
    return (
      <div style={{ ...base, background: bg, borderTop: `1px solid ${border}` }}>
        <span style={{ color: textColour }}>{label}</span>
        <span style={{ color: textColour, fontSize: "0.75rem" }}>Tap to modify or cancel →</span>
      </div>
    )
  }
  if (isWaitlist) {
    return (
      <div style={{ ...base, background: "#fffbeb", borderTop: "1px solid #fde68a" }}>
        <span style={{ color: "#d97706" }}>⏳ On waitlist · {seats} seat{seats !== 1 ? "s" : ""}</span>
        <span style={{ color: "#d97706", fontSize: "0.75rem" }}>Tap to manage →</span>
      </div>
    )
  }
  // Bug fixed 2026-08-21 (Iain): same fix as Movies/Social Home -- neither
  // branch below used to check the reservation cut-off. `blocked` (computed
  // by the parent EventCard via lib/booking.js's bookingsClosed()) is true
  // only when the viewer has no booking of their own AND isn't Owner/EC/Admin.
  if (closed) {
    return (
      <div style={{ ...base, background: "#fee2e2", borderTop: "1px solid #fca5a5" }}>
        <span style={{ color: "#991b1b", fontWeight: 700 }}>Bookings are closed</span>
      </div>
    )
  }
  if (isFull) {
    return (
      <div style={{ ...base, background: "#fff7ed", borderTop: "1px solid #fed7aa" }}>
        <span style={{ color: "#c2410c" }}>This event is full</span>
        <span style={{ color: "#c2410c", fontSize: "0.75rem" }}>Tap to join the waitlist →</span>
      </div>
    )
  }
  return (
    <div style={{ ...base, background: "rgba(176,84,64,0.06)", borderTop: "1px solid rgba(176,84,64,0.15)" }}>
      <span style={{ color: "var(--special)" }}>Book your spot</span>
      <span style={{ color: "var(--special)", fontSize: "0.75rem" }}>Tap to book →</span>
    </div>
  )
}

// ── Member picker — prop-based, in-memory filter (matches Book Club CoordPicker) ──
function MemberPicker({ members = [], value, onChange, placeholder = "Select member…", excludeIds = [] }) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState("")
  const containerRef      = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const pool     = members.filter(m => !excludeIds.includes(m.id))
  const filtered = pool.filter(m =>
    !query || (m.name || m.username || "").toLowerCase().includes(query.toLowerCase())
  )

  function pick(m) { onChange(m); setOpen(false); setQuery("") }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div onClick={() => { setOpen(o => !o); setQuery("") }}
        role="button" tabIndex={0} aria-haspopup="listbox" aria-expanded={open}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(o => !o); setQuery("") } }}
        style={{
        ...INPUT, display: "flex", alignItems: "center", justifyContent: "space-between",
        cursor: "pointer", borderColor: open ? "var(--special)" : "var(--border)",
      }}>
        <span style={{ color: value ? "var(--text)" : "var(--text-dim)" }}>
          {value ? (value.name || value.username) : placeholder}
        </span>
        <span style={{ color: "var(--text-dim)", fontSize: "0.75rem",
          transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}>▾</span>
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 60,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden",
        }}>
          <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search name…"
              style={{ width: "100%", border: "none", background: "transparent",
                color: "var(--text)", fontSize: "0.9rem", outline: "none", fontFamily: "inherit" }} />
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {value && (
              <div onClick={() => { onChange(null); setOpen(false) }}
                style={{ padding: "0.65rem 1rem", cursor: "pointer", fontSize: "0.85rem",
                  color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>
                — Clear selection —
              </div>
            )}
            {filtered.map(m => (
              <div key={m.id} onClick={() => pick(m)} style={{
                padding: "0.65rem 1rem", cursor: "pointer", borderBottom: "1px solid var(--border)",
                background: value?.id === m.id ? "var(--special)12" : "transparent",
                fontWeight: value?.id === m.id ? 700 : 400, fontSize: "0.88rem",
                color: value?.id === m.id ? "var(--special)" : "var(--text)",
              }}>
                {m.name || m.username}
                {m.name && m.username !== m.name && (
                  <span style={{ color: "var(--text-dim)", fontSize: "0.78rem", marginLeft: "0.4rem" }}>@{m.username}</span>
                )}
              </div>
            ))}
            {filtered.length === 0 && query && (
              <div style={{ padding: "0.65rem 1rem", color: "var(--text-dim)", fontSize: "0.85rem" }}>No match for "{query}"</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── EC multi-picker — prop-based, in-memory filter (matches Book Club CoordPicker) ──
function ECPicker({ members = [], value, onChange, valid, invalid = false }) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState("")
  const containerRef      = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const excluded = value.map(m => m.id)
  const pool     = members.filter(m => !excluded.includes(m.id))
  const filtered = pool.filter(m =>
    !query || (m.name || m.username || "").toLowerCase().includes(query.toLowerCase())
  )

  function pick(m) {
    if (value.length >= 3) return
    onChange([...value, m]); setOpen(false); setQuery("")
  }
  function remove(id) { onChange(value.filter(m => m.id !== id)) }

  // Border: green when valid (≥1 EC), red when not. `invalid` (Save was
  // pressed / live-empty) also fills the trigger with the same light-red
  // wash every other mandatory field uses (lib/formValidation.js) --
  // otherwise this trigger's own opaque background would hide a wash
  // applied only to a wrapping div.
  const triggerBorder = open
    ? "var(--special)"
    : valid ? "var(--green)" : "var(--danger)"

  return (
    <div ref={containerRef}>
      {/* Chips */}
      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.5rem" }}>
          {value.map(m => (
            <span key={m.id} style={{
              display: "inline-flex", alignItems: "center", gap: "0.3rem",
              background: "var(--special)20", color: "var(--special)",
              border: "1px solid var(--special)60",
              borderRadius: "20px", padding: "0.2rem 0.6rem 0.2rem 0.75rem",
              fontSize: "0.82rem", fontWeight: 600,
            }}>
              {m.name || m.username}
              <button onClick={() => remove(m.id)}
                style={{ background: "none", border: "none", color: "var(--special)", cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}

      {value.length < 3 && (
        <div style={{ position: "relative" }}>
          <div onClick={() => { setOpen(o => !o); setQuery("") }}
            role="button" tabIndex={0} aria-haspopup="listbox" aria-expanded={open}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(o => !o); setQuery("") } }}
            style={{
            ...INPUT, display: "flex", alignItems: "center", justifyContent: "space-between",
            cursor: "pointer", border: `1.5px solid ${triggerBorder}`,
            ...(invalid ? { border: "2px solid #dc2626", background: "rgba(220, 38, 38, 0.10)" } : {}),
          }}>
            <span style={{ color: "var(--text-dim)" }}>
              {value.length === 0 ? "Select coordinator…" : "Add another coordinator…"}
            </span>
            <span style={{ color: "var(--text-dim)", fontSize: "0.75rem",
              transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▾</span>
          </div>

          {open && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 60,
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden",
            }}>
              <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
                <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Search name…"
                  style={{ width: "100%", border: "none", background: "transparent",
                    color: "var(--text)", fontSize: "0.9rem", outline: "none", fontFamily: "inherit" }} />
              </div>
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {filtered.map(m => (
                  <div key={m.id} onClick={() => pick(m)} style={{
                    padding: "0.65rem 1rem", cursor: "pointer", borderBottom: "1px solid var(--border)",
                    fontSize: "0.88rem", color: "var(--text)",
                  }}>
                    {m.name || m.username}
                    {m.name && m.username !== m.name && (
                      <span style={{ color: "var(--text-dim)", fontSize: "0.78rem", marginLeft: "0.4rem" }}>@{m.username}</span>
                    )}
                  </div>
                ))}
                {filtered.length === 0 && query && (
                  <div style={{ padding: "0.65rem 1rem", color: "var(--text-dim)", fontSize: "0.85rem" }}>No match for "{query}"</div>
                )}
                {filtered.length === 0 && !query && pool.length === 0 && members.length > 0 && (
                  <div style={{ padding: "0.65rem 1rem", color: "var(--text-dim)", fontSize: "0.85rem" }}>All coordinators already added</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ value, onChange, label }) {
  return (
    <div onClick={() => onChange(!value)} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0.75rem 1rem", background: "var(--surface2)",
      borderRadius: "10px", cursor: "pointer", userSelect: "none",
      border: "1px solid var(--border)",
    }}>
      <span style={{ fontSize: "0.92rem", fontWeight: 600, color: "var(--text)" }}>{label}</span>
      <div style={{
        width: 44, height: 24, borderRadius: 12,
        background: value ? "var(--special)" : "var(--border)",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", top: 3, left: value ? 23 : 3,
          width: 18, height: 18, borderRadius: "50%",
          background: "#fff", transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </div>
    </div>
  )
}

// ── Fixed-list custom picker ──────────────────────────────────────────────────
// `value` is a location ID; `options` are {id, name} rows from useLocations().
function FixedListPicker({ value, onChange, options, placeholder = "Select…", invalid = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = options.find(o => (o.id || o) === value) || null

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          ...INPUT, display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", textAlign: "left",
          borderColor: open ? "var(--special)" : "var(--border)",
          ...(invalid ? { border: "2px solid #dc2626", background: "rgba(220, 38, 38, 0.10)" } : {}),
        }}
      >
        {/* Show the name for the SELECTED ID. Previously this rendered the raw
            stored value, so after a location was renamed the event's old name
            appeared in the dropdown looking perfectly valid — and re-saving
            wrote it straight back, wiping location_id. An id with no matching
            option is now called out instead of being passed off as fine. */}
        <span style={{ color: selected ? "var(--text)" : value ? "var(--danger)" : "var(--text-dim)" }}>
          {selected ? selected.name : value ? "Venue no longer available — choose again" : placeholder}
        </span>
        <span style={{
          fontSize: "0.7rem", color: "var(--text-dim)",
          transform: open ? "rotate(180deg)" : "none",
          transition: "transform 0.15s", flexShrink: 0, marginLeft: "0.5rem",
        }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 60,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          overflow: "hidden",
        }}>
          {options.map((opt, i) => (
            <button
              key={opt.id || opt}
              type="button"
              onClick={() => { onChange(opt.id || opt); setOpen(false) }}
              style={{
                width: "100%", padding: "0.75rem 1rem", textAlign: "left",
                background: value === (opt.id || opt) ? "var(--special)12" : "transparent",
                border: "none", borderTop: i > 0 ? "1px solid var(--border)" : "none",
                cursor: "pointer", fontFamily: "inherit", fontSize: "0.92rem",
                color: value === (opt.id || opt) ? "var(--special)" : "var(--text)",
                fontWeight: value === (opt.id || opt) ? 700 : 400,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}
            >
              <span style={{ flex: 1 }}>{opt.name || opt}</span>
              {opt.request_only && (
                <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--amber-dark)", marginRight: "0.4rem" }}>Request Only</span>
              )}
              {value === (opt.id || opt) && <span style={{ color: "var(--special)", fontSize: "0.85rem" }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Location field ────────────────────────────────────────────────────────────
// Onsite works in location IDs; offsite stays free text, which is deliberate —
// it is informational only, for the event and its attendees (Iain, 2026-07-31).
function LocationField({ locationType, location, locationId, onTypeChange, onLocationChange, onLocationIdChange, invalid }) {
  const onsiteLocations = useLocations()
  return (
    <div style={FIELD}>
      <label style={LABEL}>Location <span style={{ color: "var(--danger)" }}>*</span>
        {invalid && <span style={{ color: "#dc2626", fontWeight: 800, marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>⚠ Required</span>}
      </label>
      {/* Onsite / Offsite toggle buttons */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.6rem" }}>
        {["onsite", "offsite"].map(t => (
          <button key={t} type="button" onClick={() => { onTypeChange(t); onLocationChange(""); onLocationIdChange(null) }}
            style={{
              flex: 1, padding: "0.55rem", borderRadius: "10px", fontFamily: "inherit",
              fontSize: "0.88rem", fontWeight: 700, cursor: "pointer", border: "2px solid",
              borderColor: locationType === t ? "var(--special)" : "var(--border)",
              background: locationType === t ? "var(--special)18" : "var(--surface)",
              color: locationType === t ? "var(--special)" : "var(--text-dim)",
            }}>
            {t === "onsite" ? "On-site" : "Off-site"}
          </button>
        ))}
      </div>

      {locationType === "onsite" ? (
        <FixedListPicker
          value={locationId}
          onChange={onLocationIdChange}
          options={onsiteLocations.length ? onsiteLocations : ONSITE_LOCATIONS_FALLBACK}
          placeholder="Select venue…"
          invalid={invalid}
        />
      ) : (
        <textarea
          value={location}
          onChange={e => onLocationChange(e.target.value)}
          rows={3}
          placeholder="Enter venue name and address…"
          style={{ ...INPUT, resize: "vertical", ...(invalid ? { border: "2px solid #dc2626", background: "rgba(220, 38, 38, 0.10)" } : {}) }}
        />
      )}
    </div>
  )
}

// ── Special Event Form (slide-over) ────────────────────────────────────────────
function SpecialEventForm({ event, session, members = [], onClose, onSaved }) {
  const editing = !!event
  const allLocations = useLocations()
  const [form, setForm] = useState({
    title:                 event?.title               || "",
    event_date:            event?.event_date          || "",
    event_time:            event?.event_time ? fmtTime24(event.event_time) : "",
    event_end_time:        event?.event_end_time ? fmtTime24(event.event_end_time) : "",
    description:           event?.description         || "",
    welcome_message:       event?.welcome_message     || "",
    max_seats:             event?.max_seats           ?? 20,
    max_seats_per_booking: event?.max_seats_per_booking ?? 2,
    payment_required:      event?.payment_required    || false,
    cost:                  event?.cost                || "",
    is_public:             event?.is_public           !== false,
    show_attendee_names:   event?.show_attendee_names !== false,
    has_bus:               event?.has_bus             || false,
    bus_max_seats:         event?.bus_max_seats       ?? "",
    location_type:         event?.location_type       || "onsite",
    location:              event?.location            || "",
    location_id:           event?.location_id         || null,
    has_dining:            event?.has_dining          || false,
    menu_type:             event?.menu_type           || null,
    menu_text:             event?.menu_text           || "",
    reservation_cutoff:    cutoffToInputValue(event?.reservation_cutoff),
    payment_due_by:        event?.payment_due_by || "",
    allow_nonresident_guests: event ? !!event.allow_nonresident_guests : true, // new events default to "Anyone" (2026-07-25)
    require_attendee_names: !!event?.require_attendee_names,
    allow_unassigned_seats: !!event?.allow_unassigned_seats,
    unassigned_seats_count: event?.unassigned_seats_count ?? 0,
  })

  // The chosen room's own record. `bookable` decides whether an end time is
  // required and whether this event is clash-checked — it is a property of the
  // room now, not a regex on its name (migration 071).
  const selectedLocation = allLocations.find(l => l.id === form.location_id) || null

  const [coordinators, setCoordinators] = useState([])
  const [busDriver,    setBusDriver]    = useState(null)
  const [ecError,      setEcError]      = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState(null)
  const [cancelling,   setCancelling]   = useState(false)
  // Mandatory-field tracking (Iain, 2026-08-04): computed fresh on every
  // render from the current form state -- not gated behind a Save click --
  // so a field lights up (or clears) the instant its value changes, same as
  // Title/Date already behaved before this fix existed. Drives both the ⚠
  // highlight (lib/formValidation.js) and which field Save scrolls to.
  // FIELD_ORDER is screen order, not the order these checks happen to run
  // in below (Time used to have no check at all -- Iain, 2026-08-04).
  const fieldRefs = useRef({})
  const FIELD_ORDER = ["title", "event_date", "event_time", "location", "event_end_time", "coordinators"]
  const FIELD_MESSAGES = {
    title: "Title is required",
    event_date: "Date is required",
    event_time: "Time is required",
    location: "Please choose a venue",
    event_end_time: "An end time is required for events in a common space",
    coordinators: "At least one coordinator is required",
  }
  function computeInvalidFields() {
    const invalid = []
    if (!form.title.trim()) invalid.push("title")
    if (!form.event_date) invalid.push("event_date")
    if (!form.event_time) invalid.push("event_time")
    const venueMissing = form.location_type === "onsite" ? !form.location_id : !form.location.trim()
    if (venueMissing) invalid.push("location")
    if (needsSpaceValidation({ location_type: form.location_type, bookable: selectedLocation?.bookable }) && !form.event_end_time) invalid.push("event_end_time")
    if (!coordinators.length) invalid.push("coordinators")
    return invalid
  }
  const invalidFields = computeInvalidFields()
  const { ask: askSameDate, Modal: SameDateModal } = useSameDateWarning()
  const { ask: askRequestOnly, Modal: RequestOnlyModal } = useRequestOnlyAcknowledge()
  const [createdId,    setCreatedId]    = useState(null)
  const [justCreated,  setJustCreated]  = useState(false)
  const [uploadingMenu, setUploadingMenu] = useState(false)
  const [localMenuUrl,      setLocalMenuUrl]      = useState(event?.menu_url || null)
  const [localMenuFileName, setLocalMenuFileName] = useState(event?.menu_file_name || null)
  const activeId = event?.id || createdId

  useEffect(() => {
    if (!editing) return
    supabase
      .from("event_coordinators")
      .select("member_id, members!member_id(id, name, username)")
      .eq("event_id", event.id).is("replaced_at", null).order("assigned_at")
      .then(({ data }) => setCoordinators((data || []).map(r => r.members)))

    if (event.bus_driver_id) {
      supabase.from("members").select("id, name, username")
        .eq("id", event.bus_driver_id).single()
        .then(({ data }) => setBusDriver(data || null))
    }
  }, [editing])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    setError(null); setEcError(null)
    // Check every mandatory field up front (not one-at-a-time) so Save can
    // report AND jump to the first incomplete one in visual form order --
    // previously this returned on the first failing check in validation
    // order, which happened to line up with screen order for title/date but
    // not once venue and coordinators were added, and never enforced venue
    // at all (Iain found this live, 2026-08-04: toggling On-site/Off-site
    // with no room picked saved fine).
    if (invalidFields.length) {
      const first = invalidFields[0]
      if (first === "coordinators") setEcError(FIELD_MESSAGES[first])
      else setError(FIELD_MESSAGES[first])
      scrollToFirstInvalid(fieldRefs, FIELD_ORDER, invalidFields)
      return
    }

    // Space hard block (B) checked FIRST -- if the space is unavailable
    // that's the only message, never a soft warning clicked through just to
    // get rejected on save. Same-date soft warning (A) only shows when
    // there's no hard conflict.
    try {
      const pre = await fetch("/api/events/precheck", {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (await getAuthToken()) },
        body: JSON.stringify({
          event_date: form.event_date, event_time: form.event_time, event_end_time: form.event_end_time,
          location_type: form.location_type, location_id: form.location_id, exclude_event_id: activeId || null,
        }),
      }).then(r => r.json()).catch(() => ({}))
      if (pre.spaceConflict) {
        setError(pre.spaceConflict.message)
        scrollToFirstInvalid(fieldRefs, FIELD_ORDER, ["location"])
        return
      }
      if (pre.sameDateEvents?.length) {
        if (!(await askSameDate(pre.sameDateEvents))) return
      }
    } catch {}

    setSaving(true)
    const payload = {
      ...form,
      cost:                  form.payment_required ? Number(form.cost) : 0,
      max_seats:             Number(form.max_seats),
      max_seats_per_booking: Number(form.max_seats_per_booking),
      coordinator_ids:       coordinators.map(m => m.id),
      bus_driver_id:         form.has_bus ? busDriver?.id || null : null,
      bus_max_seats:         form.has_bus && form.bus_max_seats !== "" ? Number(form.bus_max_seats) : null,
      has_dining:            form.has_dining,
      menu_type:             form.has_dining ? form.menu_type : null,
      menu_text:             form.has_dining && form.menu_type === "text" ? form.menu_text : null,
      reservation_cutoff:    cutoffFromInputValue(form.reservation_cutoff),
      payment_due_by:        form.payment_required ? (form.payment_due_by || null) : null,
      allow_nonresident_guests: Number(form.max_seats_per_booking) > 1 ? !!form.allow_nonresident_guests : false,
      require_attendee_names: Number(form.max_seats_per_booking) > 1 ? !!form.require_attendee_names : false,
    }
    if (activeId) payload.id = activeId

    const res = await fetch("/api/special-events", {
      method:  activeId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (await getAuthToken()) },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || "Save failed"); return }
    onSaved()
    // "Request Only" (Iain, 2026-08-04): a toast auto-dismissed and was
    // still too easy to miss -- forces an explicit OK click instead, on
    // top of the bell notification. Uses the venue the form already has in
    // hand rather than a second round trip.
    if (selectedLocation?.request_only) {
      await askRequestOnly(selectedLocation.name)
    }
    if (!activeId) {
      // First-time create: keep the form open so the coordinator can add a photo /
      // upload a menu file straight away, using the id we just got back.
      setCreatedId(data.id)
      setJustCreated(true)
      return
    }
    onClose()
  }

  // Cancel Event -- Social had no way to remove an event at all (Iain,
  // 2026-08-04: "not sure how after all this time it isn't possible to
  // delete an event" -- confirmed in code, genuinely missing). Same
  // soft-archive-and-notify pattern Movies (screenings DELETE) and Clubs &
  // Groups (cancelSoloEvent/removeOccurrence) already use -- never a hard
  // delete, since that would cascade away booking/payment history.
  async function cancelEvent() {
    if (!activeId) return
    if (!confirm("Cancel this event? Anyone booked will be notified. This can't be undone.")) return
    setCancelling(true)
    try {
      const res = await fetch("/api/special-events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (await getAuthToken()) },
        body: JSON.stringify({ id: activeId, action: "cancel" }),
      })
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.error || "Could not cancel this event."); setCancelling(false); return }
      onSaved()
      onClose()
    } catch {
      setError("Could not cancel this event.")
      setCancelling(false)
    }
  }

  async function getToken() { return session.access_token }

  // Uploads straight to Supabase Storage via a signed upload URL rather
  // than routing the file bytes through our own API route -- a raw
  // multipart POST used to hand the whole file to our Vercel function,
  // which silently 413s on any request body over Vercel's hard 4.5MB
  // limit, and this call had no error handling at all around it, so a
  // file over that ceiling left "Uploading..." spinning forever with no
  // feedback (BUG-040, reported on a 4.66MB event flyer PDF). The
  // "event-menus" Storage bucket itself allows up to 10MB, confirmed
  // directly -- the real ceiling was Vercel's function body limit, not
  // anything Storage- or app-imposed, so bypassing our own function for
  // the actual bytes removes it. try/catch/finally now guarantees the
  // spinner always clears and a real error always shows, regardless of
  // failure mode.
  async function uploadMenuFile(file) {
    setUploadingMenu(true)
    setError(null)
    try {
      const token = await getAuthToken()
      const signRes = await fetch("/api/events/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ event_id: activeId, action: "sign", file_name: file.name, content_type: file.type }),
      })
      const signData = await signRes.json().catch(() => ({}))
      if (!signRes.ok) throw new Error(signData.error || "Could not prepare the upload")

      const { error: upErr } = await supabase.storage
        .from("event-menus")
        .uploadToSignedUrl(signData.path, signData.token, file, { contentType: file.type })
      if (upErr) throw new Error(upErr.message || "Upload failed")

      const completeRes = await fetch("/api/events/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ event_id: activeId, action: "complete", path: signData.path, file_name: file.name }),
      })
      const d = await completeRes.json().catch(() => ({}))
      if (!completeRes.ok) throw new Error(d.error || "Could not save the uploaded menu")
      setLocalMenuUrl(d.menu_url)
      setLocalMenuFileName(d.menu_file_name)
    } catch (err) {
      setError(err.message || "Menu upload failed")
    } finally {
      setUploadingMenu(false)
    }
  }

  async function removeMenuFile() {
    setUploadingMenu(true)
    setError(null)
    try {
      const res = await fetch("/api/events/menu", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await getAuthToken()) },
        body: JSON.stringify({ event_id: activeId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || "Could not remove the menu")
      setLocalMenuUrl(null)
      setLocalMenuFileName(null)
    } catch (err) {
      setError(err.message || "Could not remove the menu")
    } finally {
      setUploadingMenu(false)
    }
  }

  return (
    <>
      {SameDateModal}
      {RequestOnlyModal}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 400 }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(440px, 100%)", background: "var(--surface)",
        zIndex: 401, overflowY: "auto", paddingBottom: 32,
        boxShadow: "-8px 0 32px rgba(0,0,0,0.15)",
      }}>
        <div style={{ height: 5, background: "var(--special)" }} />
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)",
          position: "sticky", top: 0, background: "var(--surface)", zIndex: 1,
        }}>
          <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--special)" }}>
            {editing ? "Edit Event" : "New Special Event"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "var(--text-dim)" }}>×</button>
        </div>

        <div style={{ padding: "1.25rem 1.25rem 2rem" }}>

          {/* Title */}
          <div ref={el => (fieldRefs.current.title = el)} style={FIELD}>
            <label style={LABEL}>Event Name <span style={{ color: "var(--danger)" }}>*</span>
              {invalidFields.includes("title") && <span style={{ color: "#dc2626", fontWeight: 800, marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>⚠ Required</span>}
            </label>
            <input value={form.title} onChange={e => set("title", e.target.value)}
              placeholder="e.g. Wine & Cheese Evening"
              style={{ ...INPUT, ...(invalidFields.includes("title") ? INVALID_FIELD_STYLE : { border: "1.5px solid var(--green)" }) }} />
          </div>


          {/* Date + Time */}
          <div style={{ ...FIELD, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div ref={el => (fieldRefs.current.event_date = el)}>
              <label style={LABEL}>Date <span style={{ color: "var(--danger)" }}>*</span>
                {invalidFields.includes("event_date") && <span style={{ color: "#dc2626", fontWeight: 800, marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>⚠ Required</span>}
              </label>
              <input type="date" value={form.event_date}
                onChange={e => set("event_date", e.target.value)}
                onClick={e => e.currentTarget.showPicker?.()}
                style={{ ...INPUT, ...(invalidFields.includes("event_date") ? INVALID_FIELD_STYLE : { border: "1.5px solid var(--green)" }) }} />
              {form.event_date && (
                <div style={{ fontSize: "0.75rem", color: "var(--special)", fontWeight: 600, marginTop: "0.3rem" }}>
                  {localDate(form.event_date)?.toLocaleDateString("en-AU", { weekday: "long" })}
                </div>
              )}
            </div>
            <div ref={el => (fieldRefs.current.event_time = el)}>
              <label style={LABEL}>Time <span style={{ color: "var(--danger)" }}>*</span>
                {invalidFields.includes("event_time") && <span style={{ color: "#dc2626", fontWeight: 800, marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>⚠ Required</span>}
              </label>
              <TimeField value={form.event_time} onChange={v => set("event_time", v)} invalid={invalidFields.includes("event_time")} />
            </div>
          </div>


          {/* Location */}
          <div ref={el => (fieldRefs.current.location = el)}>
            <LocationField
              locationType={form.location_type}
              location={form.location}
              locationId={form.location_id}
              onTypeChange={v => set("location_type", v)}
              onLocationChange={v => set("location", v)}
              onLocationIdChange={v => set("location_id", v)}
              invalid={invalidFields.includes("location")}
            />
          </div>


          {/* End time -- required for onsite events in a real common space (not
              "Resident's Home"), needed to keep the space-clash check working
              (Iain, 2026-07-23). */}
          {needsSpaceValidation({ location_type: form.location_type, bookable: selectedLocation?.bookable }) && (
            <div ref={el => (fieldRefs.current.event_end_time = el)} style={FIELD}>
              <label style={LABEL}>Ends <span style={{ color: "var(--danger)" }}>*</span>
                {invalidFields.includes("event_end_time") && <span style={{ color: "#dc2626", fontWeight: 800, marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>⚠ Required</span>}
              </label>
              <TimeField value={form.event_end_time} onChange={v => set("event_end_time", v)} invalid={invalidFields.includes("event_end_time")} minHour={form.event_time ? Number(form.event_time.split(":")[0]) : null} />
              <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "0.3rem" }}>Lets the app stop this space being double-booked by another event.</div>
            </div>
          )}


          {/* Description */}
          <div style={FIELD}>
            <label style={LABEL}>Description</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)}
              rows={3} placeholder="Details about the event…"
              style={{ ...INPUT, resize: "vertical" }} />
          </div>


          {/* Welcome message */}
          <div style={FIELD}>
            <label style={LABEL}>Booking Message <span style={{ color: "var(--text-dim)", fontSize: "0.78rem", fontWeight: 400 }}>(shown on booking form only)</span></label>
            <textarea value={form.welcome_message} onChange={e => set("welcome_message", e.target.value)}
              rows={2} placeholder="Optional greeting shown when residents open the booking…"
              style={{ ...INPUT, resize: "vertical" }} />
          </div>


          {/* Capacity */}
          <div style={{ ...FIELD, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={LABEL}>Total Seats</label>
              <input type="number" min={1} max={500} value={form.max_seats}
                onChange={e => set("max_seats", e.target.value)}
                onWheel={e => e.currentTarget.blur()} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Max per Booking</label>
              <input type="number" min={1} max={10} value={form.max_seats_per_booking}
                onChange={e => set("max_seats_per_booking", e.target.value)}
                onWheel={e => e.currentTarget.blur()} style={INPUT} />
            </div>
          </div>

          {Number(form.max_seats_per_booking) > 1 && (
            <div style={FIELD}>
              <AttendeeNamingPicker
                allowGuests={form.allow_nonresident_guests}
                onAllowGuestsChange={v => set("allow_nonresident_guests", v)}
                required={form.require_attendee_names}
                onRequiredChange={v => set("require_attendee_names", v)}
                colour="var(--special, #db2777)"
              />
            </div>
          )}

          {/* Unassigned seats (Iain, 2026-09-04, revised same day): a
              headcount an EC/admin can add to this event without tying it
              to a resident or contact -- no booking row at all, purely
              subtracted from capacity. Originally a raw number typed here;
              Iain's follow-up feedback ("I cannot see an option for this
              anywhere... additive, so they do not need to keep increasing
              a count") moved the actual adding/naming into the event's own
              Attendees panel (+ Add Unassigned Seats, admin/EC only, see
              components/EventSlideOut.js) -- this toggle now only turns
              the feature on for the event; the count itself is read-only
              here, managed from that panel once the event exists. */}
          <div style={FIELD}>
            <Toggle value={form.allow_unassigned_seats}
              onChange={v => set("allow_unassigned_seats", v)}
              label="Allow unassigned seats" />
            <p style={{ color: "var(--text-dim)", fontSize: "0.78rem", margin: "0.3rem 0 0" }}>
              Lets an Event Coordinator or admin add seats to this event&apos;s headcount
              without tying them to a resident or contact — e.g. walk-ins who never book.
              {activeId
                ? " Add and name them from the Attendees panel once this event is saved."
                : " You'll be able to add them from the Attendees panel once you've created the event."}
            </p>
          </div>
          {form.allow_unassigned_seats && activeId && (
            <div style={FIELD}>
              <label style={LABEL}>Unassigned seats so far</label>
              <div style={{ ...INPUT, display: "flex", alignItems: "center", color: "var(--text-dim)" }}>
                {form.unassigned_seats_count || 0} — manage from the Attendees panel
              </div>
            </div>
          )}


          {/* Paid */}
          <div style={FIELD}>
            <Toggle value={form.payment_required} onChange={v => set("payment_required", v)} label="Paid event" />
          </div>
          {form.payment_required && (
            <>
            <div style={{ ...FIELD, marginTop: "-0.5rem" }}>
              <label style={LABEL}>Cost per person ($)</label>
              <input type="number" min={0} step={1} value={form.cost}
                onChange={e => set("cost", e.target.value)}
                onWheel={e => e.currentTarget.blur()}
                placeholder="e.g. 25" style={INPUT} />
            </div>
            <div style={FIELD}>
              <label style={LABEL}>Payment due by <span style={{ color: "var(--text-dim)", fontSize: "0.78rem", fontWeight: 400 }}>(optional)</span></label>
              <input type="date" value={form.payment_due_by}
                onChange={e => set("payment_due_by", e.target.value)} style={INPUT} />
              <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: "0.35rem" }}>
                Residents see this at booking. Anyone still unpaid on this day gets an automatic reminder. Their seat is kept either way.
              </div>
            </div>
            </>
          )}


          {/* Menu/Additional Info (was "Dining Option" -- Iain, 2026-09-03 round-5: "the concept of Dining option is now broader") */}
          <div style={FIELD}>
            <Toggle value={form.has_dining} onChange={v => set("has_dining", v)} label="Menu/Additional Info" />
          </div>
          {form.has_dining && (
            <div style={{ ...FIELD, marginTop: "-0.5rem" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <button type="button" onClick={() => set("menu_type", "text")} style={{
                  flex: 1, padding: "8px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  border: `1px solid ${form.menu_type === "text" ? "var(--special)" : "var(--border)"}`,
                  background: form.menu_type === "text" ? "var(--special)15" : "var(--surface)",
                  color: form.menu_type === "text" ? "var(--special)" : "var(--text)",
                }}>Type it in</button>
                <button type="button" onClick={() => set("menu_type", "file")} style={{
                  flex: 1, padding: "8px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  border: `1px solid ${form.menu_type === "file" ? "var(--special)" : "var(--border)"}`,
                  background: form.menu_type === "file" ? "var(--special)15" : "var(--surface)",
                  color: form.menu_type === "file" ? "var(--special)" : "var(--text)",
                }}>Attach a File</button>
              </div>

              {form.menu_type === "text" && (
                <RichEditor
                  initialValue={form.menu_text}
                  hubColour="var(--special)"
                  bg="card"
                  onChange={html => set("menu_text", html)}
                  placeholder="Type the menu shown to residents…"
                />
              )}

              {form.menu_type === "file" && (
                activeId ? (
                  <div>
                    {localMenuUrl && (
                      <div style={{
                        display: "flex", alignItems: "center", background: "var(--surface2)",
                        borderRadius: 8, padding: "8px 10px", marginBottom: 8, fontSize: 13,
                      }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📄 {localMenuFileName || "Menu"}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <label style={{
                        flex: 1, padding: "8px", borderRadius: 8, border: "1px solid var(--special)",
                        color: "var(--special)", fontWeight: 700, fontSize: 13, cursor: uploadingMenu ? "not-allowed" : "pointer",
                        textAlign: "center", opacity: uploadingMenu ? 0.6 : 1, fontFamily: "inherit",
                      }}>
                        {uploadingMenu ? "Uploading…" : localMenuUrl ? "Replace" : "Upload Menu/Additional Info"}
                        <input
                          type="file"
                          accept="application/pdf,image/jpeg,image/png,image/webp"
                          style={{ display: "none" }}
                          disabled={uploadingMenu}
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadMenuFile(f) }}
                        />
                      </label>
                      {localMenuUrl && (
                        <button type="button" onClick={removeMenuFile} disabled={uploadingMenu} style={{
                          padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)",
                          background: "var(--surface2)", color: "var(--danger)", fontWeight: 700,
                          fontSize: 13, cursor: uploadingMenu ? "not-allowed" : "pointer", fontFamily: "inherit",
                        }}>Remove</button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--text-dim)", fontStyle: "italic" }}>
                    Tap "{editing ? "Save Changes" : "Create Event"}" below first — you'll be able to upload the menu document right after.
                  </div>
                )
              )}
            </div>
          )}


          {/* Bus — only relevant for offsite events */}
          {form.location_type === "offsite" && (
            <>
              <div style={FIELD}>
                <Toggle value={form.has_bus} onChange={v => { set("has_bus", v); if (!v) setBusDriver(null) }} label="Community bus" />
              </div>
              {form.has_bus && (
                <div style={{ ...FIELD, marginTop: "-0.5rem" }}>
                  <label style={LABEL}>Bus Driver (optional)</label>
                  <MemberPicker members={members} value={busDriver} onChange={setBusDriver}
                    placeholder="Search for bus driver…"
                    excludeIds={coordinators.map(m => m.id)} />
                </div>
              )}
              {form.has_bus && (
                <div style={{ ...FIELD, marginTop: "-0.5rem" }}>
                  <label style={LABEL}>Bus max seats <span style={{ color: "var(--text-dim)", fontSize: "0.78rem", fontWeight: 400 }}>(optional — blank = uncapped)</span></label>
                  <input type="number" min="0" value={form.bus_max_seats}
                    onChange={e => set("bus_max_seats", e.target.value)} style={INPUT} placeholder="Uncapped" />
                </div>
              )}
            </>
          )}


          {/* Booking cut-off */}
          <div style={FIELD}>
            <label style={LABEL}>Bookings close <span style={{ color: "var(--text-dim)", fontSize: "0.78rem", fontWeight: 400 }}>(optional)</span></label>
            <input type="datetime-local" value={form.reservation_cutoff}
              onChange={e => set("reservation_cutoff", e.target.value)} style={INPUT} />
            <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: "0.35rem" }}>
              After this, residents see &ldquo;Bookings Closed&rdquo; instead of the booking button. Leave blank to keep bookings open until the event.
            </div>
          </div>


          {/* Public */}
          <div style={FIELD}>
            <Toggle value={form.is_public} onChange={v => set("is_public", v)} label="Visible on public calendar" />
          </div>


          {/* Show attendees */}
          <div style={FIELD}>
            <Toggle value={form.show_attendee_names} onChange={v => set("show_attendee_names", v)} label="Show attendee names" />
          </div>

          {/* Event Image */}
          <div style={FIELD}>
            <label style={LABEL}>Event Image</label>
            {activeId ? (
              <EventImagePicker
                eventId={activeId}
                imageUrl={event?.image_url}
                focalX={event?.image_focal_x}
                focalY={event?.image_focal_y}
                colour="var(--special)"
                getToken={getToken}
              />
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-dim)", fontStyle: "italic" }}>
                You'll be able to add a photo once you've created the event — it'll appear right here.
              </div>
            )}
          </div>


          {/* EC — mandatory */}
          <div ref={el => (fieldRefs.current.coordinators = el)} style={FIELD}>
            <label style={LABEL}>Event Coordinator(s) <span style={{ color: "var(--danger)" }}>*</span> — max 3
              {invalidFields.includes("coordinators") && <span style={{ color: "#dc2626", fontWeight: 800, marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>⚠ Required</span>}
            </label>
            <ECPicker members={members} value={coordinators} onChange={v => { setCoordinators(v); setEcError(null) }} valid={coordinators.length > 0} invalid={invalidFields.includes("coordinators")} />
            {ecError && <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: "0.25rem" }}>{ecError}</div>}
          </div>


          {justCreated && (
            <div style={{ fontSize: 13, color: "var(--green)", fontWeight: 600, marginBottom: "1rem" }}>
              ✓ Event created — add a photo or menu above if you'd like, then tap Done.
            </div>
          )}

          {error && <div style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: "1rem" }}>{error}</div>}

          {editing && (
            <div style={{ marginBottom: "1rem" }}>
              <button type="button" onClick={cancelEvent} disabled={cancelling || saving}
                style={{ width: "100%", padding: "0.6rem", borderRadius: 8, border: "1px solid #fca5a5",
                  background: "#fee2e2", color: "#991b1b", fontWeight: 700, fontSize: "0.8rem",
                  cursor: (cancelling || saving) ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                {cancelling ? "Cancelling…" : "Cancel this event"}
              </button>
            </div>
          )}

          <button onClick={save} disabled={saving} style={{
            width: "100%", padding: "0.9rem", background: "var(--special)",
            color: "#fff", border: "none", borderRadius: "12px",
            fontSize: "1rem", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1, fontFamily: "inherit",
          }}>
            {saving ? "Saving…" : activeId ? (editing ? "Save Changes" : "Done") : "Create Event"}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Event Card ────────────────────────────────────────────────────────────────
function EventCard({ event, coordinators, myBooking, isAdmin, onOpen, onEdit, onTogglePayment, togglingId, onCloseOutPayments, closingOut, onRemindPayment, remindingId, onToggleRefund, togglingRefundId }) {
  const { member } = useUser()
  const [showAttendees, setShowAttendees] = useState(false)
  // Inline "record a payment" mini-form (2026-08-11) -- replaces the old
  // blind Paid/Unpaid toggle. Marking someone paid now asks for the amount
  // actually received (pre-filled with what's owed) and an optional
  // comment, rather than firing the API the instant the switch is tapped --
  // that's the whole point of this scope (see the payments scope doc):
  // the EC's real input is an amount, not a binary flag. Reverting an
  // already-paid/partial booking back to unpaid is still a one-tap
  // correction with no form -- nothing to explain when undoing a mistake.
  const [recordingId, setRecordingId] = useState(null)
  const [recordAmount, setRecordAmount] = useState("")
  const [recordNote, setRecordNote] = useState("")
  // Confirm-before-wipe for "Reset to unpaid" (2026-08-11 hotfix) -- see the
  // bug this replaces, below.
  const [resetConfirmId, setResetConfirmId] = useState(null)
  const today     = new Date(); today.setHours(0, 0, 0, 0)
  const evDate    = localDate(event.event_date)
  const isPast    = evDate < today
  const daysUntil = Math.round((evDate - today) / 86400000)
  const daysLabel = isPast ? null : daysUntil === 0 ? "Today!" : daysUntil === 1 ? "Tomorrow" : `In ${daysUntil} days`

  const isConfirmed = myBooking?.status === "confirmed"
  const isWaitlist  = myBooking?.status === "waitlist"
  // Bug fixed 2026-08-21 (Iain): see BookingStrip below and lib/booking.js's
  // bookingsClosed(). canManagePayments (isAdmin || isEC, computed further
  // down) doubles as the Owner/EC/Admin bypass -- same permission shape,
  // no need for a second variable.
  const closed = bookingsClosed(event)

  // Own row always pinned to the top — consistent with the Coordinator View panel
  // and every other attendee list (Movies, Book Club) — then A-Z by name
  // (Iain, 2026-08-04), same as this app's other standing A-Z rule. Sorts on
  // the real underlying name/username regardless of what's actually shown
  // (masked entries all read "Resident"/"Guest" anyway, so their relative
  // order among themselves is invisible to the viewer either way).
  const attendeeName = b => b.member?.name || b.member?.username || b.contact?.name || ""
  const bySelfFirst = (a, b) => byOwnThenName(a.member_id === member?.id, b.member_id === member?.id, attendeeName(a), attendeeName(b))
  const confirmedBookings = (event.bookings?.filter(b => b.status === "confirmed") || []).sort(bySelfFirst)
  const waitlistBookings  = (event.bookings?.filter(b => b.status === "waitlist") || []).sort(bySelfFirst)
  // Cancelled-but-was-paid bookings, split by whether the refund's been
  // issued yet (2026-07-14) -- ported from Movies/Book Club's Coordinator
  // panel, which had this and Social never did. event.bookings already
  // includes cancelled rows (the nested select has no status filter);
  // confirmedBookings/waitlistBookings above just never looked at them.
  // Unified refund ledger (2026-08-11) -- covers a cancelled-and-was-paid
  // booking AND an overpayment refund still sitting on an ACTIVE booking
  // (that booking was never cancelled, the excess payment is what's owed
  // back). isRefundPending/isRefundIssued in lib/payments.js also
  // recognise the old payment_status='refunded' marker for backward
  // compatibility with rows written before this ledger existed.
  const refundPendingBookings = (event.bookings?.filter(isRefundPending) || []).sort(bySelfFirst)
  const refundIssuedBookings  = (event.bookings?.filter(b => b.status === "cancelled" && isRefundIssued(b)) || []).sort(bySelfFirst)
  // Unassigned seats (2026-09-04) count toward "booked" for capacity/
  // display purposes exactly like a named booking's seats do -- they're
  // just not tied to a booking row. See buildEventPayload in
  // app/api/special-events/route.js and the shared server-side subtraction
  // in lib/modifyBooking.js / lib/promoteWaitlist.js / app/api/bookings and
  // app/api/coordinator for the matching capacity-math side of this.
  const booked  = confirmedBookings.reduce((s, b) => s + (b.seats || 1), 0) + (event.unassigned_seats_count || 0)
  const waiting = waitlistBookings.length
  const showNames = event.show_attendee_names !== false
  // Named additional attendees (workstream A), grouped by the booker.
  const partyByOwner = {}
  for (const p of event.booking_attendees || []) {
    // Composite key: a walk-up booking's party is owned by a contact
    // (owner_contact_id), not a member (owner_id) -- migration 061, 2026-07-23.
    const ownerKey = p.owner_id ? `m:${p.owner_id}` : `c:${p.owner_contact_id}`
    ;(partyByOwner[ownerKey] = partyByOwner[ownerKey] || []).push(p)
  }
  const busSeats = event.has_bus
    ? busSeatsUsed({ bookings: confirmedBookings, attendees: event.booking_attendees || [] })
    : 0
  const unpaidSeats = sumUnpaidSeats(confirmedBookings, event)
  const ecNames = coordinators.map(c => c.members?.name || c.members?.username).filter(Boolean)
  // Matches the canManageBooks convention used everywhere else (Book Club,
  // Movies, EventSlideOut's own privacy gating) -- admin OR this event's
  // own coordinator, not admin-only.
  const isEC = coordinators.some(c => c.member_id === member?.id)
  const canManagePayments = isAdmin || isEC
  const isPaidEvent = !!(event.payment_required && event.cost > 0)
  const summary = canManagePayments && isPaidEvent ? paymentSummary(confirmedBookings, event, refundPendingBookings) : null
  // Has anything happened since the last "Reconciled"/"Last reviewed" pass?
  // (2026-07-14, Iain) -- today this only catches new bookings added after
  // that stamp (bookings.updated_at doesn't exist yet -- migration 040 --
  // so this falls back to booked_at, which can't see a plain cancellation
  // that happened after reconciliation). Will automatically start catching
  // cancellations/payment changes too once that migration lands and the
  // select picks up updated_at -- no further code change needed here then.
  const isStale = canManagePayments && isPaidEvent && reconciliationIsStale(event, event.bookings)

  const blocked = closed && !isConfirmed && !isWaitlist && !canManagePayments

  return (
    <div onClick={blocked ? undefined : onOpen} style={{
      background: "var(--surface)", borderRadius: "14px",
      border: "1px solid var(--border)", overflow: "hidden",
      opacity: isPast ? 0.65 : 1, cursor: blocked ? "default" : "pointer",
    }}>
      {event.image_url && (
        <img
          src={event.image_url}
          alt={event.title}
          style={{ width: "100%", height: 140, objectFit: "cover", display: "block", objectPosition: `${event.image_focal_x ?? 50}% ${event.image_focal_y ?? 50}%` }}
        />
      )}
      <div style={{ padding: "0.9rem 1rem" }}>
        {/* Title + badges */}
        {/* Accessibility fix (2026-08-31): flexWrap + title ellipsis so a
            long event title can't push the status pill/Edit button past the
            visible area -- app/globals.css's html{overflow-x:hidden} means
            that overflow isn't scrollable, it's just invisible. Same root
            cause as the confirmed ClubHome.js Edit-button bug. */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.35rem" }}>
          <div style={{ fontWeight: 700, fontSize: "1rem", lineHeight: 1.2, flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.title}</div>
          <div style={{ display: "flex", flexWrap: "wrap", flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: "0.4rem", flexShrink: 0 }}>
            {/* Status pill sits to the left of Edit on the same row (or alone,
                right-aligned, when Edit isn't shown) — it used to stack in its
                own column below Edit, wasting a line on every card. */}
            {isConfirmed && (() => {
              const badge = bookingStatusBadge(myBooking, event)
              return (
                <span style={{
                  background: badge.bg, color: badge.color,
                  borderRadius: "20px", padding: "0.2rem 0.55rem",
                  fontSize: "0.7rem", fontWeight: 700, whiteSpace: "nowrap",
                }}>{badge.label === "Confirmed" ? `✓ ${badge.label}` : badge.label}</span>
              )
            })()}
            {isWaitlist && (
              <span style={{ background: "#f1f5f9", color: "#64748b", borderRadius: "20px", padding: "0.2rem 0.55rem", fontSize: "0.7rem", fontWeight: 700, whiteSpace: "nowrap" }}>Waitlisted</span>
            )}
            {daysLabel && !isConfirmed && !isWaitlist && (
              <span style={{ background: "var(--special)18", color: "var(--special)", borderRadius: "20px", padding: "0.2rem 0.55rem", fontSize: "0.7rem", fontWeight: 700, whiteSpace: "nowrap" }}>{daysLabel}</span>
            )}
            {(isAdmin || isEC) && (
              <button onClick={e => { e.stopPropagation(); onEdit() }} style={{
                background: "var(--surface2)", border: "1px solid var(--border)",
                borderRadius: "8px", padding: "0.2rem 0.6rem",
                fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
                color: "var(--text-dim)", fontFamily: "inherit", flexShrink: 0,
              }}>Edit</button>
            )}
          </div>
        </div>

        {/* Date + time (with weekday) */}
        <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginBottom: "0.2rem" }}>
          {fmtDate(event.event_date)}{event.event_time ? ` · ${fmtTime(event.event_time)}` : ""}
        </div>

        {/* Location */}
        {event.location && (
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.2rem" }}>
            📍 {event.location_type === "offsite" ? event.location.split("\n")[0] : event.location}
          </div>
        )}

        {/* EC names — the names are the ask-a-question trigger for this event */}
        <EventCoordinators eventId={event.id} eventTitle={event.title} names={ecNames}
          colour="var(--special)" style={{ marginBottom: "0.2rem" }} />

        {/* Bus driver */}
        {event.has_bus && event.bus_driver && (
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.2rem", display: "flex", alignItems: "center", gap: 5 }}>
            <BusIcon size={14} /> <span>{event.bus_driver.name || event.bus_driver.username}</span>
          </div>
        )}

        {/* Cost pill */}
        {event.payment_required && event.cost > 0 && (
          <div style={{
            display: "inline-block", marginBottom: "0.4rem",
            fontSize: "0.72rem", fontWeight: 700,
            color: "var(--amber-dark)", borderRadius: "20px",
            padding: "0.15rem 0.55rem", border: "1px solid var(--amber)",
          }}>${Number(event.cost).toFixed(0)} per person</div>
        )}

        {/* Unassigned seats note -- EC/admin visibility only, since it's
            their own headcount to manage, not something a resident booking
            a seat needs to see. */}
        {canManagePayments && event.allow_unassigned_seats && event.unassigned_seats_count > 0 && (
          <div style={{
            display: "inline-block", marginLeft: "0.4rem", marginBottom: "0.4rem",
            fontSize: "0.72rem", fontWeight: 700,
            color: "var(--special)", borderRadius: "20px",
            padding: "0.15rem 0.55rem", border: "1px solid var(--special)",
          }}>{event.unassigned_seats_count} unassigned seat{event.unassigned_seats_count === 1 ? "" : "s"}</div>
        )}

        {/* Description */}
        {event.description && (
          <div style={{ marginBottom: "0.5rem" }}>
            <ExpandableText
              text={bbToHtml(event.description, "var(--special)")}
              html
              fontSize={13}
              lineHeight={1.5}
              maxLines={2}
              colour="var(--special)"
            />
          </div>
        )}

        <CapacityBar booked={booked} max={event.max_seats} waitlist={waiting} />
      </div>
      {/* Booking status strip — always visible */}
      <BookingStrip myBooking={myBooking} event={event} isFull={booked >= event.max_seats && event.max_seats > 0} closed={closed} blocked={blocked} />

      {/* Attendees accordion */}
      {event.max_seats > 0 && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface2)" }}>
          <button onClick={e => { e.stopPropagation(); setShowAttendees(v => !v) }}
            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 1rem", background: "none", border: "none", cursor: "pointer", fontSize: "0.75rem", color: "var(--text-dim)", fontFamily: "inherit" }}>
            <span>
              <strong style={{ color: "var(--text)" }}>{booked} seat{booked !== 1 ? "s" : ""}</strong>
              <span style={{ marginLeft: "0.4rem" }}>of {event.max_seats}</span>
              {isAdmin && unpaidSeats > 0 && <span style={{ color: "var(--amber-dark)", marginLeft: "0.4rem" }}>({unpaidSeats} unpaid)</span>}
              {isAdmin && waiting > 0 && <span style={{ color: "var(--amber-dark)", marginLeft: "0.4rem" }}>· {waiting} waitlist</span>}
              {event.has_bus && <span style={{ color: "var(--text-dim)", marginLeft: "0.4rem" }}>· 🚌 {busSeats}{event.bus_max_seats != null ? `/${event.bus_max_seats}` : ""}</span>}
            </span>
            <span style={{ fontSize: "0.65rem", color: "var(--teal)" }}>{showAttendees ? "▲ Hide" : "▼ Attendees"}</span>
          </button>
          {showAttendees && (
            <div style={{ padding: "0 1rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              {summary && (
                <div onClick={e => e.stopPropagation()} style={{
                  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
                  padding: "0.6rem 0.7rem", marginBottom: "0.6rem", fontSize: "0.75rem",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.4rem", marginBottom: event.payments_reconciled_at || summary.unpaidCount > 0 || summary.refundsDueCount > 0 ? "0.5rem" : 0 }}>
                    <span style={{ color: "var(--text-dim)" }}>Expected <strong style={{ color: "var(--text)" }}>${summary.expectedTotal.toFixed(2)}</strong></span>
                    <span style={{ color: "var(--text-dim)" }}>Collected <strong style={{ color: "var(--green)" }}>${summary.collectedTotal.toFixed(2)}</strong></span>
                    <span style={{ color: "var(--text-dim)" }}>Outstanding <strong style={{ color: summary.outstandingTotal > 0 ? "var(--amber-dark)" : "var(--text)" }}>${summary.outstandingTotal.toFixed(2)}</strong></span>
                    {summary.refundsDueCount > 0 && (
                      <span style={{ color: "var(--text-dim)" }}>Refunds due <strong style={{ color: "#92400e" }}>${summary.refundsDueTotal.toFixed(2)}</strong></span>
                    )}
                  </div>
                  {event.payments_reconciled_at && (
                    // Renamed from "Reconciled" (2026-07-14, Iain) -- Close Out
                    // is explicitly re-runnable, never a lock (see migration 037's
                    // own comment), so "Reconciled" implied a finality this
                    // never had. Turns amber + adds a plain-language flag when
                    // isStale (new bookings/cancellations since this stamp) so
                    // the same line that used to read as "all done" now reads
                    // as "here's when you last checked, and whether that's
                    // still current" instead.
                    <div style={{ fontSize: "0.68rem", color: isStale ? "var(--amber-dark)" : "var(--text-dim)", marginBottom: summary.unpaidCount > 0 ? "0.5rem" : 0 }}>
                      Last reviewed {fmtDate(event.payments_reconciled_at.slice(0, 10))}
                      {event.reconciled_by_member && ` by ${event.reconciled_by_member.name || event.reconciled_by_member.username}`}
                      {isStale && <strong> — new activity since, worth another look</strong>}
                    </div>
                  )}
                  {summary.submittedCount > 0 && (
                    <div style={{ fontSize: "0.68rem", color: "#0f766e", marginBottom: "0.5rem" }}>
                      🧾 {summary.submittedCount} of these marked payment submitted — check and confirm below
                    </div>
                  )}
                  {summary.partialCount > 0 && (
                    <div style={{ fontSize: "0.68rem", color: "#075985", marginBottom: "0.5rem" }}>
                      {summary.partialCount} partial payment{summary.partialCount !== 1 ? "s" : ""} (${summary.partialTotal.toFixed(2)} received so far) — still short of the full amount
                    </div>
                  )}
                  {summary.unpaidCount > 0 && (
                    <button
                      disabled={closingOut}
                      onClick={() => onCloseOutPayments(event.id)}
                      style={{
                        width: "100%", padding: "0.4rem", borderRadius: 8, border: "1px solid var(--amber)",
                        background: "var(--amber)15", color: "var(--amber-dark)", fontSize: "0.72rem", fontWeight: 700,
                        cursor: closingOut ? "default" : "pointer", fontFamily: "inherit", opacity: closingOut ? 0.6 : 1,
                      }}>{closingOut ? "Closing out…" : `Close Out — remind ${summary.unpaidCount} unpaid`}</button>
                  )}
                </div>
              )}
              {confirmedBookings.length > 0 ? (
                <>
                  {/* No "Confirmed" section header here (removed 2026-07-14,
                      Iain) -- it implied every row below had actually been
                      paid, which isn't true until payment is separately
                      collected, and green as a header colour reads as a
                      status/pass signal rather than a label. The list
                      below already carries its own per-row Paid/Unpaid
                      state, so a blanket "Confirmed" heading was actively
                      misleading, not just redundant. Waitlist still gets a
                      header (below) since it's the rarer, worth-flagging
                      case. */}
                  {confirmedBookings.map((b, i) => {
                    const isOwn     = b.member_id === member?.id
                    const isPrivate = !!b.member?.hide_name
                    // display_name (2026-08-14) rides ahead of the real name once
                    // unmasked -- masking itself (isPrivate && !isAdmin) is unchanged.
                    const label = isOwn ? "You"
                      : !showNames ? "Guest"
                      : b.member ? resolveMemberName(b.member, { canManage: isAdmin })
                      : (b.contact?.name || "Member")
                    const paid = computeIsPaid(b)
                    // Pass `event` through (2026-08-12, Iain -- Spring Ball 1):
                    // a self-report on top of an already-partial booking flips
                    // payment_status to 'submitted' for the new unconfirmed
                    // claim, but the EC-confirmed amount_paid underneath is
                    // still partial money -- see lib/payments.js's isPartial()
                    // comment. Without this the toggle/pill fell back to plain
                    // amber "Unpaid" the instant a resident submitted a
                    // balance, hiding the fact there was already money in.
                    const partial = computeIsPartial(b, event)
                    // No longer gated on !partial (2026-08-12) -- the two can
                    // now genuinely coexist (confirmed partial amount + a new
                    // unconfirmed claim sitting on top of it), and an EC should
                    // see both: the amount already on file AND that there's a
                    // fresh submission waiting on their review.
                    const submitted = !paid && computeIsSubmitted(b)
                    const owed = seatsCost(event, b.seats || 1)
                    // Balance-based (2026-08-11 follow-up, Iain -- Spring
                    // Ball) -- the record form's amount input is what the
                    // EC is recording IN THIS transaction, added to
                    // whatever's already on file, so it should default to
                    // the actual $ still owing, not the full amount (which
                    // on a Partial booking would double-count the $30
                    // already in) or the amount already paid (which would
                    // record it a second time).
                    const balanceNum = remainingBalance(b, event, b.seats || 1)
                    const isRecording = recordingId === b.id
                    return (
                      <div key={i} style={{ padding: "0.2rem 0", borderBottom: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", gap: "0.5rem" }}>
                        <span style={{ fontWeight: isOwn ? 700 : 400, color: isOwn ? "var(--special)" : "var(--text)", minWidth: 0, flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {label}
                          {isPrivate && isAdmin && !isOwn && <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-dim)", marginLeft: 4 }}>(P)</span>}
                          {b.bus_passenger && <BusIcon style={{ width: 12, height: 12, marginLeft: 4, verticalAlign: "-1px", opacity: 0.75 }} />}
                        </span>
                        <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                          {canManagePayments && submitted && (
                            <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#0f766e", background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 8, padding: "0.05rem 0.35rem" }}>🧾 Submitted</span>
                          )}
                          {/* "Partial" $-amount pill removed (2026-08-12, Iain --
                              Spring Ball 2 live review): on a row that's ALSO showing
                              the "Submitted" pill, the two together pushed the
                              attendee's name off to the side / wrapped awkwardly --
                              one pill too many for this row's width. The blue toggle
                              track colour + "$X of $Y paid" in the amount-entry form
                              (below, once opened) and the event-level Collected/
                              Outstanding summary above already carry this
                              information -- this pill was the only place showing it
                              unconditionally in the collapsed row, so removing it is
                              a pure declutter, not a loss of information. */}
                          <span style={{ color: "var(--text-dim)" }}>{b.seats || 1} seat{(b.seats||1) > 1 ? "s" : ""}</span>
                          {canManagePayments && isPaidEvent && !paid && (() => {
                            const reminding = remindingId === b.id
                            return (
                              <button
                                disabled={reminding}
                                onClick={e => { e.stopPropagation(); e.preventDefault(); onRemindPayment(event.id, b, label) }}
                                aria-label={`Remind ${label} to pay`}
                                title="Send payment reminder"
                                style={{
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  border: "none", background: "none", padding: "0.1rem 0.15rem",
                                  cursor: reminding ? "default" : "pointer", fontFamily: "inherit",
                                  flexShrink: 0, opacity: reminding ? 0.35 : 1, fontSize: "0.85rem", lineHeight: 1,
                                }}>
                                🔔
                              </button>
                            )
                          })()}
                          {canManagePayments && isPaidEvent && (() => {
                            const pending = togglingId === b.id
                            const isSettled = paid || partial
                            // Hotfix 2026-08-11 (real bug, live-caught: Iain marked
                            // Scampi paid at $25/$40 with a comment, then a second tap
                            // on this same switch -- previously an unconfirmed, instant
                            // "revert to unpaid" -- silently wiped amount_paid back to 0
                            // and dropped the booking back to Submitted, with no warning
                            // and no way to get back to editing the $25. The switch now
                            // ALWAYS opens the record-payment form, pre-filled with the
                            // CURRENT amount_paid when there is one (so correcting a
                            // partial payment starts from what's actually on file, not
                            // the full amount owed) -- "reset to unpaid" is now a
                            // separate, explicitly-confirmed action inside the form
                            // (below), matching how every other destructive action in
                            // this app requires a confirm step, not a bare toggle.
                            // Toggle POSITION now tracks `paid` only, not `isSettled`
                            // (2026-08-11 follow-up, Iain -- Spring Ball): a Partial
                            // booking isn't actually Paid yet, so the switch stays on
                            // the Unpaid side -- it's the TRACK COLOUR (blue) that
                            // signals "some money in", not the knob position. Only a
                            // truly Confirmed booking moves the knob across.
                            return (
                              <button
                                disabled={pending}
                                onClick={e => {
                                  e.stopPropagation(); e.preventDefault()
                                  setRecordingId(b.id)
                                  setRecordAmount(String(Math.round(balanceNum)))
                                  setRecordNote("")
                                  setResetConfirmId(null)
                                }}
                                role="switch" aria-checked={paid} aria-label={isSettled ? "Adjust recorded payment" : "Record a payment"}
                                style={{
                                  display: "flex", alignItems: "center", gap: 5,
                                  border: "none", background: "none", padding: "0.15rem 0.1rem",
                                  cursor: pending ? "default" : "pointer", fontFamily: "inherit",
                                  flexShrink: 0, opacity: pending ? 0.55 : 1,
                                }}>
                                {/* Toggle graphic with Unpaid/Paid labels flanking it, so it
                                    reads as an actionable switch rather than a status badge
                                    (Iain, 2026-07-12 -- the plain colour pill wasn't clearly
                                    tappable). */}
                                <span style={{ fontSize: "0.62rem", fontWeight: 700, color: partial ? "#0369a1" : !paid ? "var(--amber-dark)" : "var(--text-dim)" }}>Unpaid</span>
                                <span style={{
                                  width: 32, height: 18, borderRadius: 9, position: "relative", flexShrink: 0,
                                  background: paid ? "var(--green)" : partial ? "#0369a1" : "var(--amber)", transition: "background 0.15s",
                                }}>
                                  <span style={{
                                    position: "absolute", top: 2, left: paid ? 16 : 2,
                                    width: 14, height: 14, borderRadius: "50%", background: "#fff",
                                    transition: "left 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,.25)",
                                  }} />
                                </span>
                                <span style={{ fontSize: "0.62rem", fontWeight: 700, color: paid ? "var(--green)" : "var(--text-dim)" }}>Paid</span>
                              </button>
                            )
                          })()}
                        </span>
                        </div>
                        {/* Inline record-payment form (2026-08-11) -- amount
                            pre-filled with the full amount owed (editable down for
                            a short payment or up for an overpayment), comment
                            optional. The server derives Partial/Confirmed from the
                            amount -- this never sends a status directly. */}
                        {canManagePayments && isRecording && (() => {
                          // Balance-based comment rule (2026-08-11 follow-up,
                          // Iain -- Spring Ball): the amount typed here is
                          // ADDED to whatever's already on file (`b.amount_paid`),
                          // so "does this match what's owed" now means "does
                          // it exactly complete the outstanding balance", not
                          // "does it equal the full price" -- entering the
                          // full $10 balance on a $30-of-$40 booking should
                          // need no comment at all, it's just finishing the
                          // payment off.
                          const enteredAmt = recordAmount === "" ? null : (parseFloat(recordAmount) || 0)
                          const willComplete = enteredAmt !== null && Math.round(enteredAmt) === Math.round(balanceNum)
                          // 2026-08-24 fix (BUG-024): mirrors the identical
                          // fix in components/EventSlideOut.js's shared
                          // CoordinatorPanel -- Social keeps its own,
                          // separate copy of this payment-record panel (see
                          // project history), so the same disabled-styling/
                          // hover-tooltip/inline-warning fix has to be
                          // applied here too, or the two drift again.
                          const commentNeeded = !willComplete
                          const pending = togglingId === b.id
                          const saveBlocked = commentNeeded && !recordNote.trim()
                          const saveDisabled = pending || saveBlocked
                          return (
                          <div onClick={e => e.stopPropagation()} style={{ marginTop: "0.4rem", padding: "0.5rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>Amount received</span>
                              <input type="number" min="0" step="1" value={recordAmount} onChange={e => setRecordAmount(e.target.value)}
                                style={{ width: 90, padding: "0.3rem 0.5rem", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.8rem", boxSizing: "border-box", fontFamily: "inherit" }} />
                              <span style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>of {wholeDollar(balanceNum)} balance</span>
                            </div>
                            {partial && (
                              <div style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>Completes {owed} total</div>
                            )}
                            <textarea placeholder={willComplete ? "Comment (optional)" : "Comment (required — amount doesn't complete the balance owed)"}
                              value={recordNote} onChange={e => setRecordNote(e.target.value)} rows={2}
                              style={{ width: "100%", padding: "0.4rem 0.5rem", borderRadius: 8, border: `1px solid ${saveBlocked ? "var(--red, #dc2626)" : "var(--border)"}`, background: "var(--surface)", color: "var(--text)", fontSize: "0.78rem", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
                            {saveBlocked && (
                              <div style={{ fontSize: "0.68rem", color: "var(--red, #dc2626)", fontWeight: 600 }}>
                                ⚠ Add a comment before saving — the amount doesn't complete the balance owed.
                              </div>
                            )}
                            <div style={{ display: "flex", gap: "0.4rem" }}>
                              <button onClick={() => { setRecordingId(null); setResetConfirmId(null) }} style={{ flex: 1, padding: "0.35rem", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, fontFamily: "inherit" }}>Cancel</button>
                              <button
                                disabled={saveDisabled}
                                title={saveBlocked ? "Add a comment before saving — the amount doesn't complete the balance owed." : undefined}
                                onClick={() => {
                                  if (saveBlocked) return
                                  onTogglePayment(event.id, b, recordAmount, recordNote); setRecordingId(null)
                                }}
                                style={{ flex: 1, padding: "0.35rem", borderRadius: 8, border: "none", background: saveDisabled ? "var(--surface2)" : "var(--special)", color: saveDisabled ? "var(--text-dim)" : "#fff", cursor: saveDisabled ? "not-allowed" : "pointer", opacity: saveDisabled ? 0.6 : 1, fontSize: "0.75rem", fontWeight: 700, fontFamily: "inherit" }}>Save</button>
                            </div>
                            {/* Reset to unpaid -- explicit, confirmed, separate from Save
                                (2026-08-11 hotfix). This is the only path that wipes
                                amount_paid back to 0; it never happens as a side effect
                                of tapping the switch anymore. */}
                            {(paid || partial) && (
                              resetConfirmId === b.id ? (
                                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.1rem" }}>
                                  <span style={{ fontSize: "0.68rem", color: "var(--amber-dark)", flex: 1 }}>
                                    Clear the {wholeDollar(b.amount_paid)} on file and mark unpaid?
                                  </span>
                                  <button onClick={() => setResetConfirmId(null)}
                                    style={{ fontSize: "0.68rem", background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>No</button>
                                  <button
                                    onClick={() => { onTogglePayment(event.id, b); setResetConfirmId(null); setRecordingId(null) }}
                                    style={{ fontSize: "0.68rem", fontWeight: 700, background: "none", border: "none", color: "var(--amber-dark)", cursor: "pointer", fontFamily: "inherit", padding: 0, textDecoration: "underline" }}>
                                    Yes, reset
                                  </button>
                                </div>
                              ) : (
                                <button onClick={() => setResetConfirmId(b.id)}
                                  style={{ fontSize: "0.68rem", color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, textAlign: "left", textDecoration: "underline" }}>
                                  Reset to unpaid
                                </button>
                              )
                            )}
                          </div>
                          )
                        })()}
                        {(() => {
                          const ownerKey = b.member_id ? `m:${b.member_id}` : b.contact_id ? `c:${b.contact_id}` : null
                          const party = ownerKey ? (partyByOwner[ownerKey] || []) : []
                          return showNames && party.length > 0 && (
                          <div style={{ paddingLeft: "0.85rem", marginTop: "0.1rem", display: "flex", flexDirection: "column", gap: "0.05rem" }}>
                            {party.map((p, j) => {
                              const gOwn  = p.member_id && p.member_id === member?.id
                              const gPriv = !!p.member?.hide_name
                              // Contacts (no app login) have no privacy toggle. The
                              // booking owner (isOwn, this row) always sees their own
                              // party's real names, privacy flag or not (Iain, 2026-07-23).
                              // display_name (2026-08-14) rides ahead of the real name once
                              // unmasked -- masking itself (gPriv && !isAdmin && !isOwn) is unchanged.
                              const gName = gOwn ? "You" : p.guest_name ? p.guest_name
                                : p.contact_id ? (p.contact?.name || "Resident")
                                : resolveMemberName(p.member, { canManage: isAdmin || isOwn })
                              return <span key={j} style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>+ {gName}{p.guest_name ? " (guest)" : ""}{gPriv && isAdmin && !gOwn && p.member?.name ? " (P)" : ""}{p.is_bus_passenger ? " 🚌" : ""}</span>
                            })}
                          </div>
                          )
                        })()}
                      </div>
                    )
                  })}
                </>
              ) : (
                <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", fontStyle: "italic" }}>No bookings yet</div>
              )}
              {isAdmin && waitlistBookings.length > 0 && (
                <>
                  <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--amber-dark)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "0.5rem", marginBottom: "0.15rem" }}>Waitlist</div>
                  {waitlistBookings.map((b, i) => {
                    const isOwn     = b.member_id === member?.id
                    const isPrivate = !!b.member?.hide_name
                    // Waitlist rows are always admin-visible only (this whole block is
                    // {isAdmin && ...} gated below), so real name + (P) marker, no masking.
                    const label = isOwn ? "You" : (b.member?.name || b.member?.username || "Member")
                    return (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", padding: "0.2rem 0", borderBottom: "1px solid var(--border)" }}>
                        <span style={{ fontWeight: isOwn ? 700 : 400, color: isOwn ? "var(--special)" : "var(--text)" }}>
                          {label}
                          {isPrivate && !isOwn && <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-dim)", marginLeft: 4 }}>(P)</span>}
                        </span>
                        <span style={{ color: "var(--text-dim)" }}>{b.seats || 1} seat{(b.seats||1) > 1 ? "s" : ""}</span>
                      </div>
                    )
                  })}
                </>
              )}
              {/* Refunds Due / Refunds Issued (2026-07-14) -- same set_refund
                  action and Refunds Due/Issued pattern Movies and Book Club
                  already have via EventSlideOut.js, ported here since Social
                  had no refund tracking at all. Gated the same as the rest
                  of the reconciliation UI (canManagePayments). */}
              {canManagePayments && isPaidEvent && refundPendingBookings.length > 0 && (
                <div style={{ background: "#fef3c7", borderRadius: 10, padding: "0.6rem 0.7rem", border: "1px solid #d97706", marginTop: "0.6rem" }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#92400e", marginBottom: "0.4rem" }}>⚠️ Refunds Due ({refundPendingBookings.length})</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    {refundPendingBookings.map(b => {
                      const isOwn     = b.member_id === member?.id
                      const isPrivate = !!b.member?.hide_name
                      const label = isOwn ? "You" : (b.member?.name || b.member?.username || "Member")
                      const total = seatsCost(event, b.seats || 1)
                      const pending = togglingRefundId === b.id
                      return (
                        <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                          <div>
                            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#92400e" }}>
                              {label}
                              {isPrivate && !isOwn && <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#92400e", opacity: 0.7, marginLeft: 4 }}>(P)</span>}
                            </span>
                            <span style={{ fontSize: "0.68rem", color: "#d97706", marginLeft: 6 }}>{b.seats || 1} seat{(b.seats||1) > 1 ? "s" : ""}{total ? ` · ${total}` : ""}</span>
                          </div>
                          <button
                            disabled={pending}
                            onClick={e => { e.stopPropagation(); e.preventDefault(); onToggleRefund(event.id, b, label, false) }}
                            style={{ fontSize: "0.68rem", fontWeight: 700, padding: "0.2rem 0.55rem", borderRadius: 8, border: "1px solid #d97706", background: "none", color: "#d97706", cursor: pending ? "default" : "pointer", whiteSpace: "nowrap", fontFamily: "inherit", opacity: pending ? 0.6 : 1 }}>
                            {pending ? "…" : "Mark Refunded"}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {canManagePayments && isPaidEvent && refundIssuedBookings.length > 0 && (
                <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "0.6rem 0.7rem", border: "1px solid var(--border)", marginTop: "0.6rem" }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-dim)", marginBottom: "0.4rem" }}>✓ Refunds Issued ({refundIssuedBookings.length})</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                    {refundIssuedBookings.map(b => {
                      const isOwn     = b.member_id === member?.id
                      const isPrivate = !!b.member?.hide_name
                      const label = isOwn ? "You" : (b.member?.name || b.member?.username || "Member")
                      const total = seatsCost(event, b.seats || 1)
                      const pending = togglingRefundId === b.id
                      return (
                        <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                          <div>
                            <span style={{ fontSize: "0.76rem", color: "var(--text-dim)", fontWeight: isOwn ? 700 : 400 }}>
                              {label}
                              {isPrivate && !isOwn && <span style={{ fontWeight: 700, marginLeft: 4 }}>(P)</span>}
                            </span>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-dim)", marginLeft: 6 }}>{b.seats || 1} seat{(b.seats||1) > 1 ? "s" : ""}{total ? ` · ${total}` : ""}</span>
                          </div>
                          <button
                            disabled={pending}
                            onClick={e => { e.stopPropagation(); e.preventDefault(); onToggleRefund(event.id, b, label, true) }}
                            style={{ fontSize: "0.65rem", color: "var(--text-dim)", background: "none", border: "none", cursor: pending ? "default" : "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
                            {pending ? "…" : "Unmark"}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SocialEvents() {
  const { member }        = useUser()
  // No Owner tier for Special Events (Iain, 2026-09-04: "No Owner is
  // needed") -- admin only for the hub-wide New Event button; per-event
  // EC visibility is computed inside EventCard itself.
  const canManage = !!member?.is_admin
  const [events,          setEvents]        = useState([])
  const [coordinatorMap,  setCoordinatorMap] = useState({})
  const [bookings,        setBookings]       = useState({})
  const [loading,         setLoading]        = useState(true)
  const [pastOpen,        setPastOpen]       = useState(false)
  const [fullEvent,       setFullEvent]      = useState(null)
  const [showForm,        setShowForm]       = useState(false)
  const [editEvent,       setEditEvent]      = useState(null)
  const [session,         setSession]        = useState(null)
  const [allMembers,      setAllMembers]     = useState([])
  const [toast,           setToast]          = useState(null)
  const [togglingId,      setTogglingId]     = useState(null)
  const [closingOutId,    setClosingOutId]   = useState(null)
  const [remindingId,     setRemindingId]    = useState(null)
  const [togglingRefundId, setTogglingRefundId] = useState(null)

  function showToast(msg, type = "success") {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    if (!member?.id) return
    const { data: { session: sess } } = await supabase.auth.getSession()
    setSession(sess)

    const { data: membersData } = await supabase
      .from("members").select("id, name, username")
      .order("name")
    setAllMembers(membersData || [])

    const { data: eventsData } = await supabase
      .from("events")
      .select("id, title, event_date, event_time, event_end_time, description, welcome_message, max_seats, max_seats_per_booking, allow_unassigned_seats, unassigned_seats_count, unassigned_seat_names, allow_nonresident_guests, require_attendee_names, cost, payment_required, payment_due_by, reservation_cutoff, show_attendee_names, is_public, has_bus, bus_driver_id, bus_max_seats, location_type, location, location_id, image_url, image_focal_x, image_focal_y, has_dining, menu_type, menu_text, menu_url, menu_file_name, payments_reconciled_at, payments_reconciled_by, reconciled_by_member:members!payments_reconciled_by(name, username), bus_driver:members!bus_driver_id(name, username), bookings(id, status, seats, payment_status, amount_paid, refund_due, refund_paid_at, member_id, contact_id, bus_passenger, booked_at, updated_at, member:members!member_id(id, name, display_name, username, hide_name), contact:contacts!contact_id(id, name)), booking_attendees(owner_id, owner_contact_id, member_id, contact_id, guest_name, is_bus_passenger, member:members!member_id(name, display_name, hide_name), contact:contacts!contact_id(name))")
      .eq("hub_type", "special")
      .eq("archived", false)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true })

    const allEvents = eventsData || []
    setEvents(allEvents)

    if (allEvents.length) {
      const ids = allEvents.map(e => e.id)
      const { data: ecs } = await supabase
        .from("event_coordinators")
        .select("event_id, member_id, members!event_coordinators_member_id_fkey(name, username)")
        .in("event_id", ids).is("replaced_at", null).order("assigned_at")
      const map = {}
      ;(ecs || []).forEach(ec => {
        if (!map[ec.event_id]) map[ec.event_id] = []
        map[ec.event_id].push(ec)
      })
      setCoordinatorMap(map)
    }

    const { data: myBookings } = await supabase
      .from("bookings")
      .select("id, event_id, status, seats, payment_status, amount_paid, refund_due, refund_paid_at")
      .eq("member_id", member.id).neq("status", "cancelled")

    const byEvent = {}
    ;(myBookings || []).forEach(b => { byEvent[b.event_id] = b })
    setBookings(byEvent)
    setLoading(false)
  }, [member?.id])

  useEffect(() => { load() }, [load])

  // Inline Paid/Unpaid toggle on the tile's Attendees accordion (2026-07-12,
  // Iain) -- moved here from EventSlideOut's Coordinator View so an EC can
  // mark payment without opening the full modal, which is now read-only
  // status there. Same /api/coordinator set_payment action underneath.
  // Reworked 2026-08-11 -- amount/note are optional, only sent when the EC
  // used the inline record-payment form (a plain revert-to-unpaid still
  // calls this with neither). "confirmed" is always what's SENT; the
  // server derives the real resulting status (partial/confirmed) from the
  // amount -- this function never has to know that logic itself.
  async function handleTogglePayment(eventId, booking, amount, note) {
    if (togglingId) return // ignore taps while one is already in flight
    if (!session) { showToast("Session expired -- please refresh the page", "error"); return }
    const isSettled = booking.payment_status === "confirmed" || booking.payment_status === "partial"
    const next = isSettled ? "pending" : "confirmed"
    setTogglingId(booking.id)
    try {
      const res = await fetch("/api/coordinator", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await getAuthToken()) },
        body: JSON.stringify({
          event_id: eventId, action: "set_payment", booking_id: booking.id, payment_status: next,
          ...(next === "confirmed" ? { amount: amount === "" ? undefined : amount, note: note || undefined } : {}),
        }),
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        const resultLabel = data.payment_status === "partial" ? "Partial payment recorded"
          : data.payment_status === "confirmed" ? "Marked as paid" : "Marked as unpaid"
        showToast(resultLabel)
        // Patch local state with the server's actual written values BEFORE
        // the full reload (2026-08-12, Iain -- Spring Ball): load() is four
        // sequential Supabase round-trips, which on a real connection took
        // long enough that the toggle/pill sat on the pre-save numbers for
        // several seconds -- reading as "it didn't save" or "it reverted"
        // even though the write had already succeeded (confirmed live: the
        // DB was correct the whole time, only the on-screen state lagged).
        // This makes the UI reflect the change the instant the request
        // completes; load() still runs after for full reconciliation with
        // anything else that may have changed server-side in the meantime.
        if (data.payment_status !== undefined) {
          setEvents(prev => prev.map(ev =>
            ev.id !== eventId ? ev : {
              ...ev,
              bookings: (ev.bookings || []).map(b =>
                b.id !== booking.id ? b : {
                  ...b, payment_status: data.payment_status,
                  amount_paid: data.amount_paid ?? b.amount_paid,
                  refund_due: data.refund_due ?? b.refund_due,
                }
              ),
            }
          ))
        }
        await load()
      } else {
        let msg = "Update failed"
        try { const data = await res.json(); if (data?.error) msg = data.error } catch {}
        showToast(msg, "error")
      }
    } catch (err) {
      showToast("Network error -- update failed", "error")
    } finally {
      setTogglingId(null)
    }
  }

  // Close Out payments (2026-07-12) -- idea 1 of Social_Hive_Event_Payments_
  // Discussion.docx. Reminds everyone still unpaid on this event and stamps
  // the event as reconciled. Re-runnable, same toast/loading-state pattern
  // as handleTogglePayment.
  async function handleCloseOutPayments(eventId) {
    if (closingOutId) return
    if (!session) { showToast("Session expired -- please refresh the page", "error"); return }
    setClosingOutId(eventId)
    try {
      const res = await fetch("/api/coordinator", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await getAuthToken()) },
        body: JSON.stringify({ event_id: eventId, action: "close_out_payments" }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        showToast(data.reminded > 0 ? `Reminded ${data.reminded} unpaid attendee${data.reminded !== 1 ? "s" : ""}` : "All paid up -- nothing to remind")
        await load()
      } else {
        showToast(data.error || "Close Out failed", "error")
      }
    } catch (err) {
      showToast("Network error -- close out failed", "error")
    } finally {
      setClosingOutId(null)
    }
  }

  // Remind a single unpaid attendee (2026-07-12) -- idea 3 of Social_Hive_
  // Event_Payments_Discussion.docx, a per-attendee one-tap nudge distinct
  // from Close Out's bulk "remind everyone unpaid" above. Same toast/
  // loading-state pattern as the other two payment actions.
  async function handleRemindPayment(eventId, booking, label) {
    if (remindingId) return
    if (!session) { showToast("Session expired -- please refresh the page", "error"); return }
    setRemindingId(booking.id)
    try {
      const res = await fetch("/api/coordinator", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await getAuthToken()) },
        body: JSON.stringify({ event_id: eventId, action: "remind_payment", booking_id: booking.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        showToast(`Reminder sent to ${label}`)
      } else {
        showToast(data.error || "Reminder failed", "error")
      }
    } catch (err) {
      showToast("Network error -- reminder failed", "error")
    } finally {
      setRemindingId(null)
    }
  }

  // Mark / unmark a refund as issued on a cancelled-but-paid booking
  // (2026-07-14) -- Social never had this at all before; Movies and Book
  // Club's Coordinator panel (components/EventSlideOut.js) already had it
  // via the same set_refund action, just never wired up on this hub. Same
  // toast/loading-state pattern as the other payment actions on this page.
  async function handleToggleRefund(eventId, booking, label, currentlyRefunded) {
    if (togglingRefundId) return
    if (!session) { showToast("Session expired -- please refresh the page", "error"); return }
    setTogglingRefundId(booking.id)
    try {
      const res = await fetch("/api/coordinator", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await getAuthToken()) },
        body: JSON.stringify({ event_id: eventId, action: "mark_refund_paid", booking_id: booking.id, refunded: !currentlyRefunded }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        showToast(currentlyRefunded ? `Refund unmarked for ${label}` : `Refund marked for ${label}`)
        await load()
      } else {
        showToast(data.error || "Failed to update refund", "error")
      }
    } catch (err) {
      showToast("Network error -- refund update failed", "error")
    } finally {
      setTogglingRefundId(null)
    }
  }

  async function openEventSlideOut(event) {
    const { data } = await supabase
      .from("events")
      .select("*, bus_driver:members!bus_driver_id(name, username), bookings(id, status, seats, payment_status, amount_paid, refund_due, refund_paid_at, member_id, bus_passenger, booked_at, members(name, username)), booking_attendees(owner_id, member_id, guest_name, is_bus_passenger, member:members!member_id(name, hide_name))")
      .eq("id", event.id).single()
    if (data) {
      const allBookings = (data.bookings || []).filter(b => b.status !== "cancelled")
      const confirmedBookings = allBookings.filter(b => b.status === "confirmed")
      const waitlistBookings  = allBookings.filter(b => b.status === "waitlist")
      const bookings_count = confirmedBookings.reduce((sum, b) => sum + (b.seats || 1), 0)
      const waitlist_count = waitlistBookings.reduce((sum, b) => sum + (b.seats || 1), 0)
      const my_bookings = allBookings.filter(b => b.member_id === member?.id)
      setFullEvent({ ...data, my_bookings, bookings_count, waitlist_count })
    }
  }

  const today    = new Date(); today.setHours(0, 0, 0, 0)
  const upcoming = events.filter(e => localDate(e.event_date) >= today)
  const past     = events.filter(e => localDate(e.event_date) < today)
    .sort((a, b) => b.event_date.localeCompare(a.event_date))

  if (loading) {
    return (
      <div style={{ padding: "1.25rem 1rem" }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: 120, borderRadius: "14px", background: "var(--surface2)", marginBottom: "0.75rem" }} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {canManage && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
          <button onClick={() => { setEditEvent(null); setShowForm(true) }} style={{
            background: "var(--special)", color: "#fff", border: "none",
            borderRadius: "20px", padding: "0.5rem 1.25rem",
            fontSize: "0.88rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>+ Add Event</button>
        </div>
      )}

      {upcoming.length === 0 ? (
        <div style={{
          background: "var(--surface)", borderRadius: "14px",
          border: "1px solid var(--border)", padding: "1.75rem",
          textAlign: "center", marginBottom: "1.25rem",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🎉</div>
          <div style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>No upcoming social events</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
          {upcoming.map(e => (
            <EventCard key={e.id} event={e} coordinators={coordinatorMap[e.id] || []}
              myBooking={bookings[e.id]} isAdmin={canManage}
              onOpen={() => openEventSlideOut(e)}
              onEdit={() => { setEditEvent(e); setShowForm(true) }}
              onTogglePayment={handleTogglePayment} togglingId={togglingId}
              onCloseOutPayments={handleCloseOutPayments} closingOut={closingOutId === e.id}
              onRemindPayment={handleRemindPayment} remindingId={remindingId}
                    onToggleRefund={handleToggleRefund} togglingRefundId={togglingRefundId} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div>
          <button onClick={() => setPastOpen(v => !v)} style={{
            width: "100%", padding: "0.75rem 1.1rem",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: pastOpen ? "14px 14px 0 0" : "14px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            cursor: "pointer", fontFamily: "inherit",
            fontSize: "0.85rem", fontWeight: 700, color: "var(--text-dim)",
          }}>
            <span>Past Events</span>
            <span style={{ fontSize: "0.7rem", display: "inline-block", transform: pastOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
          </button>
          {pastOpen && (
            <div style={{ border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 14px 14px", overflow: "hidden" }}>
              {past.map((e, i) => (
                <div key={e.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
                  <EventCard event={e} coordinators={coordinatorMap[e.id] || []}
                    myBooking={bookings[e.id]} isAdmin={canManage}
                    onOpen={() => openEventSlideOut(e)}
                    onEdit={() => { setEditEvent(e); setShowForm(true) }}
                    onTogglePayment={handleTogglePayment} togglingId={togglingId}
                    onCloseOutPayments={handleCloseOutPayments} closingOut={closingOutId === e.id}
                    onRemindPayment={handleRemindPayment} remindingId={remindingId}
                    onToggleRefund={handleToggleRefund} togglingRefundId={togglingRefundId} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {fullEvent && (
        <EventSlideOut event={fullEvent} onClose={() => setFullEvent(null)}
          onRefresh={async () => { if (fullEvent) await openEventSlideOut({ id: fullEvent.id }); load() }} />
      )}

      {showForm && session && (
        <SpecialEventForm event={editEvent} session={session} members={allMembers}
          onClose={() => { setShowForm(false); setEditEvent(null) }}
          onSaved={() => load()} />
      )}
    </div>
  )
}
