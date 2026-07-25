"use client"
// Shared "who can be named / must someone be named" control for any event
// form with a Max per Booking > 1 field. Replaces three near-identical
// inline copies (ClubHome.js, app/(app)/social/events/page.js,
// app/(app)/screenings/page.js) that had drifted into two different UI
// patterns (a two-pill picker vs a plain toggle switch) for the exact same
// underlying setting.
//
// Two independent axes (Iain, 2026-07-25):
//   - WHO can be named as an extra attendee: "Anyone" (resident or a typed
//     guest name) vs "Residents only". Same field as always
//     (events.allow_nonresident_guests) -- just relabelled ("Residents +
//     guests" -> "Anyone"), reordered to sit first, and now the default for
//     new events (previously "Residents only" was the default).
//   - WHETHER naming is required at all (events.require_attendee_names,
//     new). Naming used to be mandatory on every multi-seat booking with no
//     way to turn it off; default is now optional, off unless an admin/EC
//     switches it on for this specific event.
//
// Caller is responsible for only rendering this when max seats per booking
// > 1 (matches the existing per-form gating), and for the "applies across
// every hub" decision Iain made -- this same component is meant to be the
// one and only place this control is built from now on.

function MiniToggle({ value, onChange, colour }) {
  return (
    <button type="button" onClick={() => onChange(!value)} aria-checked={value} role="switch"
      style={{ flexShrink: 0, width: 40, height: 24, borderRadius: 12, background: value ? colour : "var(--border)",
        border: "none", cursor: "pointer", position: "relative", transition: "background 0.15s" }}>
      <span style={{ position: "absolute", top: 3, left: value ? 19 : 3, width: 18, height: 18, borderRadius: "50%",
        background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,.25)" }} />
    </button>
  )
}

export default function AttendeeNamingPicker({ allowGuests, onAllowGuestsChange, required, onRequiredChange, colour = "var(--amber)" }) {
  const pillStyle = active => ({
    flex: 1, padding: "0.6rem 0.5rem", borderRadius: 10, fontSize: "0.88rem", fontFamily: "inherit", cursor: "pointer",
    border: `1.5px solid ${active ? colour : "var(--border)"}`,
    background: active ? colour : "var(--surface)",
    color: active ? "#fff" : "var(--text)",
    fontWeight: active ? 700 : 500,
  })

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)",
        textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
        Extra attendees on multi-seat bookings
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => onAllowGuestsChange(true)} style={pillStyle(allowGuests === true)}>Anyone</button>
        <button type="button" onClick={() => onAllowGuestsChange(false)} style={pillStyle(allowGuests === false)}>Residents only</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginTop: "0.6rem" }}>
        <div>
          <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text)" }}>Require every extra seat to be named</div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "0.1rem" }}>
            {required ? "Residents must name who's coming before they can book." : "Naming is optional — residents can leave a seat unnamed."}
          </div>
        </div>
        <MiniToggle value={!!required} onChange={onRequiredChange} colour={colour} />
      </div>
    </div>
  )
}
