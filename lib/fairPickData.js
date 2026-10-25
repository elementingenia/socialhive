import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { sydneyTodayStr, sydneyDateStrPlusDays } from "@/lib/date"
import { ATTENDANCE_DAYS } from "@/lib/fairPick"

// Server-side data loading for Show Time "Fair Pick" (lib/fairPick.js holds
// the rules). Service role -- callers must check Admin/Show Time Owner first.

const PAGE = 1000

// PostgREST caps a select at 1000 rows; votes will pass that.
async function fetchAll(build) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < PAGE) return out
  }
}

export async function loadVotes() {
  return fetchAll(() => supa.from("votes").select("movie_id, member_id, score").order("id"))
}

// { [memberId]: film screenings attended } -- on a past, non-cancelled Show
// Time event linked to a film (events.movie_id set) in the last
// ATTENDANCE_DAYS days. Only films count (Iain, 2026-10-26): sport
// broadcasts, app demos and "How to" sessions say nothing about how someone
// votes on movies. Attended means either:
//   - their own confirmed booking, or
//   - named as a resident seat (booking_attendees.member_id) on someone
//     else's confirmed booking for that event.
// The second case matters: a partner booked onto the other's booking has no
// booking row of their own (Iain, 2026-10-26: Annie Pallot showed 0 despite
// coming to most screenings). The app has no check-in, so a confirmed
// booking is the best available measure of attending.
export async function loadAttendance() {
  const today = sydneyTodayStr()
  const from = sydneyDateStrPlusDays(-ATTENDANCE_DAYS)
  const rows = await fetchAll(() => supa.from("bookings")
    .select("member_id, contact_id, event_id, events!inner(event_date, hub_type, archived, movie_id)")
    .eq("status", "confirmed")
    .eq("events.hub_type", "movie")
    .not("events.movie_id", "is", null)
    .eq("events.archived", false)
    .lt("events.event_date", today)
    .gte("events.event_date", from)
    .order("id"))
  const seen = {}
  const add = (memberId, eventId) => {
    const s = seen[memberId] || (seen[memberId] = new Set())
    s.add(eventId)
  }
  // Confirmed booking owners per event (resident or contact owner).
  const owners = new Set()
  const eventIds = new Set()
  for (const r of rows) {
    eventIds.add(r.event_id)
    if (r.member_id) { add(r.member_id, r.event_id); owners.add(`${r.event_id}|m|${r.member_id}`) }
    if (r.contact_id) owners.add(`${r.event_id}|c|${r.contact_id}`)
  }
  // Resident seats named on those confirmed bookings.
  const ids = [...eventIds]
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supa.from("booking_attendees")
      .select("event_id, owner_id, owner_contact_id, member_id")
      .in("event_id", ids.slice(i, i + 200))
      .not("member_id", "is", null)
    if (error) throw new Error(error.message)
    for (const a of data || []) {
      const ok = (a.owner_id && owners.has(`${a.event_id}|m|${a.owner_id}`)) ||
                 (a.owner_contact_id && owners.has(`${a.event_id}|c|${a.owner_contact_id}`))
      if (ok) add(a.member_id, a.event_id)
    }
  }
  const out = {}
  for (const [id, s] of Object.entries(seen)) out[id] = s.size
  return out
}

// { [movieId]: { lastShown, upcoming } } from non-cancelled events.
export async function loadShowings() {
  const today = sydneyTodayStr()
  const rows = await fetchAll(() => supa.from("events")
    .select("movie_id, event_date")
    .not("movie_id", "is", null)
    .eq("archived", false)
    .order("id"))
  const out = {}
  for (const r of rows) {
    const s = out[r.movie_id] || (out[r.movie_id] = { lastShown: null, upcoming: false })
    if (r.event_date >= today) s.upcoming = true
    else if (!s.lastShown || r.event_date > s.lastShown) s.lastShown = r.event_date
  }
  return out
}
