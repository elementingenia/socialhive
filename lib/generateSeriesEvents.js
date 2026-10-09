// Server-only: materialise a series' occurrences as real `events` rows.
// Scope: Social_Hive_Recurring_Events_Scope.md §3/§5. Idempotent — only creates
// dates that don't already have a live occurrence, so it's safe to call on
// create AND repeatedly from the daily top-up cron.
//
// mode='pattern' series (content-defined clubs, Book Club — §7a) generate
// NOTHING; the rule is only used to pre-fill the next single-event date in the UI.
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { generateOccurrences } from "@/lib/recurrence"
import { sydneyTodayStr } from "./date.js"
import { findAnyRoomConflict } from "@/lib/spaceBookings"
import { TBA_TITLE, MAX_DATES_AHEAD, DEFAULT_DATES_AHEAD } from "./showtimeSeries.js"

function todayISO() { return sydneyTodayStr() }

// Show Time series (migration 135, Iain 2026-10-10): every date is born
// "To be announced" -- the coordinator sets what's showing on each date later.
function showtimePayload(series, date) {
  return {
    hub_type: "movie",
    club_id: null,
    series_id: series.id,
    is_series_exception: false,
    event_date: date,
    event_time: series.event_time || "00:00",
    event_end_time: series.event_end_time || null,
    title: TBA_TITLE,
    showing_name: series.showing_name || null,
    content_tba: true,
    movie_id: null,
    movie_snapshot: null,
    location_type: "onsite",
    location: series.location || null,
    location_id: series.location_id || null,
    max_seats: series.max_seats ?? 20,
    max_seats_per_booking: series.max_seats_per_booking ?? 4,
    reservation_cutoff: null,
    allow_nonresident_guests: series.allow_nonresident_guests !== false,
    require_attendee_names: false,
    notes: null,
    created_by: series.created_by || null,
    is_public: false,
    ingenia_confirmed: !!series.ingenia_confirmed,
    archived: false,
  }
}

// Map a series' template fields onto a concrete event row for one date.
function occurrencePayload(series, date) {
  if (series.hub_type === "movie") return showtimePayload(series, date)
  return {
    hub_type: "club",
    club_id: series.club_id,
    series_id: series.id,
    is_series_exception: false,
    event_date: date,
    event_time: series.event_time || "00:00",
    title: series.title || "Club Event",
    description: series.description || null,
    welcome_message: series.welcome_message || null,
    location_type: series.location_type || "onsite",
    location: series.location || null,
    // Added 2026-09-15 (migration 107) -- event_series had no columns to
    // carry these at all until now, so every generated occurrence was born
    // with Venue/End Time permanently blank, forcing re-entry on every
    // edit. Now that the template can hold them, copy them across the same
    // way location_type/location already are.
    location_id: series.location_id || null,
    event_end_time: series.event_end_time || null,
    image_url: series.image_url || null,
    // events.image_focal_x/y are NOT NULL DEFAULT 50 (migration 026), but
    // event_series.image_focal_x/y are nullable with no default (migration
    // 057) -- a series with no image left these null, which explicitly
    // overrode the column's own default and violated the NOT NULL constraint,
    // crashing every POST /api/series and the daily top-up cron for any
    // series without an image (found + fixed 2026-07-23). Fall back to the
    // same 50 the column itself defaults to.
    image_focal_x: series.image_focal_x ?? 50,
    image_focal_y: series.image_focal_y ?? 50,
    max_seats: series.max_seats ?? 20,
    max_seats_per_booking: series.max_seats_per_booking ?? 1,
    booking_required: series.booking_required !== false,
    allow_nonresident_guests: !!series.allow_nonresident_guests,
    require_attendee_names: !!series.require_attendee_names,
    payment_required: !!series.payment_required,
    cost: series.payment_required ? (series.cost ?? 0) : 0,
    bring_category_ids: series.bring_category_ids || [],
    bring_required: !!series.bring_required,
    theme_name: series.theme_name || null,
    is_public: series.is_public !== false,
    show_attendee_names: series.show_attendee_names !== false,
    archived: false,
  }
}

/**
 * Ensure `series` has occurrence rows out to its horizon (capped in
 * lib/recurrence). Returns { created: number, dates: string[] }.
 */
export async function generateSeriesEvents(series, { initial = false } = {}) {
  if (!series || series.status !== "active" || series.mode !== "series") {
    return { created: 0, dates: [] }
  }
  const isShowtime = series.hub_type === "movie"
  // A fixed (not rolling) Show Time run is created once and never topped up.
  if (isShowtime && !series.keep_rolling && !initial) return { created: 0, dates: [] }

  // Show Time keeps a set NUMBER of dates ahead (the creator's choice);
  // Clubs keep a time horizon.
  const targetDates = isShowtime
    ? generateOccurrences({ ...series, horizon_months: 12 }, {
        from: todayISO(),
        count: Math.min(MAX_DATES_AHEAD, series.dates_ahead || DEFAULT_DATES_AHEAD),
      })
    : generateOccurrences(series, { from: todayISO() })
  if (!targetDates.length) return { created: 0, dates: [] }

  // Dates this series already has an occurrence for -- never double up.
  // Show Time also counts cancelled (archived) dates, so a date the
  // coordinator cancelled is never quietly brought back by the top-up.
  let q = supabaseAdmin.from("events").select("event_date").eq("series_id", series.id)
  if (!isShowtime) q = q.eq("archived", false)
  const { data: existing } = await q
  const have = new Set((existing || []).map(e => e.event_date))

  let missing = targetDates.filter(d => !have.has(d))
  // Show Time holds the Cinema: skip a date someone else already has it.
  if (isShowtime && missing.length && series.location_id) {
    const free = []
    for (const d of missing) {
      const clash = await findAnyRoomConflict(supabaseAdmin, {
        location_id: series.location_id, event_date: d,
        event_time: series.event_time, event_end_time: series.event_end_time,
        locationName: series.location || "Cinema", viewerId: series.created_by, canManage: true,
      })
      if (!clash) free.push(d)
    }
    missing = free
  }
  if (!missing.length) return { created: 0, dates: [] }

  const { data: inserted, error } = await supabaseAdmin
    .from("events")
    .insert(missing.map(d => occurrencePayload(series, d)))
    .select("id, event_date")
  if (error) throw new Error(`series occurrence insert failed: ${error.message}`)

  // Stamp the coordinator set onto each new occurrence.
  const ecIds = series.coordinator_ids || []
  if (ecIds.length && inserted?.length) {
    const rows = []
    for (const ev of inserted) for (const mid of ecIds) rows.push({ event_id: ev.id, member_id: mid })
    if (rows.length) await supabaseAdmin.from("event_coordinators").insert(rows)
  }

  // Show Time: the creator's own seats on every date, as a real booking.
  const seats = Number(series.coordinator_seats) || 0
  if (isShowtime && seats > 0 && series.created_by && inserted?.length) {
    const now = new Date().toISOString()
    await supabaseAdmin.from("bookings").insert(inserted.map(ev => ({
      event_id: ev.id, member_id: series.created_by, seats, status: "confirmed",
      booked_at: now, payment_status: "not_required",
    })))
  }

  return { created: inserted?.length || 0, dates: (inserted || []).map(e => e.event_date), events: inserted || [] }
}
