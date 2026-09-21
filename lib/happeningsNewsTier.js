// lib/happeningsNewsTier.js — pure logic only (no Supabase import), unit
// tested directly without a live DB connection. Mirrors the existing
// pure/DB-wrapper split (lib/voting.js, lib/committeeAudience.js): anything
// that's just a decision given some inputs lives here; anything that needs
// to hit the database lives in lib/happeningsNewsAuth.js.

/**
 * Preview/Production independence (same two-flag pattern the discarded
 * Noticeboard build introduced, carried forward here -- see migration 112's
 * header comment). `settingsRow` is the hub_settings row for hub_type
 * 'happenings_news': { enabled, production_enabled }.
 */
export function isHappeningsNewsLive(settingsRow) {
  const isProduction = process.env.VERCEL_ENV === 'production'
  if (!settingsRow) return false
  return isProduction ? !!settingsRow.production_enabled : !!settingsRow.enabled
}

/** The three hardcoded archive-delay choices -- no free-text/custom value. */
export const ARCHIVE_DELAY_OPTIONS = [30, 90, 150]

export function isValidArchiveDelay(days) {
  return ARCHIVE_DELAY_OPTIONS.includes(Number(days))
}

/** Max photos allowed on a single post -- confirmed with Iain 2026-09-21. */
export const MAX_PHOTOS_PER_POST = 10

// Storage bucket for post photos -- create this by hand in the Supabase
// dashboard before shipping (see migration 112's header comment; no
// migration in this repo creates a bucket via SQL, they're all created
// once by hand, same as 'event-images').
export const PHOTOS_BUCKET = "happenings-news-images"

/** Max article length -- confirmed with Iain 2026-09-21 (sample lengths shown, chose 1000). */
export const MAX_CONTENT_LENGTH = 1000

export function isValidContentLength(content) {
  return typeof content === 'string' && content.trim().length > 0 && content.length <= MAX_CONTENT_LENGTH
}

/**
 * Has a post aged past its hub's archive delay? `createdAt` is the post's
 * created_at (ISO string or Date), `archiveDays` is the hub's configured
 * delay (30/90/150), `now` is injectable for testing.
 */
export function isPostDueForArchive(createdAt, archiveDays, now = new Date()) {
  if (!createdAt || !archiveDays) return false
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt)
  if (isNaN(created.getTime())) return false
  const dueAt = new Date(created.getTime() + archiveDays * 24 * 60 * 60 * 1000)
  return now.getTime() >= dueAt.getTime()
}

/**
 * A friendly label for a post's origin (hub or specific club), for the
 * per-row tag in the flat chronological Happenings News feed. `event` needs
 * hub_type and, when it's a club event, the club's name (already joined by
 * the caller -- this function does no I/O).
 */
const HUB_TYPE_LABELS = {
  movie: 'Show Time',
  social: 'Social',
  special: 'Special Events',
  space: 'Book a Space',
  bookclub: 'Groups & Clubs', // legacy hub_type, pre-dates the generic Clubs engine
}

export function originLabel({ hubType, clubName }) {
  if (clubName) return clubName
  return HUB_TYPE_LABELS[hubType] || hubType || 'Happenings'
}
