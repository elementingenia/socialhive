// Pure option logic for components/TimeField.js (kept here so it can be
// unit-tested without React).
//
// `minTime` ("HH:MM") is the Start time when the field is an End Time picker.
// End must be STRICTLY after start, so the start hour itself stays available
// when a later half-hour exists in it (start 09:00 -> end 09:30 allowed).
// Replaces the old `minHour` rule (2026-08-07), which dropped the whole start
// hour and made 09:00-09:30 impossible (Iain, 2026-10-05).

export const ALL_HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
export const MINUTES = ["00", "30"]

function parseMin(minTime) {
  const [h, m] = String(minTime || "").split(":")
  if (!ALL_HOURS.includes(h)) return null
  return { h: Number(h), m: Number(m) || 0 }
}

// Minutes offered for hour `hh`, given the bounds.
export function usableMinutes(hh, { minTime = null, hourCeil = null } = {}) {
  let mins = MINUTES
  if (hourCeil != null && Number(hh) === hourCeil) mins = ["00"]
  const min = parseMin(minTime)
  if (min && Number(hh) === min.h) mins = mins.filter(mm => Number(mm) > min.m)
  return mins
}

// Hours offered: inside floor/ceiling, not before the start hour, and with at
// least one usable minute left.
export function availableHours({ minTime = null, hourFloor = null, hourCeil = null } = {}) {
  const min = parseMin(minTime)
  return ALL_HOURS.filter(hh => {
    const n = Number(hh)
    if (min && n < min.h) return false
    if (hourFloor != null && n < hourFloor) return false
    if (hourCeil != null && n > hourCeil) return false
    return usableMinutes(hh, { minTime, hourCeil }).length > 0
  })
}

// True when a full "HH:MM" value is allowed under the bounds.
export function isTimeAllowed(value, bounds = {}) {
  const [h, m] = String(value || "").split(":")
  if (!availableHours(bounds).includes(h)) return false
  return usableMinutes(h, bounds).includes(m)
}
