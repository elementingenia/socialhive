"use client"
// Shared Hour + Minute time picker — 24hr clock, minutes limited to :00/:30
// (Iain, 2026-07-23 — avoids am/pm confusion for a 55+ audience, and keeps
// the space-clash overlap maths simple). Styled selects, no native controls,
// matching the app's standing form-control convention.
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
const MINUTES = ["00", "30"]

export default function TimeField({ value, onChange, colour = "var(--border)" }) {
  const [h, m] = String(value || "").split(":")
  const hour = HOURS.includes(h) ? h : ""
  const minute = MINUTES.includes(m) ? m : "00"

  function setHour(newH) { onChange(newH ? `${newH}:${minute}` : "") }
  function setMinute(newM) { onChange(`${hour || "00"}:${newM}`) }

  const selectStyle = {
    padding: "0.7rem 0.6rem", borderRadius: 10, border: `1px solid ${colour}`,
    background: "var(--surface)", color: "var(--text)", fontSize: "0.95rem",
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
