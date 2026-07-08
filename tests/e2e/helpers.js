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

function todayStr() {
  return new Date().toISOString().slice(0, 10)
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

async function getUpcomingBookclubEvent() {
  const rows = await supaGet(
    `events?select=id,title,event_date&hub_type=eq.bookclub&archived=eq.false&event_date=gte.${todayStr()}&order=event_date.asc&limit=1`,
    SUPABASE_ANON_KEY
  )
  return rows[0] || null
}

// ── Service-role reads — needed for anything tied to testbot's own booking
// state, since RLS blocks reading another member's bookings via the anon key.
// Deliberately NOT assumed to be the "next" screening — the fixture booking
// may sit on a later screening precisely so it doesn't interfere with tests
// that need the *next* screening to still be unbooked (Waitlist flow).

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

module.exports = {
  getNextScreening,
  getUpcomingBookclubEvent,
  getTestbotMovieBooking,
  fmtDate,
  fmtTime,
  fmtDateLong,
  fmtTime24,
}
