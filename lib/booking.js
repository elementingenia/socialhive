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


// "Day-before" event reminder (2026-07-26). A confirmed booking is due a
// reminder once, the day before the event happens -- waitlisted/cancelled
// bookings never get one (no guaranteed seat), a contact-owned booking
// (member_id null) is skipped since there's no member account to notify,
// and an archived event never qualifies. tomorrowStr must be the caller's
// "tomorrow" as YYYY-MM-DD (events.event_date's own format) so this stays
// pure/testable rather than reaching for Date.now() itself.
export function eventReminderDue(event, booking, tomorrowStr) {
  if (!event || !booking) return false
  if (event.archived) return false
  if (booking.status !== "confirmed") return false
  if (!booking.member_id) return false
  if (booking.event_reminded_at) return false
  return event.event_date === tomorrowStr
}
