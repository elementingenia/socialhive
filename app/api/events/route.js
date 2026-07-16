import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD&hub_type=movie
export async function GET(req) {
  const { searchParams } = new URL(req.url)

  const today = new Date().toISOString().split('T')[0]
  const defaultTo = (() => {
    const d = new Date(); d.setDate(d.getDate() + 60); return d.toISOString().split('T')[0]
  })()

  const from    = searchParams.get('from') || today
  const to      = searchParams.get('to')   || defaultTo
  const hubType = searchParams.get('hub_type')

  // Optional: get member_id from auth token for personalised my_bookings
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  let memberId = null
  if (token) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)
    if (user) {
      const { data: member } = await supabaseAdmin
        .from('members').select('id').eq('auth_id', user.id).single()
      memberId = member?.id || null
    }
  }

  // Fetch events with movie + book + coordinator joins
  let query = supabaseAdmin
    .from('events')
    .select(`
      id, hub_type, title, event_date, event_time, max_seats, max_seats_per_booking,
      is_public, cost, description, payment_required, show_attendee_names, archived,
      reservation_cutoff, payment_due_by,
      coordinator_id, welcome_message, image_url, movie_id, book_id,
      movie:movies!movie_id (
        id, title, poster_url, rating_imdb, plot, genre, runtime, imdb_id, tmdb_id
      ),
      book:books!book_id (
        id, title, cover_url, rating, rating_link, summary, author
      ),
      coordinator:members!coordinator_id (
        id, name, username
      )
    `)
    .eq('archived', false)
    .gte('event_date', from)
    .lte('event_date', to)
    .order('event_date', { ascending: true })
    .order('event_time', { ascending: true })

  if (hubType) query = query.eq('hub_type', hubType)

  const { data: events, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!events?.length) return NextResponse.json([])

  const eventIds = events.map(e => e.id)

  // Seat counts: sum confirmed seats per event
  const { data: confirmedRows } = await supabaseAdmin
    .from('bookings')
    .select('event_id, seats')
    .in('event_id', eventIds)
    .eq('status', 'confirmed')

  const confirmedMap = {}
  for (const b of confirmedRows || []) {
    confirmedMap[b.event_id] = (confirmedMap[b.event_id] || 0) + (b.seats || 1)
  }

  // Waitlist counts
  const { data: waitlistRows } = await supabaseAdmin
    .from('bookings')
    .select('event_id, seats')
    .in('event_id', eventIds)
    .eq('status', 'waitlist')

  const waitlistMap = {}
  for (const b of waitlistRows || []) {
    waitlistMap[b.event_id] = (waitlistMap[b.event_id] || 0) + (b.seats || 1)
  }

  // My bookings (only if authed)
  let myBookingMap = {}
  if (memberId) {
    const { data: myRows } = await supabaseAdmin
      .from('bookings')
      .select('event_id, id, seats, status, payment_status')
      .in('event_id', eventIds)
      .eq('member_id', memberId)
      .neq('status', 'cancelled')

    for (const b of myRows || []) {
      if (!myBookingMap[b.event_id]) myBookingMap[b.event_id] = []
      myBookingMap[b.event_id].push(b)
    }
  }

  const result = events.map(event => ({
    ...event,
    bookings_count: confirmedMap[event.id] || 0,
    waitlist_count: waitlistMap[event.id] || 0,
    my_bookings: myBookingMap[event.id] || [],
  }))

  return NextResponse.json(result)
}
