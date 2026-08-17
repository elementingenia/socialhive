// lib/spaceBookings.js — Personal Space Booking: I/O helpers for
// space_bookings. Scope: Social_Hive_Personal_Space_Booking_Scope.md
// (decisions locked 2026-08-01).
//
// A personal space booking must clash-check in BOTH directions, because
// events and space_bookings are two independent tables that have never known
// about each other (migration 072 built space_bookings; nothing has ever
// written to it until this feature):
//   - against `events`         — reuses findSpaceConflict(), the exact same
//                                 function Show Time/Social/Clubs already use.
//   - against `space_bookings` — new: findSpaceBookingConflict() below.
//
// This is deliberately the SMALLER of the two fixes discussed in the scope
// doc ("Option A — additive cross-check"). It does not make space_bookings
// authoritative for events (that's "Option B", parked for the foundation
// rebuild wipe) — it just makes the two tables check each other so a
// personal booking and an event can't silently double-book the same room.

import { findSpaceConflict, spaceConflictMessage, fmtTime } from './eventClash.js'
import { closureMessage, sydneyOffsetMinutes, toInstant } from './spaces.js'
import { resolveMemberName } from './memberName.js'
import { isoToSydneyHHMM } from './date.js'

export const BOOKING_REASON_MAX = 200
export const INGENIA_CONFIRMED_BY_MAX = 150

/**
 * Validation for the personal booking form. Returns an error string, or null
 * when valid. Deliberately requires BOTH a start and an end time — Iain's
 * request said "Date and Time" (singular), but the clash check is a range
 * comparison, so a single timestamp can't be checked against it.
 */
export function validateSpaceBooking({ location_id, event_date, event_time, event_end_time, reason } = {}) {
  if (!location_id) return 'Choose a space'
  if (!event_date) return 'Choose a date'
  if (!event_time || !event_end_time) return 'Choose a start and end time'
  if (event_end_time <= event_time) return 'End time must be after the start time'
  const r = (reason || '').trim()
  if (!r) return 'Say what the space is for'
  if (r.length > BOOKING_REASON_MAX) {
    return `Keep it to ${BOOKING_REASON_MAX} characters or fewer (currently ${r.length})`
  }
  return null
}

// "Request Only" locations (Iain, 2026-08-04). Personal Space Booking is
// for personal use, independent of any hub -- so unlike event creation
// (screenings/social/clubs, where an Admin is trusted because the booking
// is inherently community-based) there is NO admin exemption here. Anyone
// booking a Request Only room for themselves, admin or not, must self-
// declare Ingenia's sign-off before the booking is even accepted. Iain,
// 2026-08-04: "we are talking about Admins creating events not Admins as
// individuals ... any individual booking a space outside a HUB or Groups/
// club is treated the same way." Mirrors the shape of the DB's own CHECK
// constraint (migration 077) so a bad request never even reaches the
// insert.
export function validateIngeniaConfirmation({ requestOnly, ingeniaConfirmed, ingeniaConfirmedBy } = {}) {
  if (!requestOnly) return null
  if (!ingeniaConfirmed) return "Confirm you've checked with the Ingenia Community Manager before booking this space"
  const who = (ingeniaConfirmedBy || '').trim()
  if (!who) return 'Enter who at Ingenia confirmed this'
  if (who.length > INGENIA_CONFIRMED_BY_MAX) {
    return `Keep it to ${INGENIA_CONFIRMED_BY_MAX} characters or fewer (currently ${who.length})`
  }
  return null
}


// Hard block: another CONFIRMED space_booking in the same room whose
// [starts_at, ends_at) window overlaps this one's. Mirrors findSpaceConflict's
// shape and error-handling exactly — THROW, don't swallow, same reasoning as
// the comment on findSpaceConflict: a discarded error must never read as "no
// conflict, go ahead".
export async function findSpaceBookingConflict(db, { location_id, starts_at, ends_at, exclude_booking_id }) {
  if (!location_id || !starts_at || !ends_at) return null

  let q = db.from('space_bookings')
    .select('id, title, purpose, starts_at, ends_at, event_id, booked_by, member:members!booked_by(id, name, display_name, hide_name)')
    .eq('location_id', location_id)
    .eq('status', 'confirmed')
    // overlap: existing.starts_at < new.ends_at AND existing.ends_at > new.starts_at
    .lt('starts_at', ends_at)
    .gt('ends_at', starts_at)
  if (exclude_booking_id) q = q.neq('id', exclude_booking_id)

  const { data, error } = await q
  if (error) throw new Error(`Space booking conflict check failed: ${error.message}`)
  return data?.[0] || null
}

// starts_at/ends_at are timestamptz (UTC on the wire from Supabase) — fmtTime
// expects a local "HH:MM" string, the shape event_time/event_end_time already
// are. isoToSydneyHHMM (lib/date.js) converts the UTC instant to Sydney local
// time first so the two message builders (this one and eventClash's) read
// identically to a resident regardless of which table the conflict came from.

// Friendly message for a space_bookings-side rejection.
//
// REVISED (Iain, 2026-08-17, Social_Hive_Location_First_Booking_Scope_v2.md
// item 5): personal bookings used to be fully anonymised here ("another
// booking", never the booker or the reason) per the 2026-08-04 decision.
// That's superseded -- Iain's explicit instruction is that an already-booked
// personal slot follows the SAME rule as every Attendees list in the app:
// resolveMemberName() (Display Name to everyone, Real Name added for an
// admin/EC/Owner viewer, masked to "Resident" if the booker has hide_name
// set), and the booking's reason is shown too (previously only ever shown
// to the booker themselves). `opts` is optional so every existing call site
// keeps working without threading viewer context through immediately --
// omitting it just means Display-Name-only, no Real Name reveal, which is
// still correct for a viewer with no elevated access.
export function spaceBookingConflictMessage(locationName, conflict, opts = {}) {
  const { viewerId = null, canManage = false } = opts
  const space = locationName || 'That space'
  const start = fmtTime(isoToSydneyHHMM(conflict.starts_at))
  const end = fmtTime(isoToSydneyHHMM(conflict.ends_at))

  if (conflict.event_id) {
    const label = conflict.title || 'another event'
    return `${space} is already booked ${start}–${end} that day for ${label}.`
  }
  if (conflict.purpose === 'maintenance') {
    return `${space} is already booked ${start}–${end} that day for scheduled maintenance.`
  }

  const who = resolveMemberName(conflict.member, { viewerId, canManage, selfLabel: 'you', fallback: 'a resident' })
  const reason = (conflict.title || '').trim()
  return reason
    ? `${space} is already booked ${start}–${end} that day by ${who} — ${reason}.`
    : `${space} is already booked ${start}–${end} that day by ${who}.`
}

// Compose a resident's chosen local date + start/end time into the
// starts_at/ends_at timestamptz pair space_bookings actually stores, using
// the correct seasonal (AEST/AEDT) offset rather than a fixed one.
export function toSpaceBookingWindow(dateStr, startTimeStr, endTimeStr) {
  const offset = sydneyOffsetMinutes(dateStr)
  const starts_at = toInstant(dateStr, startTimeStr, offset)
  const ends_at = toInstant(dateStr, endTimeStr, offset)
  if (!starts_at || !ends_at) return null
  return { starts_at: starts_at.toISOString(), ends_at: ends_at.toISOString() }
}

// Combined availability check for ONE location — closure, then both clash
// directions. Used by both listAvailableLocations (positive filter, shown
// before submit) and the create endpoint (authoritative re-check on submit,
// never trust the client's filtered list).
//
// `location` is the full row (id, name, bookable, booking_status,
// closed_from, closed_to, closed_reason). Date/time are passed twice in two
// shapes because the two tables being checked use two different shapes:
// events store local event_date/event_time/event_end_time strings;
// space_bookings stores starts_at/ends_at as timestamptz.
export async function checkSpaceAvailability(db, {
  location, event_date, event_time, event_end_time, starts_at, ends_at, exclude_booking_id,
  viewerId, canManage,
}) {
  if (!location) return { available: false, reason: 'Choose a space' }
  if (location.bookable === false) return { available: false, reason: `${location.name} is not bookable.` }

  const closure = closureMessage(location, event_date)
  if (closure) return { available: false, reason: closure }

  const eventConflict = await findSpaceConflict(db, {
    location_id: location.id, event_date, event_time, event_end_time,
  })
  if (eventConflict) {
    return { available: false, reason: spaceConflictMessage(location.name, eventConflict) }
  }

  const bookingConflict = await findSpaceBookingConflict(db, {
    location_id: location.id, starts_at, ends_at, exclude_booking_id,
  })
  if (bookingConflict) {
    return { available: false, reason: spaceBookingConflictMessage(location.name, bookingConflict, { viewerId, canManage }) }
  }

  return { available: true, reason: null }
}

/**
 * The check every event-creating route (screenings, social, clubs, and the
 * precheck preview) should run instead of findSpaceConflict alone. Calling
 * only the events-vs-events check is exactly the gap this feature exists to
 * close: a personal space booking made through THIS feature would be
 * invisible to an event being created on top of it. Runs the events-vs-
 * events check first (unchanged, same function, same error priority — a
 * genuine event clash is reported before a personal-booking clash), then
 * the events-vs-space_bookings check.
 *
 * Returns null when clear, or { message } when blocked — deliberately NOT
 * the raw conflict row, because the two source tables have different shapes
 * and every call site only ever reads `.message` (verified: social/events,
 * screenings, ClubHome, and the precheck route's client consumers all do
 * `spaceConflict.message` and nothing else).
 */
export async function findAnyRoomConflict(db, {
  location_id, event_date, event_time, event_end_time, exclude_event_id, locationName,
  viewerId, canManage,
}) {
  const eventConflict = await findSpaceConflict(db, { location_id, event_date, event_time, event_end_time, exclude_event_id })
  if (eventConflict) return { message: spaceConflictMessage(locationName, eventConflict) }

  const window = toSpaceBookingWindow(event_date, event_time, event_end_time)
  if (!window) return null // no valid window to compose -- the caller's own validation already rejects this

  const bookingConflict = await findSpaceBookingConflict(db, {
    location_id, starts_at: window.starts_at, ends_at: window.ends_at,
  })
  if (bookingConflict) return { message: spaceBookingConflictMessage(locationName, bookingConflict, { viewerId, canManage }) }

  return null
}

// Soft warning counterpart to eventClash's findSameDateEvents, but for
// PERSONAL space_bookings -- only used by the space booking form itself
// (opt-in via precheck's include_space_bookings flag), since no other hub's
// event form needs to know about personal room bookings.
//
// REVISED (Iain, 2026-08-17, Social_Hive_Location_First_Booking_Scope_v2.md
// item 5): this used to anonymise every other resident's booking completely
// (2026-08-04 decision, now superseded) -- the name/reason are now shown,
// following the same Attendees-list rule as spaceBookingConflictMessage
// above (resolveMemberName; canManage reveals Real Name too). is_own still
// drives the "You" label via selfLabel, same as before.
export async function findSameDatePersonalBookings(db, { event_date, exclude_booking_id, requesting_member_id, canManage }) {
  if (!event_date) return []
  const offset = sydneyOffsetMinutes(event_date)
  const dayStart = toInstant(event_date, '00:00', offset)
  const dayEnd = toInstant(event_date, '23:59', offset)
  if (!dayStart || !dayEnd) return []

  let q = db.from('space_bookings')
    .select('id, title, booked_by, locations(name), member:members!booked_by(id, name, display_name, hide_name)')
    .is('event_id', null)
    .neq('status', 'cancelled')
    .gte('starts_at', dayStart.toISOString())
    .lte('starts_at', dayEnd.toISOString())
    .limit(5)
  if (exclude_booking_id) q = q.neq('id', exclude_booking_id)

  const { data, error } = await q
  if (error) throw new Error(`Same-date personal booking check failed: ${error.message}`)
  return (data || []).map((b) => {
    const is_own = !!requesting_member_id && b.booked_by === requesting_member_id
    return {
      is_own,
      location_name: b.locations?.name || 'a space',
      booked_by_name: resolveMemberName(b.member, {
        viewerId: requesting_member_id, canManage: !!canManage, selfLabel: 'You', fallback: 'a resident',
      }),
      title: b.title || null,
    }
  })
}

// The positive filter behind the booking form's flow (Iain, 2026-08-01: pick
// date/time FIRST, then the location list is filtered to what's actually
// free for that window). Every bookable, non-archived location, each run
// through checkSpaceAvailability in parallel.
export async function listAvailableLocations(db, { event_date, event_time, event_end_time, starts_at, ends_at, viewerId, canManage }) {
  const { data: locations, error } = await db.from('locations')
    .select('id, name, image_url, bookable, booking_status, closed_from, closed_to, closed_reason, request_only')
    .eq('archived', false)
    .eq('bookable', true)
    .order('name')
  if (error) throw new Error(`Could not list locations: ${error.message}`)

  return Promise.all((locations || []).map(async (loc) => {
    const check = await checkSpaceAvailability(db, {
      location: loc, event_date, event_time, event_end_time, starts_at, ends_at, viewerId, canManage,
    })
    return {
      id: loc.id, name: loc.name, image_url: loc.image_url || null,
      available: check.available, reason: check.reason, request_only: !!loc.request_only,
    }
  }))
}
