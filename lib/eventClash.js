// Event Clash Warning & Space (Common Area) Double-Booking — shared server-side
// logic. Scope: Social_Hive_Event_Clash_Space_Booking_Scope.md (decisions
// locked 2026-07-23). Used by every route that creates/edits an event
// (clubs, social, screenings) so the rules can't drift between hubs.
//
// Two independent checks:
//   - findSameDateEvents: soft warning (A) — any other event on the same
//     date, any hub, regardless of location/time. Global by design (Iain).
//   - findSpaceConflict:  hard block (B) — only for onsite events with a real
//     common space (not "Resident's Home") that both carry a start AND end
//     time. Events missing an end time are silently skipped from this check
//     (locked decision: no retroactive backfill, §4) rather than blocking or
//     erroring — they simply aren't checkable until next edited.

// The onsite location dropdown includes a "Resident's Home" entry for
// on-site-but-private gatherings — technically `location_type: 'onsite'` but
// not a shared resource, so it's exempt from end-time/space-clash rules
// exactly like a true off-site event. Matched by name (not id) so it keeps
// working even if the id ever changes; case-insensitive, apostrophe-agnostic.
export function isResidentsHome(locationName) {
  return /resident/i.test(locationName || "")
}

// Does this event need an end time / participate in the space-clash check?
export function needsSpaceValidation({ location_type, locationName }) {
  return location_type === "onsite" && !isResidentsHome(locationName)
}

// Soft warning (A): any other non-archived event on the same date, any hub.
export async function findSameDateEvents(db, { event_date, exclude_event_id }) {
  if (!event_date) return []
  let q = db.from("events")
    .select("id, title, hub_type")
    .eq("event_date", event_date)
    .eq("archived", false)
    .limit(5)
  if (exclude_event_id) q = q.neq("id", exclude_event_id)
  const { data } = await q
  return data || []
}

// Hard block (B): another non-archived event in the SAME location_id, on the
// SAME date, whose [event_time, event_end_time) window overlaps this one's.
// Returns the first conflicting event (with its window) or null.
export async function findSpaceConflict(db, { location_id, event_date, event_time, event_end_time, exclude_event_id }) {
  if (!location_id || !event_date || !event_time || !event_end_time) return null // nothing to compare against

  let q = db.from("events")
    .select("id, title, hub_type, event_time, event_end_time")
    .eq("location_id", location_id)
    .eq("event_date", event_date)
    .eq("archived", false)
    .not("event_time", "is", null)
    .not("event_end_time", "is", null)
  if (exclude_event_id) q = q.neq("id", exclude_event_id)
  const { data } = await q
  if (!data?.length) return null

  const start = event_time.slice(0, 5), end = event_end_time.slice(0, 5)
  for (const other of data) {
    const oStart = (other.event_time || "").slice(0, 5)
    const oEnd = (other.event_end_time || "").slice(0, 5)
    if (!oStart || !oEnd) continue
    // [start,end) overlaps [oStart,oEnd) when start < oEnd && oStart < end.
    if (start < oEnd && oStart < end) return other
  }
  return null
}

// Friendly message for the hard-block rejection.
export function spaceConflictMessage(locationName, conflict) {
  return `${locationName || "That space"} is already booked ${fmtTime(conflict.event_time)}–${fmtTime(conflict.event_end_time)} that day for "${conflict.title || "another event"}".`
}

// Resolve a location's stable id from the name the (unchanged) dropdown
// already sends. Looked up at write time and stored on the event — this is
// what makes the space-clash check immune to a later rename (Iain: "build
// with proper database IDs so the name can be edited without breaking the
// binding to that location"), without needing to retrofit the location
// pickers themselves to speak in ids.
export async function resolveLocationId(db, locationName) {
  if (!locationName) return null
  const { data } = await db.from("locations").select("id").eq("name", locationName).maybeSingle()
  return data?.id || null
}

function fmtTime(t) {
  if (!t) return ""
  const [h, m] = t.slice(0, 5).split(":").map(Number)
  const period = h >= 12 ? "pm" : "am"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`
}
