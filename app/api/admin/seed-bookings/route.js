import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Spread booked_at over recent days for realism
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

export async function POST(req) {
  if (req.headers.get('x-admin-secret') !== 'tmp-admin-2026') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Find the upcoming events for these movies
  const { data: events } = await supabaseAdmin
    .from('events')
    .select('id, title, max_seats')
    .gte('event_date', new Date().toISOString().split('T')[0])

  const csEvent = events?.find(e => e.title.toLowerCase().includes('city slicker'))
  const chEvent = events?.find(e => e.title.toLowerCase().includes('chocolat'))

  if (!csEvent || !chEvent) {
    return NextResponse.json({
      error: 'Could not find one or both events',
      found: events?.map(e => e.title) || [],
    }, { status: 404 })
  }

  // All members
  const { data: members } = await supabaseAdmin
    .from('members').select('id, name').order('name')

  if (!members?.length) return NextResponse.json({ error: 'No members' }, { status: 500 })

  // Existing active bookings (to skip members who already booked)
  const { data: existingBookings } = await supabaseAdmin
    .from('bookings')
    .select('event_id, member_id')
    .in('event_id', [csEvent.id, chEvent.id])
    .neq('status', 'cancelled')

  const alreadyBooked = (existing, eventId) =>
    new Set((existing || []).filter(b => b.event_id === eventId).map(b => b.member_id))

  // seat distributions — must sum to targets
  // City Slickers: 18 seats across 9 members
  const csSeats  = [3, 3, 2, 2, 2, 2, 2, 1, 1]  // = 18
  const csDays   = [7, 6, 5, 5, 4, 3, 2, 1, 0]

  // Chocolat: 15 seats across 8 members  
  const chSeats  = [3, 3, 2, 2, 2, 1, 1, 1]      // = 15
  const chDays   = [8, 6, 5, 4, 2, 2, 1, 0]

  const inserted = { city_slickers: [], chocolat: [] }

  async function seedEvent(event, seatsArr, daysArr, key, alreadySet) {
    const available = members.filter(m => !alreadySet.has(m.id))
    let idx = 0
    for (let i = 0; i < seatsArr.length; i++) {
      if (idx >= available.length) break
      const member = available[idx++]
      const seats = seatsArr[i]
      const booked_at = daysAgo(daysArr[i])

      const { error } = await supabaseAdmin.from('bookings').insert({
        event_id: event.id,
        member_id: member.id,
        seats,
        status: 'confirmed',
        booked_at,
      })

      inserted[key].push({
        member: member.name,
        seats,
        booked_at: booked_at.split('T')[0],
        status: error ? 'ERROR: ' + error.message : 'confirmed',
      })
    }
  }

  const csAlready = alreadyBooked(existingBookings, csEvent.id)
  const chAlready = alreadyBooked(existingBookings, chEvent.id)

  await seedEvent(csEvent, csSeats, csDays, 'city_slickers', csAlready)
  await seedEvent(chEvent, chSeats, chDays, 'chocolat', chAlready)

  const csSeatTotal = inserted.city_slickers.reduce((s, b) => s + (b.seats || 0), 0)
  const chSeatTotal = inserted.chocolat.reduce((s, b) => s + (b.seats || 0), 0)

  return NextResponse.json({
    city_slickers: { event: csEvent.title, seats_added: csSeatTotal, bookings: inserted.city_slickers },
    chocolat:      { event: chEvent.title, seats_added: chSeatTotal, bookings: inserted.chocolat },
  })
}
