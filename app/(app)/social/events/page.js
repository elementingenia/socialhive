"use client"
import { useEffect, useState, useCallback, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import EventSlideOut from "@/components/EventSlideOut"
import { BusIcon } from "@/components/NavIcons"

// ── Design tokens ─────────────────────────────────────────────────────────────
const INPUT = {
  width: "100%", padding: "0.75rem 1rem", borderRadius: "10px",
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box",
  fontFamily: "inherit", appearance: "none", WebkitAppearance: "none",
}
const LABEL = {
  display: "block", fontSize: "0.78rem", fontWeight: 700,
  color: "var(--text-dim)", textTransform: "uppercase",
  letterSpacing: "0.06em", marginBottom: "0.4rem",
}
const FIELD = { marginBottom: "1rem" }

const ONSITE_LOCATIONS = [
  "Community Hall",
  "Community Sports Bar",
  "Community Lounge",
  "Workshop",
  "Outside Area",
  "Health Utility Building",
]

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
function BookingStrip({ myBooking, isFull }) {
  const isConfirmed = myBooking?.status === "confirmed"
  const isWaitlist  = myBooking?.status === "waitlist"
  const seats       = myBooking?.seats || 1
  const base = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.55rem 1rem", fontSize: "0.82rem", fontWeight: 600, gap: "0.5rem" }

  if (isConfirmed) {
    return (
      <div style={{ ...base, background: "#f0fdf4", borderTop: "1px solid #bbf7d0" }}>
        <span style={{ color: "#15803d" }}>✓ {seats} seat{seats !== 1 ? "s" : ""} confirmed</span>
        <span style={{ color: "#15803d", fontSize: "0.75rem" }}>Tap to modify or cancel →</span>
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
      <span style={{ color: "var(--terracotta)" }}>Book your spot</span>
      <span style={{ color: "var(--terracotta)", fontSize: "0.75rem" }}>Tap to book →</span>
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
      <div onClick={() => { setOpen(o => !o); setQuery("") }} style={{
        ...INPUT, display: "flex", alignItems: "center", justifyContent: "space-between",
        cursor: "pointer", borderColor: open ? "var(--terracotta)" : "var(--border)",
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
                background: value?.id === m.id ? "var(--terracotta)12" : "transparent",
                fontWeight: value?.id === m.id ? 700 : 400, fontSize: "0.88rem",
                color: value?.id === m.id ? "var(--terracotta)" : "var(--text)",
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
function ECPicker({ members = [], value, onChange, valid }) {
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

  // Border: green when valid (≥1 EC), red when not
  const triggerBorder = open
    ? "var(--terracotta)"
    : valid ? "var(--green)" : "var(--danger)"

  return (
    <div ref={containerRef}>
      {/* Chips */}
      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.5rem" }}>
          {value.map(m => (
            <span key={m.id} style={{
              display: "inline-flex", alignItems: "center", gap: "0.3rem",
              background: "var(--terracotta)20", color: "var(--terracotta)",
              border: "1px solid var(--terracotta)60",
              borderRadius: "20px", padding: "0.2rem 0.6rem 0.2rem 0.75rem",
              fontSize: "0.82rem", fontWeight: 600,
            }}>
              {m.name || m.username}
              <button onClick={() => remove(m.id)}
                style={{ background: "none", border: "none", color: "var(--terracotta)", cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}

      {value.length < 3 && (
        <div style={{ position: "relative" }}>
          <div onClick={() => { setOpen(o => !o); setQuery("") }} style={{
            ...INPUT, display: "flex", alignItems: "center", justifyContent: "space-between",
            cursor: "pointer", border: `1.5px solid ${triggerBorder}`,
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
        background: value ? "var(--terracotta)" : "var(--border)",
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
function FixedListPicker({ value, onChange, options, placeholder = "Select…" }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

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
          borderColor: open ? "var(--terracotta)" : "var(--border)",
        }}
      >
        <span style={{ color: value ? "var(--text)" : "var(--text-dim)" }}>
          {value || placeholder}
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
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false) }}
              style={{
                width: "100%", padding: "0.75rem 1rem", textAlign: "left",
                background: value === opt ? "var(--terracotta)12" : "transparent",
                border: "none", borderTop: i > 0 ? "1px solid var(--border)" : "none",
                cursor: "pointer", fontFamily: "inherit", fontSize: "0.92rem",
                color: value === opt ? "var(--terracotta)" : "var(--text)",
                fontWeight: value === opt ? 700 : 400,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}
            >
              {opt}
              {value === opt && <span style={{ color: "var(--terracotta)", fontSize: "0.85rem" }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Location field ────────────────────────────────────────────────────────────
function LocationField({ locationType, location, onTypeChange, onLocationChange }) {
  return (
    <div style={FIELD}>
      <label style={LABEL}>Location *</label>
      {/* Onsite / Offsite toggle buttons */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.6rem" }}>
        {["onsite", "offsite"].map(t => (
          <button key={t} type="button" onClick={() => { onTypeChange(t); onLocationChange("") }}
            style={{
              flex: 1, padding: "0.55rem", borderRadius: "10px", fontFamily: "inherit",
              fontSize: "0.88rem", fontWeight: 700, cursor: "pointer", border: "2px solid",
              borderColor: locationType === t ? "var(--terracotta)" : "var(--border)",
              background: locationType === t ? "var(--terracotta)18" : "var(--surface)",
              color: locationType === t ? "var(--terracotta)" : "var(--text-dim)",
            }}>
            {t === "onsite" ? "On-site" : "Off-site"}
          </button>
        ))}
      </div>

      {locationType === "onsite" ? (
        <FixedListPicker
          value={location}
          onChange={onLocationChange}
          options={ONSITE_LOCATIONS}
          placeholder="Select venue…"
        />
      ) : (
        <textarea
          value={location}
          onChange={e => onLocationChange(e.target.value)}
          rows={3}
          placeholder="Enter venue name and address…"
          style={{ ...INPUT, resize: "vertical" }}
        />
      )}
    </div>
  )
}

// ── Social Event Form (slide-over) ────────────────────────────────────────────
function SocialEventForm({ event, session, members = [], onClose, onSaved }) {
  const editing = !!event
  const [form, setForm] = useState({
    title:                 event?.title               || "",
    event_date:            event?.event_date          || "",
    event_time:            event?.event_time ? fmtTime24(event.event_time) : "",
    description:           event?.description         || "",
    welcome_message:       event?.welcome_message     || "",
    max_seats:             event?.max_seats           ?? 20,
    max_seats_per_booking: event?.max_seats_per_booking ?? 2,
    payment_required:      event?.payment_required    || false,
    cost:                  event?.cost                || "",
    is_public:             event?.is_public           !== false,
    show_attendee_names:   event?.show_attendee_names !== false,
    has_bus:               event?.has_bus             || false,
    location_type:         event?.location_type       || "onsite",
    location:              event?.location            || "",
  })

  const [coordinators, setCoordinators] = useState([])
  const [busDriver,    setBusDriver]    = useState(null)
  const [ecError,      setEcError]      = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState(null)

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
    if (!form.title.trim())    { setError("Title is required"); return }
    if (!form.event_date)      { setError("Date is required");  return }
    if (!coordinators.length)  { setEcError("At least one coordinator is required"); return }

    setSaving(true)
    const payload = {
      ...form,
      cost:                  form.payment_required ? Number(form.cost) : 0,
      max_seats:             Number(form.max_seats),
      max_seats_per_booking: Number(form.max_seats_per_booking),
      coordinator_ids:       coordinators.map(m => m.id),
      bus_driver_id:         form.has_bus ? busDriver?.id || null : null,
    }
    if (editing) payload.id = event.id

    const res = await fetch("/api/social", {
      method:  editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + session.access_token },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || "Save failed"); return }
    onSaved(); onClose()
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 400 }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(440px, 100%)", background: "var(--surface)",
        zIndex: 401, overflowY: "auto", paddingBottom: 32,
        boxShadow: "-8px 0 32px rgba(0,0,0,0.15)",
      }}>
        <div style={{ height: 5, background: "var(--terracotta)" }} />
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)",
          position: "sticky", top: 0, background: "var(--surface)", zIndex: 1,
        }}>
          <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--terracotta)" }}>
            {editing ? "Edit Event" : "New Social Event"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "var(--text-dim)" }}>×</button>
        </div>

        <div style={{ padding: "1.25rem 1.25rem 2rem" }}>

          {/* Title */}
          <div style={FIELD}>
            <label style={LABEL}>Event Name <span style={{ color: "var(--danger)" }}>*</span></label>
            <input value={form.title} onChange={e => set("title", e.target.value)}
              placeholder="e.g. Wine & Cheese Evening"
              style={{ ...INPUT, border: `1.5px solid ${form.title.trim() ? "var(--green)" : "var(--danger)"}` }} />
          </div>

          {/* Date + Time */}
          <div style={{ ...FIELD, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={LABEL}>Date <span style={{ color: "var(--danger)" }}>*</span></label>
              <input type="date" value={form.event_date}
                onChange={e => set("event_date", e.target.value)}
                onClick={e => e.currentTarget.showPicker?.()}
                style={{ ...INPUT, border: `1.5px solid ${form.event_date ? "var(--green)" : "var(--danger)"}` }} />
              {form.event_date && (
                <div style={{ fontSize: "0.75rem", color: "var(--terracotta)", fontWeight: 600, marginTop: "0.3rem" }}>
                  {localDate(form.event_date)?.toLocaleDateString("en-AU", { weekday: "long" })}
                </div>
              )}
            </div>
            <div>
              <label style={LABEL}>Time</label>
              <input type="time" value={form.event_time}
                onChange={e => set("event_time", e.target.value)} style={INPUT} />
            </div>
          </div>

          {/* Location */}
          <LocationField
            locationType={form.location_type}
            location={form.location}
            onTypeChange={v => set("location_type", v)}
            onLocationChange={v => set("location", v)}
          />

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

          {/* EC — mandatory */}
          <div style={FIELD}>
            <label style={LABEL}>Event Coordinator(s) <span style={{ color: "var(--danger)" }}>*</span> — max 3</label>
            <ECPicker members={members} value={coordinators} onChange={v => { setCoordinators(v); setEcError(null) }} valid={coordinators.length > 0} />
            {ecError && <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: "0.25rem" }}>{ecError}</div>}
          </div>

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
            </>
          )}

          {/* Capacity */}
          <div style={{ ...FIELD, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={LABEL}>Total Seats</label>
              <input type="number" min={1} max={500} value={form.max_seats}
                onChange={e => set("max_seats", e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Max per Booking</label>
              <input type="number" min={1} max={10} value={form.max_seats_per_booking}
                onChange={e => set("max_seats_per_booking", e.target.value)} style={INPUT} />
            </div>
          </div>

          {/* Paid */}
          <div style={FIELD}>
            <Toggle value={form.payment_required} onChange={v => set("payment_required", v)} label="Paid event" />
          </div>
          {form.payment_required && (
            <div style={{ ...FIELD, marginTop: "-0.5rem" }}>
              <label style={LABEL}>Cost per person ($)</label>
              <input type="number" min={0} step={1} value={form.cost}
                onChange={e => set("cost", e.target.value)} placeholder="e.g. 25" style={INPUT} />
            </div>
          )}

          {/* Public */}
          <div style={FIELD}>
            <Toggle value={form.is_public} onChange={v => set("is_public", v)} label="Visible on public calendar" />
          </div>

          {/* Show attendees */}
          <div style={FIELD}>
            <Toggle value={form.show_attendee_names} onChange={v => set("show_attendee_names", v)} label="Show attendee names" />
          </div>

          {error && <div style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: "1rem" }}>{error}</div>}

          <button onClick={save} disabled={saving} style={{
            width: "100%", padding: "0.9rem", background: "var(--terracotta)",
            color: "#fff", border: "none", borderRadius: "12px",
            fontSize: "1rem", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1, fontFamily: "inherit",
          }}>
            {saving ? "Saving…" : editing ? "Save Changes" : "Create Event"}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Event Card ────────────────────────────────────────────────────────────────
function EventCard({ event, coordinators, myBooking, isAdmin, onOpen, onEdit }) {
  const today     = new Date(); today.setHours(0, 0, 0, 0)
  const evDate    = localDate(event.event_date)
  const isPast    = evDate < today
  const daysUntil = Math.round((evDate - today) / 86400000)
  const daysLabel = isPast ? null : daysUntil === 0 ? "Today!" : daysUntil === 1 ? "Tomorrow" : `In ${daysUntil} days`

  const isConfirmed = myBooking?.status === "confirmed"
  const isPending   = isConfirmed && event.payment_required && myBooking?.payment_status === "pending"
  const isWaitlist  = myBooking?.status === "waitlist"

  const booked  = event.bookings?.filter(b => b.status === "confirmed").reduce((s, b) => s + (b.seats || 1), 0) || 0
  const waiting = event.bookings?.filter(b => b.status === "waitlist").length || 0
  const ecNames = coordinators.map(c => c.members?.name || c.members?.username).filter(Boolean)

  return (
    <div onClick={onOpen} style={{
      background: "var(--surface)", borderRadius: "14px",
      border: "1px solid var(--border)", overflow: "hidden",
      opacity: isPast ? 0.65 : 1, cursor: "pointer",
    }}>
      <div style={{ padding: "0.9rem 1rem" }}>
        {/* Title + badges */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.35rem" }}>
          <div style={{ fontWeight: 700, fontSize: "1rem", lineHeight: 1.2, flex: 1 }}>{event.title}</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.3rem", flexShrink: 0 }}>
            {isAdmin && (
              <button onClick={e => { e.stopPropagation(); onEdit() }} style={{
                background: "var(--surface2)", border: "1px solid var(--border)",
                borderRadius: "8px", padding: "0.2rem 0.6rem",
                fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
                color: "var(--text-dim)", fontFamily: "inherit",
              }}>Edit</button>
            )}
            {isConfirmed && (
              <span style={{
                background: isPending ? "#fef3c7" : "#dcfce7",
                color: isPending ? "#92400e" : "#166534",
                borderRadius: "20px", padding: "0.2rem 0.55rem",
                fontSize: "0.7rem", fontWeight: 700,
              }}>{isPending ? "⏳ Pending" : "✓ Going"}</span>
            )}
            {isWaitlist && (
              <span style={{ background: "#f1f5f9", color: "#64748b", borderRadius: "20px", padding: "0.2rem 0.55rem", fontSize: "0.7rem", fontWeight: 700 }}>Waitlisted</span>
            )}
            {daysLabel && !isConfirmed && !isWaitlist && (
              <span style={{ background: "var(--terracotta)18", color: "var(--terracotta)", borderRadius: "20px", padding: "0.2rem 0.55rem", fontSize: "0.7rem", fontWeight: 700 }}>{daysLabel}</span>
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

        {/* EC names */}
        {ecNames.length > 0 && (
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.2rem" }}>
            Coordinator{ecNames.length > 1 ? "s" : ""}: {ecNames.join(", ")}
          </div>
        )}

        {/* Bus driver */}
        {event.has_bus && event.bus_driver && (
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.2rem" }}>
            <BusIcon size={14} /> {event.bus_driver.name || event.bus_driver.username}
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

        {/* Description */}
        {event.description && (
          <div style={{
            fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, marginBottom: "0.5rem",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{event.description}</div>
        )}

        <CapacityBar booked={booked} max={event.max_seats} waitlist={waiting} />
      </div>
      {/* Booking status strip — always visible */}
      <BookingStrip myBooking={myBooking} isFull={booked >= event.max_seats && event.max_seats > 0} />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SocialEvents() {
  const { member }        = useUser()
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
      .select("id, title, event_date, event_time, description, welcome_message, max_seats, max_seats_per_booking, cost, payment_required, show_attendee_names, is_public, has_bus, bus_driver_id, location_type, location, bus_driver:members!bus_driver_id(name, username), bookings(id, status, seats, payment_status, member_id)")
      .eq("hub_type", "social")
      .eq("archived", false)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true })

    const allEvents = eventsData || []
    setEvents(allEvents)

    if (allEvents.length) {
      const ids = allEvents.map(e => e.id)
      const { data: ecs } = await supabase
        .from("event_coordinators")
        .select("event_id, member_id, members(name, username)")
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
      .select("id, event_id, status, seats, payment_status")
      .eq("member_id", member.id).neq("status", "cancelled")

    const byEvent = {}
    ;(myBookings || []).forEach(b => { byEvent[b.event_id] = b })
    setBookings(byEvent)
    setLoading(false)
  }, [member?.id])

  useEffect(() => { load() }, [load])

  async function openEventSlideOut(event) {
    const { data } = await supabase
      .from("events")
      .select("*, bookings(id, status, seats, payment_status, member_id, members(name, username))")
      .eq("id", event.id).single()
    if (data) {
      const my_bookings = (data.bookings || []).filter(b => b.member_id === member?.id)
      setFullEvent({ ...data, my_bookings })
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

      {member?.is_admin && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
          <button onClick={() => { setEditEvent(null); setShowForm(true) }} style={{
            background: "var(--terracotta)", color: "#fff", border: "none",
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
              myBooking={bookings[e.id]} isAdmin={member?.is_admin}
              onOpen={() => openEventSlideOut(e)}
              onEdit={() => { setEditEvent(e); setShowForm(true) }} />
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
                    myBooking={bookings[e.id]} isAdmin={member?.is_admin}
                    onOpen={() => openEventSlideOut(e)}
                    onEdit={() => { setEditEvent(e); setShowForm(true) }} />
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
        <SocialEventForm event={editEvent} session={session} members={allMembers}
          onClose={() => { setShowForm(false); setEditEvent(null) }}
          onSaved={() => { setShowForm(false); setEditEvent(null); load() }} />
      )}
    </div>
  )
}
