"use client"
// Shared Hour + Minute time picker — 24hr clock, minutes limited to :00/:30
// (Iain, 2026-07-23 — avoids am/pm confusion for a 55+ audience, and keeps
// the space-clash overlap maths simple). Styled selects, no native controls,
// matching the app's standing form-control convention.
import { useEffect } from "react"

const ALL_HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
const MINUTES = ["00", "30"]

// `invalid` (Iain, 2026-08-04) draws the same solid red border + light red
// fill as every other mandatory field (lib/formValidation.js's
// INVALID_FIELD_STYLE) directly on these two selects -- not on a wrapping
// div, which is invisible behind their own opaque backgrounds. Takes
// priority over `colour` when both are passed.
//
// `minHour` (Iain, 2026-08-07) — pass the event's Start hour (0-23) when
// this TimeField is an End Time picker, so the Hour dropdown only offers
// hours strictly after it (e.g. start 18:30 -> end hour options 19-23).
// Every End Time site in the app should pass this. If the currently
// selected value becomes invalid because the start hour moved past it,
// the field auto-clears rather than silently keeping an impossible value.
export default function TimeField({ value, onChange, colour = "var(--border)", invalid = false, minHour = null }) {
  const [h, m] = String(value || "").split(":")
  const hour = ALL_HOURS.includes(h) ? h : ""
  const minute = MINUTES.includes(m) ? m : "00"

  const HOURS = minHour == null ? ALL_HOURS : ALL_HOURS.filter(hh => Number(hh) > Number(minHour))

  useEffect(() => {
    if (hour && !HOURS.includes(hour)) onChange("")
    // Deliberately scoped to [minHour] only: this must fire when the Start
    // hour moves and invalidates the current End hour selection, not on
    // every keystroke that changes `hour`/`onChange` themselves (that would
    // fight the user's own input). react-hooks/exhaustive-deps isn't
    // actually enabled in this project's ESLint config (no
    // eslint-plugin-react-hooks in .eslintrc.cjs) -- the disable-comment
    // that used to be here referenced a rule ESLint can't resolve, which
    // silently broke `npm run lint` (and therefore CI) for every PR since
    // 2026-08-07 (PR #61). Removed rather than re-added.
  }, [minHour])

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
