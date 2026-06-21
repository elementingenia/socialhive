import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
    .select('*, movies(id, title, poster_url, genre, plot, runtime, rating_imdb, rating_rt, imdb_id, streaming_au, we_own)')
    .gte('event_date', today)
    .order('event_date')
    .order('event_time')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!events?.length) return NextResponse.json([])

  const eventIds = events.map(e => e.id)
  const movieIds = [...new Set(events.filter(e => e.movie_id).map(e => e.movie_id))]

  const { data: bookings } = await supabaseAdmin
    .from('bookings')
    .select('id, event_id, member_id, status, seats, booked_at, members(name)')
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

    const attendees = member.is_admin
      ? [
          ...confirmedBookings.map(b => ({ name: b.members?.name || 'Member', seats: b.seats || 1, status: 'confirmed' })),
          ...waitlistBookings.map(b => ({ name: b.members?.name || 'Member', seats: b.seats || 1, status: 'waitlist' })),
        ]
      : undefined

    return {
      ...ev,
      confirmed_seats,
      waitlist_count,
      waitlist_seats,
      seats_remaining: Math.max(0, ev.max_seats - confirmed_seats),
      my_booking,
      community_score: ev.movie_id ? (communityAvg[ev.movie_id] || null) : null,
      ...(attendees !== undefined ? { attendees } : {}),
    }
  })

  return NextResponse.json(result)
}

export async function POST(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const member = await getMember(token)
  if (!member?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { movie_id, event_date, event_time, max_seats, notes } = await req.json()
  if (!event_date || !event_time) {
    return NextResponse.json({ error: 'Date and time are required' }, { status: 400 })
  }

  let title = 'Movie Night'
  if (movie_id) {
    const { data: movie } = await supabaseAdmin
      .from('movies').select('title').eq('id', movie_id).single()
    if (movie) title = movie.title
  }

  const { data: event, error } = await supabaseAdmin
    .from('events')
    .insert({
      hub_type: 'movie', title, movie_id: movie_id || null,
      event_date, event_time, max_seats: max_seats || 20,
      notes: notes || null, created_by: member.id,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(event)
}
