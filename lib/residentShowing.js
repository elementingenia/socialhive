// Show Time: any resident can add a showing (Iain, 2026-10-07).
// Scope: claude/Element_Happenings_ShowTime_Resident_Events_Scope_Answered.md
//
// Pure rules only (no I/O) so they run under plain Node in
// tests/unit/residentShowing.test.mjs. app/api/screenings/resident/route.js is
// the only writer and calls these.

import { sydneyTodayStr, sydneyNowTimeStr } from "./date.js"
import { cleanVillageLocation } from "./eventLocation.js"
import { UNLIMITED_SEATS } from "./bookingMode.js"

// hub_settings row holding the admin On/Off switch (migration 131).
export const WIZARD_HUB_TYPE = "showtime_resident_events"

// Fallback when the Cinema location has no capacity set (Admin > Locations).
export const DEFAULT_CINEMA_CAPACITY = 20
export const DEFAULT_MAX_PER_BOOKING = 4
export const SHOWING_TITLE_MAX = 80

// Who to tell about the new showing (wizard question 5).
export const NOTIFY_CHOICES = ["all", "members", "none"]

/** Seats in the Cinema: its own capacity, else 20. */
export function cinemaCapacity(location) {
  const c = Number(location?.capacity)
  return Number.isInteger(c) && c > 0 ? c : DEFAULT_CINEMA_CAPACITY
}

// "In the village" showings (Iain, 2026-10-31): a seat limit the organiser
// types, No limit, or Optional (no need to book). Cinema showings keep the
// Cinema's own capacity and always require booking.
export const VILLAGE_SEATS_MAX = 500
export const VILLAGE_BOOKING_MODES = ["limit", "nolimit", "optional"]

/**
 * Where the showing is and how it takes bookings. Returns
 * { village, location, booking_optional, seats_unlimited, capacity } or { error }.
 * capacity is the seat limit used for checks (UNLIMITED_SEATS when none).
 */
export function showingPlace(input = {}, { cinemaCapacity: cinemaCap = DEFAULT_CINEMA_CAPACITY } = {}) {
  if (input.location_type !== "village") {
    return { village: false, location: null, booking_optional: false, seats_unlimited: false, capacity: cinemaCap }
  }
  const location = cleanVillageLocation(input.location)
  if (!location) return { error: "Say where in the village it is" }
  const optional = input.booking_optional === true
  const unlimited = optional || input.seats_unlimited === true
  if (unlimited) {
    return { village: true, location, booking_optional: optional, seats_unlimited: true, capacity: UNLIMITED_SEATS }
  }
  const n = Number(input.max_seats)
  if (!Number.isInteger(n) || n < 1 || n > VILLAGE_SEATS_MAX) {
    return { error: `Say how many seats (1 to ${VILLAGE_SEATS_MAX}), or choose No limit` }
  }
  return { village: true, location, booking_optional: false, seats_unlimited: false, capacity: n }
}

/** While the switch is off only admins and Show Time Owners can use it. */
export function canUseWizard({ enabled, isManager }) {
  return !!isManager || !!enabled
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}/

/**
 * Validate a wizard submission. Returns an error string, or null.
 * Checks run in the order the questions are asked, so the first problem
 * reported is the earliest step that needs fixing.
 */
export function validateResidentShowing(input = {}, { capacity = DEFAULT_CINEMA_CAPACITY, isPrivate = false, village = false, now = new Date() } = {}) {
  const {
    ingenia_confirmed, movie_id, showing_title, event_date, event_time,
    event_end_time, seats_kept, notify, privacy_ack, repeat, content_later,
  } = input
  // A repeating showing may leave its first date "To be announced"
  // (Iain, 2026-10-10). A one-off showing must always say what's on.
  const tbaOk = !!repeat && content_later === true

  if (isPrivate && privacy_ack !== true) {
    return "Your name will be shown as the organiser and coordinator. Please confirm you're happy with that."
  }
  // The Ingenia booking is for the Cinema; a village spot needs none.
  if (!village && ingenia_confirmed !== true) {
    return "The Cinema can't be used without a booking in the Ingenia app. Book it there first."
  }

  const title = (showing_title || "").trim()
  if (!movie_id && !title && !tbaOk) return "Say what you're showing"
  if (!movie_id && title.length > SHOWING_TITLE_MAX) return `Keep the title under ${SHOWING_TITLE_MAX} characters`

  if (!event_date || !DATE_RE.test(event_date)) return "Choose a date"
  if (!event_time || !TIME_RE.test(event_time)) return "Choose a start time"
  if (!event_end_time || !TIME_RE.test(event_end_time)) return "Choose an expected end time"
  const today = sydneyTodayStr(now)
  if (event_date < today) return "That date has already passed"
  if (event_date === today && event_time.slice(0, 5) <= sydneyNowTimeStr(now)) {
    return "That start time has already passed"
  }
  if (event_end_time.slice(0, 5) <= event_time.slice(0, 5)) return "The end time must be after the start time"

  const kept = Number(seats_kept)
  if (!Number.isInteger(kept) || kept < 0) return "Say how many seats you're keeping (0 or more)"
  if (kept > capacity) return village ? `There are only ${capacity} seats` : `The Cinema only has ${capacity} seats`

  if (!NOTIFY_CHOICES.includes(notify)) return "Choose who to notify"
  return null
}

/**
 * "All residents" audience: active, signed in at least once, not a test
 * account, and not anyone in excludeIds (the creator, and the Owners who get
 * their own notification).
 */
export function allResidentsAudience(members, excludeIds = []) {
  const skip = new Set(excludeIds.filter(Boolean))
  return (members || [])
    .filter(m => m && m.status === "active" && !!m.auth_id && !m.is_test && !skip.has(m.id))
    .map(m => m.id)
}

/**
 * Coordinator list on an edit. Admins and Owners may leave a screening with no
 * coordinator (as before); a coordinator who isn't an admin/Owner must leave
 * at least one, so the showing is never orphaned by its own organiser.
 * Returns { ids } or { error }.
 */
export function resolveCoordinatorIds({ coordinator_ids, coordinator_id }, { isManager }) {
  const raw = Array.isArray(coordinator_ids) ? coordinator_ids : (coordinator_id ? [coordinator_id] : [])
  const ids = [...new Set(raw.filter(Boolean))]
  if (!isManager && ids.length === 0) {
    return { error: "Keep at least one coordinator on this showing" }
  }
  return { ids }
}

/** Short date for notification text, e.g. "Sat 11 Oct". */
export function shortDate(dateStr) {
  if (!dateStr) return ""
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
}
