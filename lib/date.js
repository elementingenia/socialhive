// lib/date.js — the single source of truth for "what date/time is it right now
// for this community" (Australia/Sydney) and for past/future comparisons
// against event_date/event_time.
//
// Why this exists (2026-08-09): "today" was being computed independently at
// 16+ call sites via `new Date().toISOString().split('T')[0]` or similar.
// toISOString() is always UTC. Sydney is UTC+10 (AEST) / UTC+11 (AEDT), so
// that pattern silently returns YESTERDAY's date for part or all of every
// Sydney day, depending on exactly how it was written:
//   - `new Date().toISOString().split('T')[0]` -- wrong for ~10-11 hours
//     every morning (until UTC catches up to the same calendar day).
//   - `new Date(); d.setHours(0,0,0,0); d.toISOString().slice(0,10)` -- wrong
//     ALL DAY, every day (local midnight converted to UTC always lands in
//     the previous UTC calendar day for a positive-offset timezone).
// Symptom that surfaced this: a screening that had already screened (Ford v
// Ferrari, 2026-08-08 4pm) was still showing as the "next" upcoming event on
// Show Time, because the page's own `.gte('event_date', today)` filter still
// believed "today" was the 8th at 9am on the 9th.
//
// Fix: derive "today" from the IANA Australia/Sydney timezone via Intl
// (DST-correct, no manual UTC-offset math), in exactly one place. Every
// caller that needs "today" or "is this event in the past" imports from here.

const TIME_ZONE = 'Australia/Sydney'

/**
 * Sydney's current calendar date as 'YYYY-MM-DD'. DST-safe: Intl resolves
 * the correct AEST/AEDT offset for "now" itself, so this is correct on both
 * sides of a daylight-saving transition without any hardcoded offset.
 */
export function sydneyTodayStr (now = new Date()) {
  // en-CA gives YYYY-MM-DD directly -- no reformatting needed.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now)
}

/** Sydney's current wall-clock time as 'HH:MM' (24hr), for date+time comparisons. */
export function sydneyNowTimeStr (now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now)
}

/**
 * Convert a timestamptz instant (UTC on the wire from Supabase, e.g.
 * space_bookings.starts_at) into Sydney LOCAL wall-clock 'HH:MM'. Centralised
 * here (2026-08-17) rather than left as a private copy in lib/spaceBookings.js
 * -- the same conversion is now also needed client-side (LocationScheduleView,
 * SpaceBookingForm) to show/compare booking times, and this file is the
 * documented single source of truth for Sydney date/time math. Pure, no I/O,
 * safe to import from client components.
 */
export function isoToSydneyHHMM (iso) {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const hh = parts.find((p) => p.type === 'hour').value
  const mm = parts.find((p) => p.type === 'minute').value
  return `${hh}:${mm}`
}

/** 'YYYY-MM-DD' N days from Sydney's current date (for windowed queries, e.g. +60 days). */
export function sydneyDateStrPlusDays (days, now = new Date()) {
  const [y, m, d] = sydneyTodayStr(now).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/**
 * Is this event's date (and, if given, time) already in the past, as of
 * Sydney's actual current date/time? Prefer this over a bare
 * `event_date >= today` string filter when you also have event_time --
 * it correctly retires an event the moment it starts, not just at the
 * midnight boundary, and it can never be tricked by a UTC/local mismatch
 * because both sides of the comparison are computed the same way.
 */
export function isEventPast (event, now = new Date()) {
  if (!event?.event_date) return false
  const todayStr = sydneyTodayStr(now)
  if (event.event_date < todayStr) return true
  if (event.event_date > todayStr) return false
  // Same calendar day -- only past once its start time has actually passed.
  if (!event.event_time) return false
  return event.event_time.slice(0, 5) <= sydneyNowTimeStr(now)
}

/** Is this event today (Sydney) or later? Inverse convenience for `.gte`-style filters. */
export function isEventUpcoming (event, now = new Date()) {
  return !isEventPast(event, now)
}

/**
 * Parse a 'YYYY-MM-DD' date-only string into a local calendar Date
 * (midnight in the *browser's* timezone) -- the existing, correct pattern
 * already used across the app for rendering, just centralised. Do not use
 * `new Date(dateStr)` directly on a date-only string -- that parses as UTC
 * midnight and can render as the previous day in a timezone behind UTC.
 */
export function localDateFromStr (dateStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  if (![y, m, d].every(Number.isFinite)) return null
  return new Date(y, m - 1, d)
}
