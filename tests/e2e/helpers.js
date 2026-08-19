// Shared helpers for E2E specs — fetch live event/booking data directly from
// Supabase so tests assert against whatever content actually exists right now,
// instead of hardcoding a specific movie title/date that will drift stale the
// moment that screening passes or gets rescheduled.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

async function supaGet(path, key) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) {
    throw new Error(`Supabase REST fetch failed (${res.status}) for ${path}\n${await res.text()}`)
  }
  return res.json()
}

// Sydney's calendar date, not UTC's (2026-08-09 fix -- see lib/date.js's
// sydneyTodayStr, which this mirrors; can't import it directly since this
// file is CommonJS and lib/date.js is ESM). new Date().toISOString() is
// UTC, and Sydney is UTC+10/+11, so the old version of this helper agreed
// with the app's own former bug rather than catching it: both independently
// computed "today" as the UTC date, so a screening from the previous Sydney
// day (e.g. Ford v Ferrari, already screened) still passed as "next" to
// both the test oracle and the app under test. Now that the app is fixed,
// this has to be too, or the test asserts against a title the fixed app no
// longer shows.
function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date())
}

// ── Date/time formatting — mirrors the app's own formatting functions so
// assertions match exactly what's rendered, whatever the underlying date is.

// Mirrors app/(app)/movies/page.js: localDate() + fmtDate() + fmtTime()
function localDate(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function fmtDate(str) {
  return localDate(str).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
}
function fmtTime(str) {
  const [h, m] = str.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${hour}:${String(m).padStart(2, '0')}${ampm}`
}

// Mirrors app/(app)/screenings/page.js: fmtDateLong() + fmtTime24()
function fmtDateLong(str) {
  return new Date(str + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).toUpperCase()
}
function fmtTime24(str) {
  const [h, m] = str.split(':').map(Number)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ── Public reads (anon key — same access level the app itself uses client-side) ──

// Whichever movie screening is chronologically next. Used for tests that only
// care "does the Next Screening card render correctly", not tied to any
// particular booking.
async function getNextScreening() {
  const rows = await supaGet(
    `events?select=id,title,event_date,event_time&hub_type=eq.movie&archived=eq.false&event_date=gte.${todayStr()}&order=event_date.asc,event_time.asc&limit=1`,
    SUPABASE_ANON_KEY
  )
  return rows[0] || null
}

// Root cause (2026-08-19): getNextScreening() above -- and the app's own
// Movies Home "Next Screening" tile it mirrors -- picks the chronologically
// soonest non-past movie event with no regard for whether its own
// reservation_cutoff has already passed. That's correct for the tile (it's
// showing what's actually next, closed or not), but it makes any E2E test
// that assumes "the next screening is bookable" fragile against real content
// drift: a real screening can sell out and hit its cutoff (this happened for
// real -- The Guernsey Literary & Potato Peel Pie Society, cutoff 2026-08-16,
// broke the two waitlist-confirmation tests below the moment today passed
// that date, CI stayed red on `main` itself, unrelated to any code change).
// This helper instead finds the soonest upcoming event whose booking window
// is still genuinely open (cutoff null or still in the future) -- real seat
// availability doesn't matter for these two tests, since the button shows
// "Book Now" or "Join Waitlist" either way and both match the tests'
// existing /book now|join waitlist/i regex; only a passed cutoff removes
// the button entirely (EventSlideOut's "Bookings Closed" state).
async function getBookableScreening() {
  const nowIso = new Date().toISOString()
  const rows = await supaGet(
    `events?select=id,title,event_date,event_time,reservation_cutoff&hub_type=eq.movie&archived=eq.false&event_date=gte.${todayStr()}&or=(reservation_cutoff.is.null,reservation_cutoff.gte.${nowIso})&order=event_date.asc,event_time.asc&limit=1`,
    SUPABASE_ANON_KEY
  )
  return rows[0] || null
}

async function getUpcomingBookclubEvent() {
  // Book Club migrated to the shared Clubs engine (/clubs/book-club, Decision #1):
  // its events are now hub_type=club scoped by club_id, NOT the legacy
  // hub_type=bookclub. Query via the club slug so this keeps working.
  const rows = await supaGet(
    `events?select=id,title,event_date,clubs!inner(slug)&clubs.slug=eq.book-club&archived=eq.false&event_date=gte.${todayStr()}&order=event_date.asc&limit=1`,
    SUPABASE_ANON_KEY
  )
  return rows[0] || null
}

// Every active club (for the content-independent render smoke test). All clubs
// run through the shared ClubHome engine, so visiting each and asserting no
// client-side exception guards the whole ClubHome render path.
async function getActiveClubs() {
  return supaGet(`clubs?select=slug,name&archived=eq.false&order=name.asc`, SUPABASE_ANON_KEY)
}

// ── Service-role reads — needed for anything tied to testbot's own booking
// state, since RLS blocks reading another member's bookings via the anon key.
//
// testbot's confirmed movie booking lives on a DEDICATED fixture event
// (id 9e63e42c-192f-46da-8ade-d5c74a4c0158, "[QA Fixture] Automated Test
// Booking — Not A Real Screening", event_date 2099-12-31) rather than a real
// screening. It used to sit on a real one, deliberately chosen to not be the
// chronologically-next screening so it wouldn't interfere with Waitlist tests
// — but once the app went live to real residents, a test account occupying a
// real seat was distorting real, strictly-limited capacity (every seat/
// capacity calculation in the app is scoped per event_id, so sharing an
// event_id with real bookings meant sharing their seat pool too). Moving the
// booking onto its own dedicated event fixes that structurally: it can never
// share a seat pool with a real screening again, and this query needed no
// changes since it already just looks up whatever confirmed, non-archived,
// future-dated movie booking testbot has. If this booking goes missing,
// re-create it on the fixture event above — never on a real screening.

async function getTestbotMovieBooking() {
  const members = await supaGet(`members?username=ilike.testbot&select=id`, SUPABASE_SERVICE_KEY)
  if (!members[0]) return null
  const rows = await supaGet(
    `bookings?member_id=eq.${members[0].id}&status=eq.confirmed&select=seats,events!inner(id,title,event_date,event_time,hub_type,archived)&events.hub_type=eq.movie&events.archived=eq.false`,
    SUPABASE_SERVICE_KEY
  )
  const upcoming = rows.filter(r => r.events.event_date >= todayStr())
  if (!upcoming.length) return null
  upcoming.sort((a, b) => a.events.event_date.localeCompare(b.events.event_date))
  const first = upcoming[0]
  return { ...first.events, seats: first.seats }
}

// Creates a fresh unread notification for testbot and returns its id + a
// distinctive message text, so the E2E notifications spec can assert on
// exactly this row regardless of whatever else is in the table. The id is
// what actually makes the scoping robust (see notifications.spec.js's
// data-testid usage) -- message-text-based locators (hasText) still match
// every ancestor div that merely CONTAINS the row, not just the row itself,
// which silently widens to a multi-match once the row's own "Mark as done"
// button disappears after ticking (2026-08-19, caught by a real CI run:
// "strict mode violation... resolved to 2 elements" once ticking removed
// the one distinguishing feature the old filter relied on). Self-contained
// per run -- doesn't rely on a persistent fixture row staying unread across
// CI runs.
async function createTestbotNotification() {
  const members = await supaGet(`members?username=ilike.testbot&select=id`, SUPABASE_SERVICE_KEY)
  if (!members[0]) throw new Error('testbot member not found')
  const marker = `[e2e-check-${Date.now()}]`
  const message = `Test notification ${marker}`
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ member_id: members[0].id, type: 'event_updated', message }),
  })
  if (!res.ok) throw new Error(`Failed to create test notification (${res.status}): ${await res.text()}`)
  const [row] = await res.json()
  return { id: row.id, message }
}

module.exports = {
  getNextScreening,
  getBookableScreening,
  getUpcomingBookclubEvent,
  getActiveClubs,
  getTestbotMovieBooking,
  createTestbotNotification,
  fmtDate,
  fmtTime,
  fmtDateLong,
  fmtTime24,
}
