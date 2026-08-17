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
//
// `hourFloor`/`hourCeil` (Iain, 2026-08-17, space-booking hours): pass an
// inclusive hour range (e.g. 8 and 22 for 8am-10pm) to HIDE hours outside
// it entirely from the dropdown -- this is a hard venue-hours limit, not a
// soft warning, so those hours aren't offered at all rather than shown
// disabled. At the ceiling hour, only the ":00" minute is offered (22:30
// would be past 10pm).
//
// `disabledSlots` (Iain, 2026-08-17): a Set of "HH:MM" 30-min slot starts
// that are already booked -- these DO stay in the dropdown but render as a
// disabled (greyed, unselectable) <option>, distinct from hourFloor/hourCeil
// hiding hours outright. This is a first-pass UX aid only: the authoritative
// clash check still runs server-side on submit (checkSpaceAvailability /
// findSpaceBookingConflict) exactly as before, so a gap in this heuristic
// (it applies the same "busy" set to both the Start and End field, which is
// slightly conservative about legitimate end-exactly-when-the-next-booking-
// starts times) can never let a real double-booking through, worst case it
// over-greys one valid combination that the resident can route around.
export default function TimeField({
  value, onChange, colour = "var(--border)", invalid = false, minHour = null,
  hourFloor = null, hourCeil = null, disabledSlots = null,
}) {
  const [h, m] = String(value || "").split(":")
  const hour = ALL_HOURS.includes(h) ? h : ""
  const minute = MINUTES.includes(m) ? m : "00"

  const HOURS = ALL_HOURS.filter(hh => {
    if (minHour != null && Number(hh) <= Number(minHour)) return false
    if (hourFloor != null && Number(hh) < hourFloor) return false
    if (hourCeil != null && Number(hh) > hourCeil) return false
    return true
  })

  // The ceiling hour (e.g. 22 for a 10pm cutoff) only has ":00" as a usable
  // minute -- ":30" would run past the limit.
  function usableMinutes(hh) {
    if (hourCeil != null && Number(hh) === hourCeil) return ["00"]
    return MINUTES
  }

  function isHourFullyBooked(hh) {
    if (!disabledSlots || !disabledSlots.size) return false
    return usableMinutes(hh).every(mm => disabledSlots.has(`${hh}:${mm}`))
  }

  useEffect(() => {
    if (hour && !HOURS.includes(hour)) onChange("")
    // Deliberately scoped to [minHour, hourFloor, hourCeil]: this must fire
    // when the bounds that make the current selection invalid change, not on
    // every keystroke that changes `hour`/`onChange` themselves (that would
    // fight the user's own input). react-hooks/exhaustive-deps isn't
    // actually enabled in this project's ESLint config (no
    // eslint-plugin-react-hooks in .eslintrc.cjs) -- a disable-comment that
    // used to live here referenced a rule ESLint can't resolve, which
    // silently broke `npm run lint` (and therefore CI) for every PR since
    // 2026-08-07 (PR #61). Don't re-add one.
  }, [minHour, hourFloor, hourCeil])

  function setHour(newH) {
    if (!newH) { onChange(""); return }
    const usable = usableMinutes(newH)
    // Keep the current minute if it's still valid for the new hour and not
    // itself a booked slot; otherwise fall back to the first free minute
    // (or just the first usable one if the whole hour turns out booked --
    // isHourFullyBooked already keeps a fully-booked hour out of reach via
    // the disabled <option>, this is only a defensive fallback).
    const stillGood = usable.includes(minute) && !(disabledSlots?.has(`${newH}:${minute}`))
    const fallback = usable.find(mm => !disabledSlots?.has(`${newH}:${mm}`)) || usable[0]
    onChange(`${newH}:${stillGood ? minute : fallback}`)
  }
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
        {HOURS.map(hh => (
          <option key={hh} value={hh} disabled={isHourFullyBooked(hh)}>
            {hh}{isHourFullyBooked(hh) ? " (booked)" : ""}
          </option>
        ))}
      </select>
      <select value={minute} onChange={e => setMinute(e.target.value)} style={selectStyle}>
        {usableMinutes(hour || "00").map(mm => {
          const booked = !!disabledSlots?.has(`${hour || "00"}:${mm}`)
          return (
            <option key={mm} value={mm} disabled={booked}>
              {mm}{booked ? " (booked)" : ""}
            </option>
          )
        })}
      </select>
    </div>
  )
}
