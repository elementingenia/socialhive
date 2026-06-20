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
  const [y,m,d] = str.split('-').map(Number)
  return new Date(y, m-1, d)
}

function fmtDate(str) {
  if (!str) return ''
  const d = localDate(str)
  return d.toLocaleDateString('en-AU', { weekday:'long', day:'numeric', month:'long' })
}

function fmtTime(str) {
  if (!str) return ''
  const [h,m] = str.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h
  return hour + ':' + String(m).padStart(2,'0') + ampm
}

// ── Next Screening Card ───────────────────────────────────────────────────────
function NextScreeningCard({ screening, myBooking, onViewSchedule }) {
  const movie = screening.movies
  const today = new Date(); today.setHours(0,0,0,0)
  const screenDate = localDate(screening.date)
  const daysUntil = Math.round((screenDate - today) / 86400000)
  const daysLabel = daysUntil === 0 ? 'Today!' : daysUntil === 1 ? 'Tomorrow' : 'In ' + daysUntil + ' days'

  return (
    <div style={{ background:'var(--surface)', borderRadius:'16px', border:'1px solid var(--border)', overflow:'hidden', boxShadow:'var(--shadow)', marginBottom:'1.25rem' }}>
      <div style={{ background:'var(--teal)', padding:'0.6rem 1rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ color:'#fff', fontWeight:700, fontSize:'0.85rem' }}>Next Screening</span>
        <span style={{ color:'rgba(255,255,255,0.85)', fontSize:'0.78rem', fontWeight:600 }}>{daysLabel}</span>
      </div>
      <div style={{ display:'flex', gap:0 }}>
        {movie?.poster_url && (
          <img src={movie.poster_url} alt={movie.title} style={{ width:90, objectFit:'cover', flexShrink:0 }} />
        )}
        <div style={{ flex:1, padding:'0.9rem 1rem' }}>
          <div style={{ fontWeight:800, fontSize:'1rem', lineHeight:1.2, marginBottom:'0.3rem' }}>{movie?.title || screening.title}</div>
          <div style={{ fontSize:'0.82rem', color:'var(--text-dim)', marginBottom:'0.3rem' }}>{fmtDate(screening.date)}</div>
          {screening.time && <div style={{ fontSize:'0.82rem', color:'var(--text-dim)', marginBottom:'0.5rem' }}>{fmtTime(screening.time)}{screening.location ? ' · ' + screening.location : ''}</div>}
          {movie?.genre && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:'0.25rem', marginBottom:'0.5rem' }}>
              {parseGenres(movie.genre).slice(0,2).map(g=>(
                <span key={g} style={{ background:'var(--surface2)', borderRadius:'20px', padding:'0.12rem 0.45rem', fontSize:'0.68rem', color:'var(--text-dim)' }}>{g}</span>
              ))}
            </div>
          )}
          {myBooking ? (
            <div style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem', background:'#dcfce7', color:'#15803d', borderRadius:'20px', padding:'0.2rem 0.65rem', fontSize:'0.78rem', fontWeight:700 }}>
              Booked - {myBooking.seats} seat{myBooking.seats!==1?'s':''}
            </div>
          ) : (
            <button onClick={onViewSchedule} style={{ background:'var(--teal)', color:'#fff', border:'none', borderRadius:'20px', padding:'0.3rem 0.85rem', fontSize:'0.78rem', fontWeight:700, cursor:'pointer' }}>
              Book Now
            </button>
          )}
        </div>
      </div>
      {screening.welcome_message && (
        <div style={{ padding:'0.75rem 1rem', borderTop:'1px solid var(--border)', fontSize:'0.83rem', color:'var(--text-dim)', fontStyle:'italic', lineHeight:1.5 }}>
          {screening.welcome_message}
        </div>
      )}
    </div>
  )
}

// ── My Bookings Card ──────────────────────────────────────────────────────────
function MyBookingsCard({ bookings, onViewSchedule }) {
  const today = new Date(); today.setHours(0,0,0,0)
  const upcoming = bookings.filter(b => {
    const d = localDate(b.screenings?.date)
    return d && d >= today
  }).sort((a,b) => localDate(a.screenings?.date) - localDate(b.screenings?.date))

  if (upcoming.length === 0) return null

  return (
    <div style={{ background:'var(--surface)', borderRadius:'16px', border:'1px solid var(--border)', overflow:'hidden', boxShadow:'var(--shadow)', marginBottom:'1.25rem' }}>
      <div style={{ background:'var(--amber)', padding:'0.6rem 1rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ color:'#fff', fontWeight:700, fontSize:'0.85rem' }}>My Bookings</span>
        <button onClick={onViewSchedule} style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', borderRadius:'20px', padding:'0.2rem 0.65rem', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}>
          View all
        </button>
      </div>
      <div style={{ display:'flex', flexDirection:'column' }}>
        {upcoming.slice(0,3).map((b,i) => (
          <div key={b.id} style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.75rem 1rem', borderTop: i>0 ? '1px solid var(--border)' : 'none' }}>
            {b.screenings?.movies?.poster_url && (
              <img src={b.screenings.movies.poster_url} alt="" style={{ width:40, height:60, objectFit:'cover', borderRadius:4, flexShrink:0 }} />
            )}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, fontSize:'0.88rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {b.screenings?.movies?.title || b.screenings?.title || 'Screening'}
              </div>
              <div style={{ fontSize:'0.78rem', color:'var(--text-dim)', marginTop:'0.15rem' }}>{fmtDate(b.screenings?.date)}</div>
              {b.screenings?.time && <div style={{ fontSize:'0.75rem', color:'var(--text-dim)' }}>{fmtTime(b.screenings.time)}</div>}
            </div>
            <div style={{ textAlign:'right', flexShrink:0 }}>
              <div style={{ fontSize:'0.78rem', fontWeight:700, color: b.status==='waitlist' ? 'var(--amber-dark)' : 'var(--teal)' }}>
                {b.status==='waitlist' ? 'Waitlist' : 'Confirmed'}
              </div>
              <div style={{ fontSize:'0.72rem', color:'var(--text-dim)' }}>{b.seats} seat{b.seats!==1?'s':''}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Unvoted Movies ────────────────────────────────────────────────────────────
function UnvotedCard({ movie, onClick }) {
  const genres = parseGenres(movie.genre)
  return (
    <div onClick={onClick} style={{ background:'var(--surface)', borderRadius:'12px', border:'1px solid var(--border)', borderLeft:'3px solid var(--teal)', display:'flex', overflow:'hidden', cursor:'pointer', minHeight:90 }}>
      {movie.poster_url
        ? <img src={movie.poster_url} alt={movie.title} style={{ width:62, objectFit:'cover', flexShrink:0 }} />
        : <div style={{ width:62, background:'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.3rem', flexShrink:0 }}>Film</div>}
      <div style={{ flex:1, padding:'0.65rem 0.75rem', overflow:'hidden' }}>
        <div style={{ fontWeight:700, fontSize:'0.88rem', lineHeight:1.2, marginBottom:'0.15rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{movie.title}</div>
        {movie.year && <div style={{ fontSize:'0.73rem', color:'var(--text-dim)' }}>{movie.year}{movie.runtime ? ' · ' + movie.runtime : ''}</div>}
        {genres.length>0 && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:'0.2rem', marginTop:'0.25rem' }}>
            {genres.slice(0,2).map(g=><span key={g} style={{ background:'var(--surface2)', borderRadius:'20px', padding:'0.1rem 0.4rem', fontSize:'0.65rem', color:'var(--text-dim)' }}>{g}</span>)}
          </div>
        )}
      </div>
      <div style={{ padding:'0.65rem 0.75rem', display:'flex', alignItems:'center', flexShrink:0 }}>
        <div style={{ background:'var(--teal)', color:'#fff', borderRadius:'20px', padding:'0.2rem 0.6rem', fontSize:'0.72rem', fontWeight:700, whiteSpace:'nowrap' }}>
          Rate it
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MoviesHomePage() {
  const router = useRouter()
  const [loading,       setLoading]       = useState(true)
  const [nextScreening, setNextScreening] = useState(null)
  const [myBookings,    setMyBookings]    = useState([])
  const [nextBooking,   setNextBooking]   = useState(null)
  const [unvoted,       setUnvoted]       = useState([])
  const [selectedUnvoted, setSelectedUnvoted] = useState(null)
  const [member, setMember] = useState(null)

  const load = useCallback(async () => {
    const { data:{ session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }

    const { data: memberData } = await supabase
      .from('members').select('id, is_admin').eq('auth_id', session.user.id).single()
    setMember(memberData)

    const today = new Date().toISOString().split('T')[0]

    const [
      { data: screeningsData },
      { data: bookingsData },
      { data: moviesData },
      { data: votesData },
    ] = await Promise.all([
      supabase.from('screenings')
        .select('*, movies(id, title, poster_url, genre, rating_imdb, imdb_id, runtime, year)')
        .eq('hub_type', 'movie')
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(1),
      supabase.from('bookings')
        .select('*, screenings(id, date, time, title, location, movies(id, title, poster_url))')
        .eq('member_id', memberData?.id),
      supabase.from('movies').select('id, title, poster_url, genre, year, runtime, rating_imdb').eq('we_own', false).order('added_at', { ascending: false }).limit(30),
      supabase.from('votes').select('movie_id').eq('member_id', memberData?.id),
    ])

    setNextScreening(screeningsData?.[0] || null)
    setMyBookings(bookingsData || [])

    // Find booking for next screening
    if (screeningsData?.[0] && bookingsData) {
      const nb = bookingsData.find(b => b.screening_id === screeningsData[0].id && b.status !== 'cancelled')
      setNextBooking(nb || null)
    }

    // Unvoted movies — those not yet rated by this member
    const votedIds = new Set((votesData||[]).map(v => v.movie_id))
    const unvotedList = (moviesData||[]).filter(m => !votedIds.has(m.id))
    setUnvoted(unvotedList)

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'60vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div style={{ background:'var(--bg)', minHeight:'100vh', padding:'1rem 1rem 6rem' }}>

      {/* Next Screening */}
      {nextScreening ? (
        <NextScreeningCard
          screening={nextScreening}
          myBooking={nextBooking}
          onViewSchedule={() => router.push('/screenings')}
        />
      ) : (
        <div style={{ background:'var(--surface)', borderRadius:'16px', border:'1px solid var(--border)', padding:'1.5rem 1.25rem', textAlign:'center', marginBottom:'1.25rem', boxShadow:'var(--shadow)' }}>
          <div style={{ fontSize:'2rem', marginBottom:'0.5rem' }}>Film</div>
          <div style={{ fontWeight:700, marginBottom:'0.25rem' }}>No upcoming screenings</div>
          <div style={{ fontSize:'0.85rem', color:'var(--text-dim)', lineHeight:1.5 }}>Check back soon — the next film will be announced here.</div>
        </div>
      )}

      {/* My Bookings */}
      <MyBookingsCard bookings={myBookings} onViewSchedule={() => router.push('/screenings')} />

      {/* Unvoted movies */}
      {unvoted.length > 0 && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
            <div>
              <div style={{ fontWeight:700, fontSize:'0.95rem' }}>Not Yet Rated</div>
              <div style={{ fontSize:'0.78rem', color:'var(--text-dim)' }}>Films waiting for your vote</div>
            </div>
            <button onClick={() => router.push('/library')} style={{ background:'none', border:'1px solid var(--teal)', color:'var(--teal)', borderRadius:'20px', padding:'0.3rem 0.75rem', fontSize:'0.78rem', fontWeight:600, cursor:'pointer' }}>
              View all
            </button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.55rem' }}>
            {unvoted.slice(0, 8).map(m => (
              <UnvotedCard key={m.id} movie={m} onClick={() => router.push('/library')} />
            ))}
          </div>
          {unvoted.length > 8 && (
            <button onClick={() => router.push('/library')} style={{ width:'100%', marginTop:'0.75rem', padding:'0.75rem', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', fontSize:'0.85rem', fontWeight:600, color:'var(--teal)', cursor:'pointer' }}>
              + {unvoted.length - 8} more to rate
            </button>
          )}
        </div>
      )}

      {unvoted.length === 0 && !nextScreening && (
        <div style={{ textAlign:'center', color:'var(--text-dim)', padding:'2rem 0' }}>
          <div style={{ fontSize:'0.9rem' }}>You are all caught up on ratings!</div>
          <button onClick={() => router.push('/library')} style={{ marginTop:'0.75rem', background:'var(--teal)', color:'#fff', border:'none', borderRadius:'20px', padding:'0.5rem 1.25rem', fontSize:'0.85rem', fontWeight:700, cursor:'pointer' }}>
            Browse suggestions
          </button>
        </div>
      )}
    </div>
  )
}
