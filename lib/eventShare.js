// lib/eventShare.js — shared helpers for Event Deep Linking + Add to Calendar.
// Scope: Event_Deep_Linking_and_Calendar_Scope_v2 (decisions confirmed by
// Iain, 2026-09-13). Both features are EVENT-level, not booking-level -- see
// components/EventShareActions.js for the UI that uses these.
//
// Kept dependency-free (no new npm packages) -- iCalendar VEVENT and a Google
// Calendar render:// URL are both plain text/query-string formats, no library
// needed for either.

import { toInstant, sydneyOffsetMinutes } from './spaces.js'

// No duration is tracked anywhere in the schema today (checked: no `duration`
// column on events, space_bookings, or anywhere else) -- per the scope doc,
// "a sensible default end time if no duration is tracked". 2 hours covers the
// common case (a screening, a social event, a club meeting) without underselling
// the block on a resident's own calendar.
export const DEFAULT_EVENT_DURATION_MINUTES = 120

// Calendar entry description bodies are for the resident's own reference only
// -- per the scope doc, "Not included: attendee names, payment/coordinator
// info, or anything considered private". A long rich-text event description
// doesn't belong in the invite body either ("needs a sensible truncation
// rule") -- this is that rule.
export const CALENDAR_DESCRIPTION_MAX = 280

/**
 * Map an `events`-table row to its own hub's canonical list-page path -- the
 * deterministic hub_type -> URL mapping every hub page itself already uses
 * as its `shareBasePath` (see each page's own <EventSlideOut shareBasePath=.../>).
 * Used where an event is reached WITHOUT already knowing which hub page it
 * came from -- currently just app/cal/page.js's anonymous deep-link view,
 * so a link copied forward from there still points at the event's real hub,
 * not back at /cal.
 */
export function hubPathForEvent(event) {
  if (!event) return null
  if (event.club?.slug) return `/clubs/${event.club.slug}`
  switch (event.hub_type) {
    case 'movie':  return '/screenings'
    case 'social': return '/social/events'
    case 'special': return '/special-events/events'
    case 'space':  return '/spaces/scheduled'
    default: return null
  }
}

/**
 * Build the deep-link URL for an event, given the hub's own base path (e.g.
 * "/screenings", "/social/events", "/clubs/movie-buffs") and the event id.
 * Absolute when `window` is available (browser), otherwise falls back to a
 * relative path -- callers that need an absolute URL for a calendar entry
 * should only ever call this client-side.
 */
export function buildShareUrl(basePath, eventId) {
  const path = `${basePath}?event=${encodeURIComponent(eventId)}`
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`
  }
  return path
}

/** Same as buildShareUrl, but for a private Book a Space booking (separate
 * table/id-space from `events` -- see app/api/spaces/share/route.js). */
export function buildSpaceBookingShareUrl(basePath, bookingId) {
  const path = `${basePath}?sb=${encodeURIComponent(bookingId)}`
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`
  }
  return path
}

/** Trim a long description down for a calendar invite body, on a word
 * boundary where possible, with a trailing ellipsis when cut. */
export function truncateForCalendar(text, max = CALENDAR_DESCRIPTION_MAX) {
  const clean = (text || '').replace(/<[^>]*>/g, '').trim() // strip any HTML (Social/Special descriptions carry bbToHtml-rendered markup)
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`
}

/**
 * The shared description body for every generated calendar entry -- Google
 * Calendar link and .ics alike. Iain, 2026-09-13 (decision 5): "a notice to
 * that effect is a 'wise' and proactive position" re: the entry not
 * auto-updating if the event changes.
 */
export function buildCalendarDescription({ deepLink, description }) {
  const lines = [
    'Element Happenings — Fullerton Cove',
    `View or manage this event: ${deepLink}`,
    "This calendar entry won't update automatically if the event changes — check the link above for the latest details.",
  ]
  const trimmed = truncateForCalendar(description)
  if (trimmed) lines.splice(1, 0, trimmed)
  return lines.join('\n\n')
}

/**
 * Resolve the [start, end] instants for an `events`-table row (event_date +
 * event_time, Sydney local) into real Date objects, applying the default
 * duration when no end time is known.
 */
export function resolveEventWindow(event, durationMinutes = DEFAULT_EVENT_DURATION_MINUTES) {
  if (!event?.event_date) return null
  const timeStr = event.event_time || '00:00'
  const offset = sydneyOffsetMinutes(event.event_date)
  const start = toInstant(event.event_date, timeStr, offset)
  if (!start) return null
  const end = new Date(start.getTime() + durationMinutes * 60000)
  return { start, end }
}

function pad(n) { return String(n).padStart(2, '0') }

/** 'YYYYMMDDTHHMMSSZ' -- the UTC "floating" form iCalendar/Google both accept. */
function toIcsUtc(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T`
    + `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}

/** Escape text per RFC 5545 §3.3.11 (comma, semicolon, backslash, newline). */
function icsEscape(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

/** Fold a line at 75 octets per RFC 5545 §3.1 so long descriptions/URLs don't
 * get silently mangled by stricter calendar clients. */
function foldLine(line) {
  if (line.length <= 75) return line
  const parts = []
  let rest = line
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75))
    rest = ' ' + rest.slice(75)
  }
  parts.push(rest)
  return parts.join('\r\n')
}

/**
 * Build a minimal, single-VEVENT .ics file's text content.
 * `uid` should be stable per event (e.g. `event-<id>@elementhappenings.com.au`)
 * so re-downloading the same event's .ics updates rather than duplicates it
 * in most calendar apps.
 */
export function buildIcsContent({ uid, title, description, location, start, end }) {
  const now = new Date()
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Element Happenings//Event Deep Linking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsEscape(uid)}`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${icsEscape(title)}`,
  ]
  if (location) lines.push(`LOCATION:${icsEscape(location)}`)
  if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

/** Google Calendar's documented "render" quick-add URL -- no OAuth, no
 * server round-trip, opens Google Calendar's own "add this event" screen. */
export function buildGoogleCalendarUrl({ title, description, location, start, end }) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || '',
    dates: `${toIcsUtc(start)}/${toIcsUtc(end)}`,
  })
  if (description) params.set('details', description)
  if (location) params.set('location', location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** Trigger a browser download of .ics text as a file -- shared so every
 * caller downloads with the same filename convention/mime type. */
export function downloadIcs(filenameBase, icsContent) {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filenameBase.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
