import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyEventAttendees } from '@/lib/notifyEventAttendees'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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

  const today = new Date().toISOString().split('T')[0]

  const { data: events, error } = await supabaseAdmin
    .from('events')
    .select('*, bus_driver:members!bus_driver_id(name, username), movies(id, title, poster_url, genre, plot, runtime, rating_imdb, rating_rt, imdb_id, tmdb_id, streaming_offers, we_own, actors, rating)')
    .eq('hub_type', 'movie')
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
    .select('id, event_id, member_id, status, seats, booked_at, members(name, hide_name)')
    .in('event_id', eventIds)
    .neq('status', 'cancelled')

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
    // adds a "(P)" marker); the viewer's own row always reads "You".
    const isCoordinator = coordMap[ev.id]?.id === member.id
    const canManageBooks = member.is_admin || isCoordinator
    const attendeeOf = b => {
      const isOwn     = b.member_id === member.id
      const isPrivate = !!b.members?.hide_name
      const name = isOwn ? 'You' : (isPrivate && !canManageBooks) ? 'Resident' : (b.members?.name || 'Resident')
      return { name, seats: b.seats || 1, isOwn, isPrivate }
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
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const member = await getMember(token)
  if (!member?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { movie_id, event_date, event_time, max_seats, notes, coordinator_id, reservation_cutoff, allow_nonresident_guests } = await req.json()
  if (!event_date || !event_time) {
    return NextResponse.json({ error: 'Date and time are required' }, { status: 400 })
  }

  let title = 'Movie Night'
  let movieSnapshot = null
  if (movie_id) {
    const { data: movie } = await supabaseAdmin
      .from('movies').select('title, director, poster_url, year').eq('id', movie_id).single()
    if (movie) {
      title = movie.title
      movieSnapshot = { title: movie.title, director: movie.director, poster_url: movie.poster_url, year: movie.year }
    }
  }

  const { data: event, error } = await supabaseAdmin
    .from('events')
    .insert({
      hub_type: 'movie', title, movie_id: movie_id || null,
      event_date, event_time, max_seats: max_seats || 20,
      reservation_cutoff: reservation_cutoff || null,
      allow_nonresident_guests: !!allow_nonresident_guests,
      notes: notes || null, created_by: member.id,
      movie_snapshot: movieSnapshot,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Save coordinator if provided
  if (coordinator_id && event?.id) {
    await supabaseAdmin.from('event_coordinators').insert({ event_id: event.id, member_id: coordinator_id, assigned_by: member.id })
  }

  return NextResponse.json(event)
}

export async function PATCH(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const member = await getMember(token)
  if (!member?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { event_id, movie_id, event_date, event_time, max_seats, notes, coordinator_id, reservation_cutoff } = await req.json()
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!event_date || !event_time) return NextResponse.json({ error: 'Date and time are required' }, { status: 400 })

  let title = 'Movie Night'
  let movieSnapshot = null
  if (movie_id) {
    const { data: movie } = await supabaseAdmin
      .from('movies').select('title, director, poster_url, year').eq('id', movie_id).single()
    if (movie) {
      title = movie.title
      movieSnapshot = { title: movie.title, director: movie.director, poster_url: movie.poster_url, year: movie.year }
    }
  }

  const { data: before } = await supabaseAdmin
    .from('events').select('event_date, event_time').eq('id', event_id).single()

  const { error } = await supabaseAdmin
    .from('events')
    .update({ movie_id: movie_id || null, title, event_date, event_time, max_seats: max_seats || 20, notes: notes || null, movie_snapshot: movieSnapshot, reservation_cutoff: reservation_cutoff || null, allow_nonresident_guests: !!allow_nonresident_guests })
    .eq('id', event_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update coordinator — clear existing then insert new if provided
  await supabaseAdmin.from('event_coordinators').delete().eq('event_id', event_id)
  if (coordinator_id) {
    await supabaseAdmin.from('event_coordinators').insert({ event_id, member_id: coordinator_id, assigned_by: member.id })
  }

  const dateChanged = before && (before.event_date !== event_date || before.event_time !== event_time)
  if (dateChanged) {
    await notifyEventAttendees(supabaseAdmin, event_id, 'event_updated',
      `${title} has been rescheduled — check the new date and time.`)
  }

  return NextResponse.json({ ok: true })
}
