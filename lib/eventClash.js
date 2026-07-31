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

// Some onsite entries aren't shared resources — "Resident's Home" is
// on-site-but-private — so they're exempt from the end-time requirement and
// from space-clash checking, exactly like a true off-site event.
//
// This USED to be `/resident/i.test(locationName)`, which over-matched badly:
// "P-resident" contains "resident", so a room called "President's Suite",
// "Presidents Lounge" or "Vice-President Room" was silently exempted from every
// space rule. An admin could create one from the Locations screen at any time.
//
// It is now `locations.bookable` (migration 071) — a property of the room,
// stored on the room. Defaults to TRUE when unknown, so an unrecognised
// location fails CLOSED (still needs an end time, still clash-checked) rather
// than silently skipping every rule.
export function needsSpaceValidation({ location_type, bookable }) {
  return location_type === "onsite" && bookable !== false
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
  const { data, error } = await q
  if (error) throw new Error(`Same-date event check failed: ${error.message}`)
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
  // THROW, don't swallow. This used to be `const { data } = await q`, discarding
  // `error`, so any query failure produced data = null and read as "no conflict,
  // go ahead" — a double-booking with nothing in the logs. Failing loudly is the
  // only safe default for a check whose whole job is to say no.
  const { data, error } = await q
  if (error) throw new Error(`Space conflict check failed: ${error.message}`)
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

// ── Looking a location up ───────────────────────────────────────────────────
//
// BY ID is now the only way an event's space is resolved on write. The previous
// design looked the id up FROM THE NAME at write time, with the stated aim of
// making the binding survive a rename "without needing to retrofit the location
// pickers to speak in ids". That shortcut is exactly what defeated the aim:
// after a rename the stored name no longer matched any row, the lookup returned
// null, and the next save silently wrote location_id = NULL — unbooking the room
// and dropping the event out of clash checking, with no error anywhere.
//
// Now the picker sends the id, the id is stored, and the NAME is derived from
// the row. events.location remains only as a display copy, kept in step by the
// trigger in migration 071.
export async function fetchLocation(db, locationId) {
  if (!locationId) return null
  const { data, error } = await db
    .from("locations").select("id, name, bookable").eq("id", locationId).maybeSingle()
  if (error) throw new Error(`Could not read location ${locationId}: ${error.message}`)
  return data || null
}

// BY NAME. Retained for the one caller that legitimately has a name and no id:
// Movies hardcodes CINEMA_NAME. Safe since migration 071 added a unique index on
// lower(trim(name)) — before that, two same-named rows made maybeSingle() error,
// and the caller read only `data`, turning it into a null "no space booked".
export async function resolveLocationByName(db, locationName) {
  if (!locationName) return null
  const { data, error } = await db
    .from("locations").select("id, name, bookable").eq("name", locationName).maybeSingle()
  if (error) throw new Error(`Could not resolve location "${locationName}": ${error.message}`)
  return data || null
}

// The venue a hub nominates for its events (migration 073). Replaces the
// hardcoded CINEMA_NAME in api/screenings: Movies is preset to the Cinema but a
// Hub Owner or Admin can change it, so an outdoor screening — or a second
// community whose cinema is called something else — is expressible.
//
// ⚠ hub_settings.hub_type is 'movies' (plural); events.hub_type is 'movie'
// (singular). Pass the hub_settings spelling.
//
// Falls back to the supplied name when no venue is nominated, so a hub with no
// settings row keeps working exactly as it did before.
export async function hubLocation(db, hubType, fallbackName) {
  const { data, error } = await db
    .from("hub_settings").select("location_id").eq("hub_type", hubType).maybeSingle()
  if (error) throw new Error(`Could not read ${hubType} hub settings: ${error.message}`)
  if (data?.location_id) {
    const loc = await fetchLocation(db, data.location_id)
    if (loc) return loc
    // Nominated venue has since been deleted (the FK nulls it, but a stale read
    // is possible) — fall through rather than booking nothing.
  }
  return fallbackName ? await resolveLocationByName(db, fallbackName) : null
}

function fmtTime(t) {
  if (!t) return ""
  const [h, m] = t.slice(0, 5).split(":").map(Number)
  const period = h >= 12 ? "pm" : "am"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`
}
