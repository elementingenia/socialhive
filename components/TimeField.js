"use client"
// Shared Hour + Minute time picker — 24hr clock, minutes limited to :00/:30
// (Iain, 2026-07-23 — avoids am/pm confusion for a 55+ audience, and keeps
// the space-clash overlap maths simple). Styled selects, no native controls,
// matching the app's standing form-control convention.
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
const MINUTES = ["00", "30"]

// `invalid` (Iain, 2026-08-04) draws the same solid red border + light red
// fill as every other mandatory field (lib/formValidation.js's
// INVALID_FIELD_STYLE) directly on these two selects -- not on a wrapping
// div, which is invisible behind their own opaque backgrounds. Takes
// priority over `colour` when both are passed.
export default function TimeField({ value, onChange, colour = "var(--border)", invalid = false }) {
  const [h, m] = String(value || "").split(":")
  const hour = HOURS.includes(h) ? h : ""
  const minute = MINUTES.includes(m) ? m : "00"

  function setHour(newH) { onChange(newH ? `${newH}:${minute}` : "") }
  function setMinute(newM) { onChange(`${hour || "00"}:${newM}`) }

  const selectStyle = {
    padding: "0.7rem 0.6rem", borderRadius: 10,
    border: invalid ? "2px solid #dc2626" : `1px solid ${colour}`,
    background: invalid ? "rgba(220, 38, 38, 0.10)" : "var(--surface)",
    color: "var(--text)", fontSize: "0.95rem",
    fontFamily: "inherit", appearance: "none", WebkitAppearance: "none", flex: 1,
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select value={hour} onChange={e => setHour(e.target.value)} style={selectStyle}>
        <option value="" disabled>Hour</option>
        {HOURS.map(hh => <option key={hh} value={hh}>{hh}</option>)}
      </select>
      <select value={minute} onChange={e => setMinute(e.target.value)} style={selectStyle}>
        {MINUTES.map(mm => <option key={mm} value={mm}>{mm}</option>)}
      </select>
    </div>
  )
}
