// Shared reservation cut-off logic (feedback round 2026-07-16, workstream B).
//
// Single source of truth for "have bookings closed for this event?" so the
// server gate (app/api/bookings/route.js) and every hub's booking UI agree.
// NULL / missing reservation_cutoff => never closed by cut-off (the event's
// own past-date handling still applies separately, as it always has).

export function bookingsClosed(event, now = new Date()) {
  const raw = event?.reservation_cutoff
  if (!raw) return false
  const cutoff = new Date(raw)
  if (isNaN(cutoff.getTime())) return false
  return now.getTime() > cutoff.getTime()
}

// <input type="datetime-local"> <-> stored TIMESTAMPTZ (ISO/UTC) conversion.
// The input works in the browser's local zone (residents/admins are AEST/AEDT),
// so new Date(localValue) reads it as local and toISOString() stores correct UTC.
export function cutoffToInputValue(iso) {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function cutoffFromInputValue(v) {
  if (!v) return null
  const d = new Date(v)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

// Friendly one-line label, e.g. "Bookings close Fri 18 Jul, 5:00 pm".
export function cutoffLabel(iso) {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
}

// Bookings Close is a DATE, not a datetime (Iain 2026-07-18) — "close on the
// 20th" means bookings stay open through the whole of the 20th, so a date maps
// to the END of that local day.
export function cutoffToDateValue(iso) {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function cutoffFromDateValue(v) {
  if (!v) return null
  const [y, m, d] = v.split("-").map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString()
}
