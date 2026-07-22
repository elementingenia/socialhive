// Server-only: materialise a series' occurrences as real `events` rows.
// Scope: Social_Hive_Recurring_Events_Scope.md §3/§5. Idempotent — only creates
// dates that don't already have a live occurrence, so it's safe to call on
// create AND repeatedly from the daily top-up cron.
//
// mode='pattern' series (content-defined clubs, Book Club — §7a) generate
// NOTHING; the rule is only used to pre-fill the next single-event date in the UI.
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { generateOccurrences } from "@/lib/recurrence"

function todayISO() { return new Date().toISOString().slice(0, 10) }

// Map a series' template fields onto a concrete event row for one date.
function occurrencePayload(series, date) {
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
    image_url: series.image_url || null,
    image_focal_x: series.image_focal_x ?? null,
    image_focal_y: series.image_focal_y ?? null,
    max_seats: series.max_seats ?? 20,
    max_seats_per_booking: series.max_seats_per_booking ?? 1,
    allow_nonresident_guests: !!series.allow_nonresident_guests,
    payment_required: !!series.payment_required,
    cost: series.payment_required ? (series.cost ?? 0) : 0,
    bring_category_ids: series.bring_category_ids || null,
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
export async function generateSeriesEvents(series) {
  if (!series || series.status !== "active" || series.mode !== "series") {
    return { created: 0, dates: [] }
  }

  const targetDates = generateOccurrences(series, { from: todayISO() })
  if (!targetDates.length) return { created: 0, dates: [] }

  // Dates this series already has a (non-archived) occurrence for — never double up.
  const { data: existing } = await supabaseAdmin
    .from("events")
    .select("event_date")
    .eq("series_id", series.id)
    .eq("archived", false)
  const have = new Set((existing || []).map(e => e.event_date))

  const missing = targetDates.filter(d => !have.has(d))
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

  return { created: inserted?.length || 0, dates: (inserted || []).map(e => e.event_date) }
}
