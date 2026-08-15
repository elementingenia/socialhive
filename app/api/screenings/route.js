import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'
import { notifyEventAttendees } from '@/lib/notifyEventAttendees'
import { notifyHubFollowers } from '@/lib/notifyAudience'
import { hubLocation, fetchLocation } from '@/lib/eventClash'
import { findAnyRoomConflict } from '@/lib/spaceBookings'
import { notifyRequestOnlySpace } from '@/lib/notifyRequestOnlySpace'
import { titleFor } from '@/lib/showing'
import { checkCancelPaymentGuard } from '@/lib/eventCancelGuard'
import { sydneyTodayStr } from '@/lib/date'
import { requireAdminOrAreaOwner, requireEventManage } from '@/lib/areaAuth'
import { resolveMemberName } from '@/lib/memberName'

// Movie screenings always run in the one dedicated common space -- there's no
// location picker in the screening form, so every screening is auto-bound to
// the "Cinema" location (Iain, 2026-07-23) and must carry an end time, same as
// any other onsite event, so space-use management works consistently across
// all three hubs.
// The Movies hub nominates its venue in hub_settings (migration 073). This is
// only the fallback for a hub that has not nominated one.
const CINEMA_NAME = "Cinema"
const MOVIES_HUB  = "movies"   // hub_settings spelling — events use "movie"

// force-dynamic + the shared no-store supabaseAdmin (lib/supabaseAdmin.js) keep
// this GET route reading LIVE data. Without it, Next's fetch cache once dropped a
// just-added screening from the calendar (2026-07-19).
export const dynamic = "force-dynamic"

async function getMember(token) {
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: member } = await supabaseAdmin
    .from('members').select('id, is_admin').eq('auth_id', user.id).single()
  return member
}

export async function GET(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const today = sydneyTodayStr()

  const { data: events, error } = await supabaseAdmin
    .from('events')
    .select('*, bus_driver:members!bus_driver_id(name, username), movies(id, title, poster_url, genre, plot, runtime, rating_imdb, rating_rt, imdb_id, tmdb_id, streaming_offers, we_own, actors, rating)')
    .eq('hub_type', 'movie')
    // Cancelled screenings must not appear. This filter was simply absent, and
    // nothing revealed it until Movies got a cancel button — before that,
    // nothing could archive a Movies event, so no archived row ever existed to
    // leak. Clubs has always had .eq("archived", false); Movies never did.
    .eq('archived', false)
    .gte('event_date', today)
    .order('event_date')
    .order('event_time')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!events?.length) return NextResponse.json([])

  const eventIds = events.map(e => e.id)
  const movieIds = [...new Set(events.filter(e => e.movie_id).map(e => e.movie_id))]

  const { data: ecRows } = await supabaseAdmin
    .from('event_coordinators')
    .select('event_id, member_id, members!member_id(id, name, username)')
    .in('event_id', eventIds)
    .is('replaced_at', null)
  const coordMap = {}
  for (const ec of ecRows || []) {
    coordMap[ec.event_id] = ec.members
  }

  const { data: bookings } = await supabaseAdmin
    .from('bookings')
    .select('id, event_id, member_id, contact_id, status, seats, booked_at, members(name, display_name, hide_name), contacts(name)')
    .in('event_id', eventIds)
    .neq('status', 'cancelled')

  // Named additional attendees (workstream A) — keyed (event_id, owner key).
  // The owner is a member (self-service booking) or, since migration 061, a
  // contact (a walk-up booking an EC named a party under -- Iain, 2026-07-23:
  // "let Lyn make a walk-up booking for 2 seats and set Geoff as the second
  // seat"). Composite key covers both without the two id spaces colliding.
  const { data: partyRows } = await supabaseAdmin
    .from('booking_attendees')
    .select('event_id, owner_id, owner_contact_id, member_id, contact_id, guest_name, member:members!member_id(name, display_name, hide_name), contact:contacts!contact_id(name)')
    .in('event_id', eventIds)
  const partyMap = {}
  for (const p of partyRows || []) {
    const ownerKey = p.owner_id ? `m:${p.owner_id}` : `c:${p.owner_contact_id}`
    const key = `${p.event_id}|${ownerKey}`
    ;(partyMap[key] = partyMap[key] || []).push(p)
  }

  const votesQuery = movieIds.length
    ? await supabaseAdmin.from('votes').select('movie_id, score').in('movie_id', movieIds)
    : { data: [] }
  const votes = votesQuery.data || []

  const communityAvg = {}
  for (const movieId of movieIds) {
    const mvVotes = votes.filter(v => v.movie_id === movieId)
    if (mvVotes.length > 0) {
      communityAvg[movieId] = {
        avg: mvVotes.reduce((s, v) => s + v.score, 0) / mvVotes.length,
        count: mvVotes.length,
      }
    }
  }

  const result = events.map(ev => {
    const evBookings = (bookings || []).filter(b => b.event_id === ev.id)
    const confirmedBookings = evBookings.filter(b => b.status === 'confirmed')
    const waitlistBookings  = evBookings.filter(b => b.status === 'waitlist')

    const confirmed_seats = confirmedBookings.reduce((sum, b) => sum + (b.seats || 1), 0)
    const waitlist_count  = waitlistBookings.length
    const waitlist_seats  = waitlistBookings.reduce((sum, b) => sum + (b.seats || 1), 0)

    const myBookings  = evBookings.filter(b => b.member_id === member.id)
    const myConfirmed = myBookings.find(b => b.status === 'confirmed') || null
    const myWaitlist  = myBookings.find(b => b.status === 'waitlist')  || null

    // Waitlist position — rank by booked_at ascending
    let waitlist_position = null
    if (myWaitlist) {
      const sorted = [...waitlistBookings].sort(
        (a, b) => new Date(a.booked_at) - new Date(b.booked_at)
      )
      waitlist_position = sorted.findIndex(b => b.member_id === member.id) + 1
    }

    const my_booking = (myConfirmed || myWaitlist) ? {
      confirmed_seats:   myConfirmed?.seats || 0,
      waitlist_seats:    myWaitlist?.seats  || 0,
      has_confirmed:     !!myConfirmed,
      has_waitlist:      !!myWaitlist,
      waitlist_position,
    } : null

    // Same privacy convention as Book Club/Social/EventSlideOut: non-admin,
    // non-coordinator viewers see "Resident" for anyone with hide_name set;
    // admins and this screening's own coordinator see the real name (frontend
    // adds a "(P)" marker); the viewer's own row always reads "You". A
    // walk-up booking made against a Contacts-hub resident (contact_id, no
    // login) has no hide_name concept at all, so it's never masked.
    //
    // 2026-07-23 (Iain): the person who BOOKED a party member should always
    // see that name too, privacy flag or not -- they already know who they
    // added; masking only protects that name from everyone else. isOwn below
    // is "is this my own booking", reused as the bypass for every party
    // member under it, not just an exact self-match within the party.
    const isCoordinator = coordMap[ev.id]?.id === member.id
    const canManageBooks = member.is_admin || isCoordinator
    const attendeeOf = b => {
      const isOwn     = b.member_id === member.id
      const isPrivate = !!b.members?.hide_name
      // display_name (2026-08-14): preferred fallback ahead of the real name
      // when not masked -- masking itself is unchanged, see lib/memberName.js.
      const name = b.members
        ? resolveMemberName(b.members, { viewerId: member.id, canManage: canManageBooks, selfLabel: 'You' })
        : (isOwn ? 'You' : (b.contacts?.name || 'Resident'))
      // Named party for this booker, same privacy masking as the booker's
      // row -- except the booking owner always sees their own party's names.
      const ownerKey = b.member_id ? `m:${b.member_id}` : b.contact_id ? `c:${b.contact_id}` : null
      const party = (ownerKey && partyMap[`${ev.id}|${ownerKey}`] || []).map(p => {
        if (p.member_id) {
          const own  = p.member_id === member.id
          const priv = !!p.member?.hide_name
          const pName = resolveMemberName(p.member, { viewerId: member.id, canManage: canManageBooks || isOwn, selfLabel: 'You' })
          return { name: pName, isPrivate: priv, guest: false }
        }
        if (p.contact_id) {
          return { name: p.contact?.name || 'Resident', isPrivate: false, guest: false }
        }
        return { name: p.guest_name, isPrivate: false, guest: true }
      })
      return { name, seats: b.seats || 1, isOwn, isPrivate, party }
    }
    const attendees = member.is_admin
      ? [
          ...confirmedBookings.map(b => ({ ...attendeeOf(b), status: 'confirmed' })),
          ...waitlistBookings.map(b => ({ ...attendeeOf(b), status: 'waitlist' })),
        ]
      : confirmedBookings.map(b => ({ ...attendeeOf(b), status: 'confirmed' }))

    return {
      ...ev,
      confirmed_seats,
      waitlist_count,
      waitlist_seats,
      seats_remaining: Math.max(0, ev.max_seats - confirmed_seats),
      my_booking,
      community_score: ev.movie_id ? (communityAvg[ev.movie_id] || null) : null,
      attendees,
      coordinator: coordMap[ev.id] || null,
    }
  })

  // Test/fixture screenings (events.is_test, migration 036) are hidden from
  // browse/discovery for EVERYONE, admins included (confirmed by Iain
  // 2026-07-12 — seeing it as admin on live Scheduled was not acceptable,
  // even though the row is easy to find/manage). The one exception is
  // whoever actually holds a booking on it (the testbot E2E fixture),
  // which still needs to see its own booking for the E2E suite to pass.
  const visible = result.filter(ev => !ev.is_test || ev.my_booking)

  return NextResponse.json(visible)
}

export async function POST(req) {
  // Admin, or Show Time's Owner (area-wide -- Iain, 2026-08-10; see lib/areaAuth.js).
  const { error: authErr, status: authStatus, member } = await requireAdminOrAreaOwner(req, 'hub', 'movie')
  if (authErr) return NextResponse.json({ error: authErr }, { status: authStatus })

  const { movie_id, showing_title, location_id: bodyLocationId, event_date, event_time, event_end_time, max_seats, max_seats_per_booking, notes, coordinator_id, reservation_cutoff, allow_nonresident_guests, require_attendee_names } = await req.json()
  if (!event_date || !event_time) {
    return NextResponse.json({ error: 'Date and time are required' }, { status: 400 })
  }
  if (!event_end_time) {
    return NextResponse.json({ error: 'An end time is required -- every screening books the Cinema as a common space.' }, { status: 400 })
  }

  // A Movies event is a SHOWING — a film is one kind, the AFL Grand Final is
  // another. titleFor() keeps the old 'Movie Night' fallback so nothing that
  // sends neither changes behaviour.
  let title = titleFor({ freeText: showing_title })
  let movieSnapshot = null
  if (movie_id) {
    const { data: movie } = await supabaseAdmin
      .from('movies').select('title, director, poster_url, year').eq('id', movie_id).single()
    if (movie) {
      title = titleFor({ movieTitle: movie.title, freeText: showing_title })
      movieSnapshot = { title: movie.title, director: movie.director, poster_url: movie.poster_url, year: movie.year }
    }
  }

  // Movies is the one caller that legitimately starts from a name — the Cinema
  // is hardcoded (CINEMA_NAME). Safe since migration 071 made location names
  // unique; before that two same-named rows made this silently resolve to null.
  // The form sends the venue chosen for THIS screening. Fall back to the hub's
  // nominated venue when it doesn't (an older client, or the API called direct).
  const cinema = bodyLocationId
    ? await fetchLocation(supabaseAdmin, bodyLocationId)
    : await hubLocation(supabaseAdmin, MOVIES_HUB, CINEMA_NAME)
  if (!cinema) return NextResponse.json({ error: `That venue no longer exists. Pick another on the screening, or set the Show Time venue in Admin > Show Time.` }, { status: 500 })
  const location_id = cinema.id
  const conflict = await findAnyRoomConflict(supabaseAdmin, { location_id, event_date, event_time, event_end_time, locationName: cinema.name })
  if (conflict) return NextResponse.json({ error: conflict.message }, { status: 409 })

  const { data: event, error } = await supabaseAdmin
    .from('events')
    .insert({
      hub_type: 'movie', title, movie_id: movie_id || null,
      event_date, event_time, event_end_time, max_seats: max_seats || 20,
      max_seats_per_booking: max_seats_per_booking || 4,
      reservation_cutoff: reservation_cutoff || null,
      allow_nonresident_guests: !!allow_nonresident_guests,
      require_attendee_names: !!require_attendee_names,
      notes: notes || null, created_by: member.id,
      movie_snapshot: movieSnapshot,
      location_type: 'onsite', location: cinema.name, location_id,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // "Request Only" (Iain, 2026-08-04): Admin is trusted to have already
  // talked to Ingenia, but gets a reminder to actually go validate it.
  if (cinema.request_only) {
    await notifyRequestOnlySpace({
      actingMemberId: member.id, eventId: event.id, eventTitle: title,
      eventDate: event_date, locationName: cinema.name,
    })
  }

  // Notify residents who follow Movies about the new screening (Iain 2026-07-18).
  const when = event_date ? new Date(event_date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) : ""
  await notifyHubFollowers(supabaseAdmin, "movie", event.id, "event_added",
    `New screening: ${title}${when ? ` — ${when}` : ""}`, { excludeMemberId: member.id })

  // Save coordinator if provided
  if (coordinator_id && event?.id) {
    await supabaseAdmin.from('event_coordinators').insert({ event_id: event.id, member_id: coordinator_id, assigned_by: member.id })
  }

  return NextResponse.json(event)
}

export async function PATCH(req) {
  const { event_id, movie_id, showing_title, location_id: bodyLocationId, event_date, event_time, event_end_time, max_seats, max_seats_per_booking, notes, coordinator_id, reservation_cutoff, allow_nonresident_guests, require_attendee_names } = await req.json()
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  // Admin, Show Time's Owner (area-wide), or this screening's own EC
  // (Iain, 2026-08-10; see lib/areaAuth.js) -- same shape PATCH/DELETE
  // already used for EC, just extended to cover Owner too.
  const { error: authErr, status: authStatus, member } = await requireEventManage(req, event_id)
  if (authErr) return NextResponse.json({ error: authErr }, { status: authStatus })

  if (!event_date || !event_time) return NextResponse.json({ error: 'Date and time are required' }, { status: 400 })
  if (!event_end_time) return NextResponse.json({ error: 'An end time is required -- every screening books the Cinema as a common space.' }, { status: 400 })

  // A Movies event is a SHOWING — a film is one kind, the AFL Grand Final is
  // another. titleFor() keeps the old 'Movie Night' fallback so nothing that
  // sends neither changes behaviour.
  let title = titleFor({ freeText: showing_title })
  let movieSnapshot = null
  if (movie_id) {
    const { data: movie } = await supabaseAdmin
      .from('movies').select('title, director, poster_url, year').eq('id', movie_id).single()
    if (movie) {
      title = titleFor({ movieTitle: movie.title, freeText: showing_title })
      movieSnapshot = { title: movie.title, director: movie.director, poster_url: movie.poster_url, year: movie.year }
    }
  }

  // The form sends the venue chosen for THIS screening. Fall back to the hub's
  // nominated venue when it doesn't (an older client, or the API called direct).
  const cinema = bodyLocationId
    ? await fetchLocation(supabaseAdmin, bodyLocationId)
    : await hubLocation(supabaseAdmin, MOVIES_HUB, CINEMA_NAME)
  if (!cinema) return NextResponse.json({ error: `That venue no longer exists. Pick another on the screening, or set the Show Time venue in Admin > Show Time.` }, { status: 500 })
  const location_id = cinema.id
  const conflict = await findAnyRoomConflict(supabaseAdmin, { location_id, event_date, event_time, event_end_time, exclude_event_id: event_id, locationName: cinema.name })
  if (conflict) return NextResponse.json({ error: conflict.message }, { status: 409 })

  const { data: before } = await supabaseAdmin
    .from('events').select('event_date, event_time, location_id').eq('id', event_id).single()

  const { error } = await supabaseAdmin
    .from('events')
    .update({ movie_id: movie_id || null, title, event_date, event_time, event_end_time, max_seats: max_seats || 20, max_seats_per_booking: max_seats_per_booking || 4, notes: notes || null, movie_snapshot: movieSnapshot, reservation_cutoff: reservation_cutoff || null, allow_nonresident_guests: !!allow_nonresident_guests, require_attendee_names: !!require_attendee_names, location_type: 'onsite', location: cinema.name, location_id })
    .eq('id', event_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // "Request Only" (Iain, 2026-08-04): only nudge when the room actually
  // changed onto a Request Only venue -- not on every unrelated edit.
  if (cinema.request_only && before?.location_id !== location_id) {
    await notifyRequestOnlySpace({
      actingMemberId: member.id, eventId: event_id, eventTitle: title,
      eventDate: event_date, locationName: cinema.name,
    })
  }

  // Update coordinator — clear existing then insert new if provided
  await supabaseAdmin.from('event_coordinators').delete().eq('event_id', event_id)
  if (coordinator_id) {
    await supabaseAdmin.from('event_coordinators').insert({ event_id, member_id: coordinator_id, assigned_by: member.id })
  }

  const dateChanged = before && (before.event_date !== event_date || before.event_time !== event_time)
  if (dateChanged) {
    await notifyEventAttendees(supabaseAdmin, event_id, 'event_updated',
      `${title} has been rescheduled — check the new date and time.`,
      { excludeMemberId: member.id })
  }

  // `event_id` — NOT `event.id`. There is no `event` variable in this handler;
  // that belongs to POST. Referencing it threw AFTER the update had already
  // committed, so the screening saved and then the route 500'd, which is why
  // every Movies save appeared to hang (Iain, 2026-08-01).
  //
  // Neither lint nor build caught it: in a browser lint environment a bare
  // `event` resolves to the deprecated window.event global, so no-undef stays
  // quiet. On the server it is simply undefined.
  return NextResponse.json({ ok: true, id: event_id })
}


// ── DELETE — cancel a screening ─────────────────────────────────────────────
// Movies had NO way to remove an event at all (Iain, 2026-07-31: "the inability
// to delete any movie event"). Clubs have had one since the series work; Movies
// and Social never did.
//
// ARCHIVES rather than hard-deletes, matching Clubs exactly (api/series
// cancel_occurrence): bookings, attendance and payment history stay intact and
// auditable, and the screening simply leaves every list. A hard delete would
// cascade those bookings away — Movies carries 43 of the app's 68 bookings — so
// that is not a button worth putting in front of anyone.
//
// Anyone booked is notified, for the same reason Clubs notify: turning up to a
// screening that was cancelled is the worst possible outcome.
export async function DELETE(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data: member } = await supabaseAdmin
    .from('members').select('id, is_admin').eq('auth_id', user.id).maybeSingle()
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 403 })

  const { event_id } = await req.json().catch(() => ({}))
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data: ev } = await supabaseAdmin
    .from('events').select('id, title, hub_type, archived').eq('id', event_id).maybeSingle()
  if (!ev) return NextResponse.json({ error: 'Screening not found' }, { status: 404 })
  // Scoped to Movies deliberately — this route owns screenings and nothing else.
  if (ev.hub_type !== 'movie') {
    return NextResponse.json({ error: 'Not a screening' }, { status: 400 })
  }

  // Admin, Show Time's Owner (area-wide), or a coordinator of THIS
  // screening -- the same shape as every other event-level permission in
  // the app (Iain, 2026-08-10; see lib/areaAuth.js).
  const manage = await requireEventManage(req, event_id)
  if (manage.error) return NextResponse.json({ error: manage.error }, { status: manage.status })

  // Idempotent: cancelling twice must not notify twice.
  if (ev.archived) return NextResponse.json({ ok: true, already: true })

  const guardMsg = await checkCancelPaymentGuard(supabaseAdmin, event_id)
  if (guardMsg) return NextResponse.json({ error: guardMsg }, { status: 409 })

  const { error } = await supabaseAdmin.from('events').update({ archived: true }).eq('id', event_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await notifyEventAttendees(supabaseAdmin, event_id, 'event_cancelled',
    `${ev.title || 'A screening you booked'} has been cancelled.`)

  return NextResponse.json({ ok: true })
}
