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
    .from('members')
    .select('id, is_admin')
    .eq('auth_id', user.id)
    .single()
  return member
}

// GET — list upcoming screenings with booking counts + my status
export async function GET(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const today = new Date().toISOString().split('T')[0]

  const { data: events, error } = await supabaseAdmin
    .from('events')
    .select('*, movies(id, title, poster_url, genre, runtime, rating_imdb)')
    .gte('event_date', today)
    .order('event_date')
    .order('event_time')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!events?.length) return NextResponse.json([])

  const eventIds = events.map(e => e.id)

  const { data: bookings } = await supabaseAdmin
    .from('bookings')
    .select('id, event_id, member_id, status')
    .in('event_id', eventIds)
    .neq('status', 'cancelled')

  const result = events.map(ev => {
    const evBookings = (bookings || []).filter(b => b.event_id === ev.id)
    const confirmed_count = evBookings.filter(b => b.status === 'confirmed').length
    const waitlist_count = evBookings.filter(b => b.status === 'waitlist').length
    const my_booking = evBookings.find(b => b.member_id === member.id) || null
    return {
      ...ev,
      confirmed_count,
      waitlist_count,
      seats_remaining: Math.max(0, ev.max_seats - confirmed_count),
      my_booking,
    }
  })

  return NextResponse.json(result)
}

// POST — create screening (admin only)
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
      type: 'movie',
      title,
      movie_id: movie_id || null,
      event_date,
      event_time,
      max_seats: max_seats || 20,
      notes: notes || null,
      created_by: member.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(event)
}
