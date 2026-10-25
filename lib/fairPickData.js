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

// { [memberId]: Show Time screenings attended } -- booked (confirmed, not
// cancelled or waitlisted) on a past, non-cancelled Show Time event in the
// last ATTENDANCE_DAYS days. The app has no check-in, so a booking that
// wasn't cancelled is the best available measure of attending.
export async function loadAttendance() {
  const today = sydneyTodayStr()
  const from = sydneyDateStrPlusDays(-ATTENDANCE_DAYS)
  const rows = await fetchAll(() => supa.from("bookings")
    .select("member_id, event_id, events!inner(event_date, hub_type, archived)")
    .eq("status", "confirmed")
    .not("member_id", "is", null)
    .eq("events.hub_type", "movie")
    .eq("events.archived", false)
    .lt("events.event_date", today)
    .gte("events.event_date", from)
    .order("id"))
  const seen = {}
  for (const r of rows) {
    const s = seen[r.member_id] || (seen[r.member_id] = new Set())
    s.add(r.event_id)
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
