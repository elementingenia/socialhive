// Unit tests for lib/eventShare.js — Event Deep Linking + Add to Calendar.
//   npm run test:unit
//
// Focus: the parts with real logic (window resolution, truncation, ICS/
// Google Calendar URL building, the hub_type -> path map) rather than pure
// string templating.

import {
  buildShareUrl, buildSpaceBookingShareUrl, hubPathForEvent,
  truncateForCalendar, buildCalendarDescription, resolveEventWindow,
  buildIcsContent, buildGoogleCalendarUrl, DEFAULT_EVENT_DURATION_MINUTES,
} from '../../lib/eventShare.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗', m)) }
const eq = (a, b, m) => ok(a === b, `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

// ── buildShareUrl / buildSpaceBookingShareUrl (no `window` in Node => relative path) ──
eq(buildShareUrl('/screenings', 42), '/screenings?event=42', 'relative share URL, no window global')
eq(buildShareUrl('/clubs/movie-buffs', 'abc-123'), '/clubs/movie-buffs?event=abc-123', 'club path preserved')
eq(buildSpaceBookingShareUrl('/spaces', 'uuid-1'), '/spaces?sb=uuid-1', 'space booking uses its own ?sb= param')

// ── hubPathForEvent ────────────────────────────────────────────────────────
eq(hubPathForEvent({ hub_type: 'movie' }), '/screenings', 'movie -> Show Time')
eq(hubPathForEvent({ hub_type: 'social' }), '/social/events', 'social -> Social Hive')
eq(hubPathForEvent({ hub_type: 'special' }), '/special-events/events', 'special -> Special Events')
eq(hubPathForEvent({ hub_type: 'space' }), '/spaces/scheduled', 'space -> Book a Space Scheduled')
eq(hubPathForEvent({ hub_type: 'club', club: { slug: 'bookworms' } }), '/clubs/bookworms',
  'a club event uses its own club slug, not hub_type')
eq(hubPathForEvent({ hub_type: 'unknown-future-hub' }), null, 'unrecognised hub_type => null, not a guess')
eq(hubPathForEvent(null), null, 'no event => null')

// ── truncateForCalendar ────────────────────────────────────────────────────
eq(truncateForCalendar('Short note'), 'Short note', 'short text is untouched')
eq(truncateForCalendar(''), '', 'empty text stays empty')
eq(truncateForCalendar(null), '', 'null text => empty string, not "null"')
eq(truncateForCalendar('<p>Bold <b>plans</b> tonight</p>'), 'Bold plans tonight',
  'strips HTML markup (Social/Special descriptions are bbToHtml-rendered)')
{
  const long = 'word '.repeat(100).trim() // 500 chars, well past the 280 default
  const truncated = truncateForCalendar(long)
  ok(truncated.length <= 281, 'truncated text respects the max (280 + ellipsis)')
  ok(truncated.endsWith('…'), 'truncated text is marked with an ellipsis')
  ok(!truncated.includes('  '), 'cut lands on a word boundary, not mid-word')
}

// ── buildCalendarDescription ───────────────────────────────────────────────
{
  const desc = buildCalendarDescription({ deepLink: 'https://elementhappenings.com.au/screenings?event=5', description: 'Bring snacks' })
  ok(desc.includes('Element Happenings'), 'identifies itself as an Element Happenings entry')
  ok(desc.includes('https://elementhappenings.com.au/screenings?event=5'), 'embeds the deep link')
  ok(desc.includes("won't update automatically"), 'includes the non-auto-update notice (decision 5)')
  ok(desc.includes('Bring snacks'), 'includes the event’s own (trimmed) description')
}
eq(
  buildCalendarDescription({ deepLink: 'https://x/y', description: '' }).includes('Bring snacks'),
  false,
  'no stray content when there is no description to embed',
)

// ── resolveEventWindow ─────────────────────────────────────────────────────
{
  const w = resolveEventWindow({ event_date: '2026-08-01', event_time: '14:00' })
  eq(w.start.toISOString(), '2026-08-01T04:00:00.000Z', 'winter 2pm AEST => 4am UTC start')
  eq(w.end.getTime() - w.start.getTime(), DEFAULT_EVENT_DURATION_MINUTES * 60000,
    'no duration tracked anywhere in the schema => default 2h end time')
}
{
  const w = resolveEventWindow({ event_date: '2026-12-25', event_time: '18:30' })
  eq(w.start.toISOString(), '2026-12-25T07:30:00.000Z', 'summer 6:30pm AEDT => 7:30am UTC start')
}
eq(resolveEventWindow({ event_date: '2026-08-01' }).start.toISOString(), '2026-07-31T14:00:00.000Z',
  'missing event_time defaults to midnight Sydney (all-day-ish event) => previous UTC day, not a crash')
eq(resolveEventWindow(null), null, 'no event_date => null, not a throw')
eq(resolveEventWindow({}), null, 'empty event => null')

// ── buildIcsContent ─────────────────────────────────────────────────────────
{
  const start = new Date('2026-08-01T04:00:00.000Z')
  const end = new Date('2026-08-01T06:00:00.000Z')
  const ics = buildIcsContent({ uid: 'event-5@elementhappenings.com.au', title: 'Movie Night', description: 'Line one\nLine two', location: 'The Hive Hall', start, end })
  ok(ics.startsWith('BEGIN:VCALENDAR\r\n'), 'valid VCALENDAR envelope')
  ok(ics.includes('BEGIN:VEVENT\r\n'), 'contains a VEVENT block')
  ok(ics.includes('UID:event-5@elementhappenings.com.au'), 'stable UID embedded (re-download updates, not duplicates)')
  ok(ics.includes('DTSTART:20260801T040000Z'), 'DTSTART in correct UTC ICS format')
  ok(ics.includes('DTEND:20260801T060000Z'), 'DTEND in correct UTC ICS format')
  ok(ics.includes('SUMMARY:Movie Night'), 'title embedded as SUMMARY')
  ok(ics.includes('LOCATION:The Hive Hall'), 'location embedded')
  ok(ics.includes('Line one\\nLine two'), 'embedded newlines escaped per RFC 5545')
  ok(ics.endsWith('END:VCALENDAR\r\n'), 'properly closed')
}
{
  // A comma/semicolon in the title must not corrupt the ICS structure.
  const ics = buildIcsContent({ uid: 'u', title: 'Trivia, Prizes; Fun', description: null, location: null, start: new Date(), end: new Date() })
  ok(ics.includes('SUMMARY:Trivia\\, Prizes\\; Fun'), 'comma/semicolon escaped in SUMMARY')
  ok(!ics.includes('LOCATION:'), 'no LOCATION line when location is absent')
}

// ── buildGoogleCalendarUrl ─────────────────────────────────────────────────
{
  const start = new Date('2026-08-01T04:00:00.000Z')
  const end = new Date('2026-08-01T06:00:00.000Z')
  const url = buildGoogleCalendarUrl({ title: 'Movie Night', description: 'Details here', location: 'The Hive Hall', start, end })
  ok(url.startsWith('https://calendar.google.com/calendar/render?'), 'Google Calendar render endpoint')
  ok(url.includes('action=TEMPLATE'), 'quick-add action, no OAuth needed')
  ok(url.includes('dates=20260801T040000Z%2F20260801T060000Z'), 'dates param is start%2Fend, both UTC')
  // URLSearchParams encodes spaces as "+" (application/x-www-form-urlencoded),
  // not "%20" -- decodeURIComponent alone doesn't turn "+" back into a space.
  const readable = decodeURIComponent(url).replace(/\+/g, ' ')
  ok(readable.includes('text=Movie Night'), 'title embedded')
  ok(readable.includes('details=Details here'), 'description embedded')
  ok(readable.includes('location=The Hive Hall'), 'location embedded')
}

console.log(`eventShare: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
