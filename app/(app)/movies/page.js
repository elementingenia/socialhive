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

// ── Next Screening Card (entire card clickable) ───────────────────────────────
function NextScreeningCard({ event, myBooking }) {
  const router = useRouter()
  const movie = event.movies
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const evDate = localDate(event.event_date)
  const daysUntil = Math.round((evDate - today) / 86400000)
  const daysLabel = daysUntil === 0 ? 'Today!' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`
  const isBooked = myBooking?.has_confirmed
  const isWaitlist = myBooking?.has_waitlist && !myBooking?.has_confirmed

  return (
    <div
      onClick={() => router.push('/screenings')}
      style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow)', marginBottom: '1.25rem', cursor: 'pointer' }}
    >
      <div style={{ background: 'var(--teal)', padding: '0.6rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>Next Screening</span>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.78rem', fontWeight: 600 }}>{daysLabel} ›</span>
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
          {isBooked ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: '#dcfce7', color: '#15803d', borderRadius: '20px', padding: '0.25rem 0.75rem', fontSize: '0.78rem', fontWeight: 700 }}>
              ✓ Booked · {myBooking.confirmed_seats} seat{myBooking.confirmed_seats !== 1 ? 's' : ''}
            </div>
          ) : isWaitlist ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: '#fef3c7', color: '#d97706', borderRadius: '20px', padding: '0.25rem 0.75rem', fontSize: '0.78rem', fontWeight: 700 }}>
              Waitlisted
            </div>
          ) : (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(0,128,128,0.1)', color: 'var(--teal)', borderRadius: '20px', padding: '0.25rem 0.75rem', fontSize: '0.78rem', fontWeight: 700 }}>
              Tap to book
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── My Bookings Card (→ /bookings) ────────────────────────────────────────────
function MyBookingsCard({ bookings }) {
  const router = useRouter()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const upcoming = bookings
    .filter(b => b.status !== 'cancelled' && localDate(b.events?.event_date) >= today)
    .sort((a, b) => localDate(a.events?.event_date) - localDate(b.events?.event_date))

  if (!upcoming.length) return null

  return (
    <div
      onClick={() => router.push('/bookings')}
      style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow)', marginBottom: '1.25rem', cursor: 'pointer' }}
    >
      <div style={{ background: 'var(--amber)', padding: '0.6rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>My Bookings</span>
        <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.78rem', fontWeight: 600 }}>View all ›</span>
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

// ── Rapid-fire Rating Swiper ──────────────────────────────────────────────────
function RatingSwiper({ movies, memberId, onDone }) {
  const router = useRouter()
  const [idx, setIdx]         = useState(0)
  const [rated, setRated]     = useState(0)
  const [submitting, setSub]  = useState(false)
  const [ignored, setIgnored] = useState(new Set())
  const [allDone, setAllDone] = useState(false)

  // Build queue — active movies (not ignored)
  const queue = movies.filter(m => !ignored.has(m.id))
  const movie  = queue[idx] || null
  const total  = queue.length
  const isLast = idx >= total - 1

  async function submitRating(score) {
    if (!movie || submitting) return
    setSub(true)
    await supabase.from('votes').upsert(
      { member_id: memberId, movie_id: movie.id, score },
      { onConflict: 'member_id,movie_id' }
    )
    setSub(false)
    setRated(r => r + 1)
    advance()
  }

  function skipOne() {
    setIgnored(prev => new Set([...prev, movie.id]))
    // After ignoring, idx stays same but queue shrinks; if we're at the end, done
    if (idx >= queue.length - 2) {
      setAllDone(true)
      onDone()
    }
  }

  function advance() {
    if (isLast) {
      setAllDone(true)
      onDone()
    } else {
      setIdx(i => i + 1)
    }
  }

  function skipAll() {
    setAllDone(true)
    onDone()
  }

  if (allDone || total === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 0' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎉</div>
        <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
          {rated > 0 ? `${rated} film${rated !== 1 ? 's' : ''} rated!` : 'All caught up'}
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>
          Browse more in Suggestions
        </div>
        <button onClick={() => router.push('/library')}
          style={{ background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '20px', padding: '0.55rem 1.5rem', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer' }}>
          Browse Suggestions
        </button>
      </div>
    )
  }

  const genres = parseGenres(movie.genre)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Rate a Film</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{idx + 1} of {total} to rate</div>
        </div>
        <button onClick={skipAll}
          style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: '20px', padding: '0.25rem 0.65rem', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
          Skip all
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'var(--surface2)', borderRadius: 2, marginBottom: '1rem', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${((idx) / total) * 100}%`, background: 'var(--teal)', borderRadius: 2, transition: 'width 0.3s ease' }} />
      </div>

      {/* Movie card */}
      <div style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow)', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', minHeight: 120 }}>
          {movie.poster_url ? (
            <img src={movie.poster_url} alt={movie.title} style={{ width: 90, objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 90, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', flexShrink: 0 }}>🎬</div>
          )}
          <div style={{ flex: 1, padding: '0.9rem 1rem' }}>
            <div style={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1.2, marginBottom: '0.25rem' }}>{movie.title}</div>
            {movie.year && <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '0.35rem' }}>{movie.year}{movie.runtime ? ` · ${movie.runtime}` : ''}</div>}
            {genres.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                {genres.slice(0, 3).map(g => (
                  <span key={g} style={{ background: 'var(--surface2)', borderRadius: '20px', padding: '0.1rem 0.4rem', fontSize: '0.65rem', color: 'var(--text-dim)' }}>{g}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Score buttons */}
        <div style={{ padding: '0.75rem 0.85rem 0.85rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem', textAlign: 'center' }}>
            How keen are you to watch this?
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.35rem', marginBottom: '0.5rem' }}>
            {[1,2,3,4,5,6,7,8,9,10].map(score => (
              <button key={score} onClick={() => submitRating(score)} disabled={submitting}
                style={{
                  padding: '0.5rem 0',
                  borderRadius: '10px',
                  border: '1.5px solid var(--border)',
                  background: score >= 8 ? 'rgba(0,128,128,0.08)' : 'var(--surface)',
                  color: score >= 8 ? 'var(--teal)' : 'var(--text)',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.5 : 1,
                }}>
                {score}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-dim)', paddingLeft: '0.1rem', paddingRight: '0.1rem', marginBottom: '0.6rem' }}>
            <span>Not interested</span>
            <span>Can't wait!</span>
          </div>
          <button onClick={skipOne}
            style={{ width: '100%', padding: '0.5rem', background: 'none', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', cursor: 'pointer' }}>
            Skip this one
          </button>
        </div>
      </div>

      {/* Prev/next nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
        <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
          style={{ flex: 1, padding: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 600, color: idx === 0 ? 'var(--text-dim)' : 'var(--text)', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.4 : 1 }}>
          ‹ Prev
        </button>
        <button onClick={advance} disabled={isLast}
          style={{ flex: 1, padding: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 600, color: isLast ? 'var(--text-dim)' : 'var(--text)', cursor: isLast ? 'not-allowed' : 'pointer', opacity: isLast ? 0.4 : 1 }}>
          Next ›
        </button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MoviesHomePage() {
  const [loading, setLoading]     = useState(true)
  const [nextEvent, setNextEvent] = useState(null)
  const [myBookings, setMyBookings] = useState([])
  const [nextBooking, setNextBooking] = useState(null)
  const [unvoted, setUnvoted]     = useState([])
  const [memberId, setMemberId]   = useState(null)
  const [swiperDone, setSwiperDone] = useState(false)

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }

    const { data: memberData } = await supabase
      .from('members').select('id').eq('auth_id', session.user.id).single()
    if (!memberData) { setLoading(false); return }

    setMemberId(memberData.id)
    const today = new Date().toISOString().split('T')[0]

    const [
      { data: eventsData },
      { data: bookingsData },
      { data: moviesData },
      { data: votesData },
    ] = await Promise.all([
      supabase.from('events')
        .select('*, movies(id, title, poster_url, genre, runtime, year)')
        .eq('hub_type', 'movie')
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .order('event_time', { ascending: true })
        .limit(1),

      supabase.from('bookings')
        .select('id, event_id, status, seats, booked_at, events(id, event_date, event_time, title, movies(id, title, poster_url))')
        .eq('member_id', memberData.id)
        .neq('status', 'cancelled'),

      supabase.from('movies')
        .select('id, title, poster_url, genre, year, runtime')
        .eq('we_own', false)
        .order('added_at', { ascending: false })
        .limit(50),

      supabase.from('votes')
        .select('movie_id')
        .eq('member_id', memberData.id),
    ])

    const nextEv = eventsData?.[0] || null
    setNextEvent(nextEv)
    setMyBookings(bookingsData || [])

    if (nextEv && bookingsData) {
      const nb = bookingsData.find(b => b.event_id === nextEv.id)
      setNextBooking(nb || null)
    }

    const votedIds = new Set((votesData || []).map(v => v.movie_id))
    setUnvoted((moviesData || []).filter(m => !votedIds.has(m.id)))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}><div className="spinner" /></div>
  }

  const nextBookingSummary = nextBooking ? {
    confirmed_seats: nextBooking.seats || 1,
    has_confirmed: nextBooking.status === 'confirmed',
    has_waitlist: nextBooking.status === 'waitlist',
  } : null

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '1rem 1rem 6rem' }}>

      {nextEvent ? (
        <NextScreeningCard event={nextEvent} myBooking={nextBookingSummary} />
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', padding: '1.5rem 1.25rem', textAlign: 'center', marginBottom: '1.25rem', boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎬</div>
          <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>No upcoming screenings</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>Check back soon — the next film will be announced here.</div>
        </div>
      )}

      <MyBookingsCard bookings={myBookings} />

      {!swiperDone && unvoted.length > 0 && memberId && (
        <RatingSwiper movies={unvoted} memberId={memberId} onDone={() => setSwiperDone(true)} />
      )}

      {(swiperDone || unvoted.length === 0) && (
        <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '1.5rem 0' }}>
          <div style={{ fontSize: '0.88rem' }}>You&apos;re all caught up on ratings!</div>
        </div>
      )}
    </div>
  )
}
