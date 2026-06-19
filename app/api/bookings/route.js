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

// POST — book a seat (or join waitlist if full)
export async function POST(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { event_id } = await req.json()
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data: event } = await supabaseAdmin
    .from('events').select('id, max_seats').eq('id', event_id).single()
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  // Check for existing booking
  const { data: existing } = await supabaseAdmin
    .from('bookings')
    .select('id, status')
    .eq('event_id', event_id)
    .eq('member_id', member.id)
    .maybeSingle()

  if (existing && existing.status !== 'cancelled') {
    return NextResponse.json({ error: 'Already booked' }, { status: 409 })
  }

  // Count confirmed seats
  const { count: confirmedCount } = await supabaseAdmin
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', event_id)
    .eq('status', 'confirmed')

  const status = confirmedCount < event.max_seats ? 'confirmed' : 'waitlist'

  let booking
  if (existing) {
    // Reactivate cancelled booking
    const { data, error } = await supabaseAdmin
      .from('bookings')
      .update({ status, booked_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    booking = data
  } else {
    const { data, error } = await supabaseAdmin
      .from('bookings')
      .insert({ event_id, member_id: member.id, status })
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    booking = data
  }

  return NextResponse.json(booking)
}

// DELETE — cancel booking (promote first waitlisted person if confirmed)
export async function DELETE(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { event_id } = await req.json()
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id, member_id, status')
    .eq('event_id', event_id)
    .eq('member_id', member.id)
    .maybeSingle()

  if (!booking) return NextResponse.json({ error: 'No booking found' }, { status: 404 })
  if (booking.status === 'cancelled') return NextResponse.json({ error: 'Already cancelled' }, { status: 409 })

  const wasConfirmed = booking.status === 'confirmed'

  await supabaseAdmin
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', booking.id)

  // Promote first waitlisted person
  if (wasConfirmed) {
    const { data: nextWaiting } = await supabaseAdmin
      .from('bookings')
      .select('id')
      .eq('event_id', event_id)
      .eq('status', 'waitlist')
      .order('booked_at')
      .limit(1)
      .maybeSingle()

    if (nextWaiting) {
      await supabaseAdmin
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('id', nextWaiting.id)
    }
  }

  return NextResponse.json({ success: true })
}
