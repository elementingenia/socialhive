'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function parseGenres(g) {
  if (!g) return []
  return g.split(/[,|\/]/).map(x => x.trim()).filter(Boolean)
}
function localDate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function fmtDate(str) {
  if (!str) return ''
  return localDate(str).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
}
function fmtTime(str) {
  if (!str) return ''
  const [h, m] = str.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${hour}:${String(m).padStart(2, '0')}${ampm}`
}

// ── Next Screening Card ───────────────────────────────────────────────────────
function NextScreeningCard({ event, myBooking, onBook }) {
  const movie = event.movies
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const evDate = localDate(event.event_date)
  const daysUntil = Math.round((evDate - today) / 86400000)
  const daysLabel = daysUntil === 0 ? 'Today!' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`
  const confirmedSeats = myBooking?.confirmed_seats || 0
  const isBooked = confirmedSeats > 0
  const isWaitlist = myBooking?.has_waitlist && !myBooking?.has_confirmed

  return (
    <div style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow)', marginBottom: '1.25rem' }}>
      <div style={{ background: 'var(--teal)', padding: '0.6rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>Next Screening</span>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.78rem', fontWeight: 600 }}>{daysLabel}</span>
      </div>
      <div style={{ display: 'flex' }}>
        {movie?.poster_url && (
          <img src={movie.poster_url} alt={movie.title} style={{ width: 90, objectFit: 'cover', flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, padding: '0.9rem 1rem' }}>
          <div style={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1.2, marginBottom: '0.3rem' }}>{movie?.title || event.title}</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>{fmtDate(event.event_date)}</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
            {fmtTime(event.event_time)}{event.location ? ` · ${event.location}` : ''}
          </div>
          {movie?.genre && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.5rem' }}>
              {parseGenres(movie.genre).slice(0, 2).map(g => (
                <span key={g} style={{ background: 'var(--surface2)', borderRadius: '20px', padding: '0.12rem 0.45rem', fontSize: '0.68rem', color: 'var(--text-dim)' }}>{g}</span>
              ))}
            </div>
          )}
          {isBooked ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: '#dcfce7', color: '#15803d', borderRadius: '20px', padding: '0.25rem 0.75rem', fontSize: '0.78rem', fontWeight: 700 }}>
              ✓ Booked · {confirmedSeats} seat{confirmedSeats !== 1 ? 's' : ''}
            </div>
          ) : isWaitlist ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: '#fef3c7', color: '#d97706', borderRadius: '20px', padding: '0.25rem 0.75rem', fontSize: '0.78rem', fontWeight: 700 }}>
              #{myBooking.waitlist_position} on waitlist
            </div>
          ) : (
            <button onClick={onBook} style={{ background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '20px', padding: '0.35rem 1rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
              Book Now
            </button>
          )}
        </div>
      </div>
      {event.notes && (
        <div style={{ padding: '0.65rem 1rem', borderTop: '1px solid var(--border)', fontSize: '0.83rem', color: 'var(--text-dim)', fontStyle: 'italic', lineHeight: 1.5 }}>
          {event.notes}
        </div>
      )}
    </div>
  )
}

// ── My Bookings ───────────────────────────────────────────────────────────────
function MyBookingsCard({ bookings, onGo }) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const upcoming = bookings
    .filter(b => b.status !== 'cancelled' && localDate(b.events?.event_date) >= today)
    .sort((a, b) => localDate(a.events?.event_date) - localDate(b.events?.event_date))

  if (!upcoming.length) return null

  return (
    <div style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow)', marginBottom: '1.25rem' }}>
      <div style={{ background: 'var(--amber)', padding: '0.6rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>My Bookings</span>
        <button onClick={onGo} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: '20px', padding: '0.2rem 0.65rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
          View all
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {upcoming.slice(0, 3).map((b, i) => {
          const ev = b.events
          const movie = ev?.movies
          const seats = b.seats || 1
          return (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
              {movie?.poster_url ? (
                <img src={movie.poster_url} alt="" style={{ width: 40, height: 60, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 40, height: 60, background: 'var(--surface2)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>🎬</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {movie?.title || ev?.title || 'Screening'}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>{fmtDate(ev?.event_date)}</div>
                {ev?.event_time && <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{fmtTime(ev.event_time)}</div>}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: b.status === 'waitlist' ? 'var(--amber-dark)' : 'var(--teal)' }}>
                  {b.status === 'waitlist' ? 'Waitlist' : 'Confirmed'}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{seats} seat{seats !== 1 ? 's' : ''}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Unvoted films ─────────────────────────────────────────────────────────────
function UnvotedCard({ movie, onClick }) {
  const genres = parseGenres(movie.genre)
  return (
    <div onClick={onClick} style={{ background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)', borderLeft: '3px solid var(--teal)', display: 'flex', overflow: 'hidden', cursor: 'pointer', minHeight: 90 }}>
      {movie.poster_url
        ? <img src={movie.poster_url} alt={movie.title} style={{ width: 62, objectFit: 'cover', flexShrink: 0 }} />
        : <div style={{ width: 62, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>🎬</div>}
      <div style={{ flex: 1, padding: '0.65rem 0.75rem', overflow: 'hidden' }}>
        <div style={{ fontWeight: 700, fontSize: '0.88rem', lineHeight: 1.2, marginBottom: '0.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{movie.title}</div>
        {movie.year && <div style={{ fontSize: '0.73rem', color: 'var(--text-dim)' }}>{movie.year}{movie.runtime ? ` · ${movie.runtime}` : ''}</div>}
        {genres.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', marginTop: '0.25rem' }}>
            {genres.slice(0, 2).map(g => <span key={g} style={{ background: 'var(--surface2)', borderRadius: '20px', padding: '0.1rem 0.4rem', fontSize: '0.65rem', color: 'var(--text-dim)' }}>{g}</span>)}
          </div>
        )}
      </div>
      <div style={{ padding: '0.65rem 0.75rem', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ background: 'var(--teal)', color: '#fff', borderRadius: '20px', padding: '0.2rem 0.6rem', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
          Rate it
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MoviesHomePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [nextEvent, setNextEvent] = useState(null)
  const [myBookings, setMyBookings] = useState([])
  const [nextBooking, setNextBooking] = useState(null)
  const [unvoted, setUnvoted] = useState([])

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }

    const { data: memberData } = await supabase
      .from('members').select('id').eq('auth_id', session.user.id).single()
    if (!memberData) { setLoading(false); return }

    const today = new Date().toISOString().split('T')[0]

    const [
      { data: eventsData },
      { data: bookingsData },
      { data: moviesData },
      { data: votesData },
    ] = await Promise.all([
      // Next upcoming movie screening
      supabase.from('events')
        .select('*, movies(id, title, poster_url, genre, runtime, year)')
        .eq('hub_type', 'movie')
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .order('event_time', { ascending: true })
        .limit(1),

      // My bookings — events join (movie hub only)
      supabase.from('bookings')
        .select('id, event_id, status, seats, booked_at, events(id, event_date, event_time, title, movies(id, title, poster_url))')
        .eq('member_id', memberData.id)
        .neq('status', 'cancelled'),

      // Movies for unvoted list (exclude DVDs)
      supabase.from('movies')
        .select('id, title, poster_url, genre, year, runtime')
        .eq('we_own', false)
        .order('added_at', { ascending: false })
        .limit(50),

      // My votes
      supabase.from('votes')
        .select('movie_id')
        .eq('member_id', memberData.id),
    ])

    const nextEv = eventsData?.[0] || null
    setNextEvent(nextEv)
    setMyBookings(bookingsData || [])

    // Find my booking for next event
    if (nextEv && bookingsData) {
      const nb = bookingsData.find(b => b.event_id === nextEv.id)
      setNextBooking(nb || null)
    }

    // Unvoted — movies with no vote from this member
    const votedIds = new Set((votesData || []).map(v => v.movie_id))
    setUnvoted((moviesData || []).filter(m => !votedIds.has(m.id)))

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}><div className="spinner" /></div>
  }

  // Build a simple booking summary for NextScreeningCard
  const nextBookingSummary = nextBooking ? {
    confirmed_seats: nextBooking.seats || 1,
    has_confirmed: nextBooking.status === 'confirmed',
    has_waitlist: nextBooking.status === 'waitlist',
    waitlist_position: null,
  } : null

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '1rem 1rem 6rem' }}>

      {nextEvent ? (
        <NextScreeningCard
          event={nextEvent}
          myBooking={nextBookingSummary}
          onBook={() => router.push('/screenings')}
        />
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', padding: '1.5rem 1.25rem', textAlign: 'center', marginBottom: '1.25rem', boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎬</div>
          <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>No upcoming screenings</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>Check back soon — the next film will be announced here.</div>
        </div>
      )}

      <MyBookingsCard bookings={myBookings} onGo={() => router.push('/screenings')} />

      {unvoted.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Not Yet Rated</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Films waiting for your vote</div>
            </div>
            <button onClick={() => router.push('/library')} style={{ background: 'none', border: '1px solid var(--teal)', color: 'var(--teal)', borderRadius: '20px', padding: '0.3rem 0.75rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
              View all
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {unvoted.slice(0, 8).map(m => (
              <UnvotedCard key={m.id} movie={m} onClick={() => router.push('/library')} />
            ))}
          </div>
          {unvoted.length > 8 && (
            <button onClick={() => router.push('/library')} style={{ width: '100%', marginTop: '0.75rem', padding: '0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--teal)', cursor: 'pointer' }}>
              + {unvoted.length - 8} more to rate
            </button>
          )}
        </div>
      )}

      {unvoted.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem 0' }}>
          <div style={{ fontSize: '0.9rem' }}>You are all caught up on ratings!</div>
          <button onClick={() => router.push('/library')} style={{ marginTop: '0.75rem', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '20px', padding: '0.5rem 1.25rem', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
            Browse suggestions
          </button>
        </div>
      )}
    </div>
  )
}
