'use client'
import { useEffect, useState, useCallback } from 'react'
import { FormattedText } from '@/lib/textFormatter'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import EventSlideOut from '@/components/EventSlideOut'

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
function NextScreeningCard({ event, myBooking, coordinator, onOpen }) {
  const movie = event.movies || event.movie_snapshot
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const evDate = localDate(event.event_date)
  const daysUntil = Math.round((evDate - today) / 86400000)
  const daysLabel = daysUntil === 0 ? 'Today!' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`
  const isBooked = myBooking?.has_confirmed
  const isWaitlist = myBooking?.has_waitlist && !myBooking?.has_confirmed

  return (
    <div
      onClick={onOpen}
      style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow)', marginBottom: '1.25rem', cursor: 'pointer' }}
    >
      <div style={{ background: 'var(--teal)', padding: '0.6rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>Next Screening</span>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.78rem', fontWeight: 600 }}>{daysLabel} · Tap to book</span>
      </div>
      <div style={{ display: 'flex' }}>
        {movie?.poster_url ? (
          <img src={movie.poster_url} alt={movie.title} style={{ width: 100, objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 100, minHeight: 130, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', flexShrink: 0 }}>🎬</div>
        )}
        <div style={{ flex: 1, padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <div style={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.2 }}>{movie?.title || event.title}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--teal)', fontWeight: 600 }}>
            {fmtDate(event.event_date)} · {fmtTime(event.event_time)}
          </div>
          {(movie?.rating_imdb || movie?.rating_rt) && (
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {movie.rating_imdb && (
                <span style={{ background: 'rgba(180,150,0,0.15)', color: 'var(--amber-dark)', fontWeight: 700, fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '20px' }}>IMDb {movie.rating_imdb}</span>
              )}
              {movie.rating_rt && (
                <span style={{ background: 'rgba(220,50,30,0.12)', color: '#c0392b', fontWeight: 700, fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '20px' }}>🍅 RT {movie.rating_rt}</span>
              )}
              {coordinator && (
                <span style={{ fontSize: '0.68rem', color: 'var(--teal)', fontWeight: 600 }}>
                  👤 {coordinator.name || coordinator.username}
                </span>
              )}
            </div>
          )}
          {!movie?.rating_imdb && !movie?.rating_rt && coordinator && (
            <div style={{ fontSize: '0.72rem', color: 'var(--teal)', fontWeight: 600 }}>
              👤 {coordinator.name || coordinator.username}
            </div>
          )}
          {movie?.plot && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {movie.plot}
            </div>
          )}
          {event.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontStyle: 'italic', lineHeight: 1.4 }}>{event.notes}</div>}
          <div style={{ marginTop: '0.1rem' }}>
            {isBooked ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', background: '#dcfce7', color: '#15803d', borderRadius: '20px', padding: '0.25rem 0.75rem', fontSize: '0.78rem', fontWeight: 700 }}>
                ✓ Booked · {myBooking.confirmed_seats} seat{myBooking.confirmed_seats !== 1 ? 's' : ''}
              </div>
            ) : (
              <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(0,128,128,0.1)', color: 'var(--teal)', borderRadius: '20px', padding: '0.25rem 0.75rem', fontSize: '0.78rem', fontWeight: 700 }}>
                Tap to book →
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── My Movie Bookings Sheet ───────────────────────────────────────────────────
function MyMovieBookingsSheet({ bookings, session, onClose, onRefresh }) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const [cancelling, setCancelling] = useState(null)
  const [confirmCancel, setConfirmCancel] = useState(null) // { eventId, type:'confirmed'|'waitlist', title }
  const [toast, setToast] = useState(null)

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 3500) }

  // Group by event_id — one card per screening
  const upcoming = bookings.filter(b => b.status !== 'cancelled' && b.events?.hub_type === 'movie' && localDate(b.events?.event_date) >= today)
  const grouped = {}
  for (const b of upcoming) {
    if (!grouped[b.event_id]) grouped[b.event_id] = { ev: b.events, confirmed: [], waitlist: [] }
    if (b.status === 'waitlist') grouped[b.event_id].waitlist.push(b)
    else grouped[b.event_id].confirmed.push(b)
  }
  const groups = Object.values(grouped).sort((a, b) => localDate(a.ev?.event_date) - localDate(b.ev?.event_date))

  async function doCancel(eventId, title) {
    setConfirmCancel(null)
    setCancelling(eventId)
    const res = await fetch('/api/bookings', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ event_id: eventId }),
    })
    setCancelling(null)
    if (!res.ok) { showToast('Could not cancel — please try again'); return }
    showToast('Booking cancelled for ' + title)
    onRefresh()
  }

  return (
    <>
      {toast && (
        <div style={{ position:'fixed', top:'1rem', left:'50%', transform:'translateX(-50%)', zIndex:400, background:'#15803d', color:'#fff', padding:'0.75rem 1.1rem', borderRadius:'12px', fontSize:'0.88rem', fontWeight:600, boxShadow:'0 4px 20px rgba(0,0,0,0.2)', pointerEvents:'none', minWidth:240 }}>
          ✓ {toast}
        </div>
      )}
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:200 }} />
      <div style={{ position:'fixed', inset:0, background:'var(--bg)', zIndex:201, overflowY:'auto', display:'flex', flexDirection:'column' }}>
        <div style={{ position:'sticky', top:0, background:'var(--bg)', borderBottom:'1px solid var(--border)', padding:'1rem 1.25rem', display:'flex', alignItems:'center', gap:'0.75rem', zIndex:10 }}>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'1.1rem', cursor:'pointer', color:'var(--teal)', fontWeight:700, padding:'0.25rem 0.5rem 0.25rem 0', lineHeight:1 }}>‹ Movies</button>
          <div style={{ fontWeight:700, fontSize:'1rem' }}>My Movie Bookings</div>
        </div>
        <div style={{ padding:'1rem 1.25rem 5rem', flex:1 }}>
          {groups.length === 0 ? (
            <div style={{ textAlign:'center', color:'var(--text-dim)', padding:'3rem 0', fontSize:'0.9rem' }}>No upcoming movie bookings.</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
              {groups.map(({ ev, confirmed, waitlist }) => {
                const movie = ev?.movies || ev?.movie_snapshot
                const confirmedSeats = confirmed.reduce((s, b) => s + (b.seats || 1), 0)
                const waitlistSeats  = waitlist.reduce((s, b) => s + (b.seats || 1), 0)
                const isCancelling = cancelling === ev?.id
                const isConfirming = confirmCancel?.eventId === ev?.id
                const borderCol = confirmed.length ? 'var(--teal)' : 'var(--amber)'
                return (
                  <div key={ev?.id} style={{ background:'var(--surface)', borderRadius:'14px', border:'1px solid var(--border)', borderLeft:'3px solid ' + borderCol, overflow:'hidden', boxShadow:'var(--shadow)' }}>
                    <div style={{ display:'flex' }}>
                      {movie?.poster_url ? (
                        <img src={movie.poster_url} alt="" style={{ width:80, minHeight:110, objectFit:'cover', flexShrink:0 }} />
                      ) : (
                        <div style={{ width:80, minHeight:110, background:'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.5rem', flexShrink:0 }}>🎬</div>
                      )}
                      <div style={{ flex:1, padding:'0.85rem 1rem' }}>
                        <div style={{ fontWeight:700, fontSize:'0.95rem', lineHeight:1.2, marginBottom:'0.25rem' }}>{movie?.title || ev?.title}</div>
                        <div style={{ fontSize:'0.8rem', color:'var(--teal)', fontWeight:600, marginBottom:'0.15rem' }}>{fmtDate(ev?.event_date)}</div>
                        {ev?.event_time && <div style={{ fontSize:'0.78rem', color:'var(--text-dim)', marginBottom:'0.4rem' }}>{fmtTime(ev.event_time)}</div>}
                        <div style={{ display:'flex', gap:'0.4rem', alignItems:'center', flexWrap:'wrap' }}>
                          {confirmedSeats > 0 && (
                            <span style={{ background:'#dcfce7', color:'#15803d', fontSize:'0.72rem', fontWeight:700, padding:'0.2rem 0.55rem', borderRadius:'20px' }}>
                              ✓ Confirmed · {confirmedSeats} seat{confirmedSeats !== 1 ? 's' : ''}
                            </span>
                          )}
                          {waitlistSeats > 0 && (
                            <span style={{ background:'#fef3c7', color:'#d97706', fontSize:'0.72rem', fontWeight:700, padding:'0.2rem 0.55rem', borderRadius:'20px' }}>
                              ⏳ Waitlist · {waitlistSeats} seat{waitlistSeats !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {isConfirming ? (
                      <div style={{ padding:'0.75rem 1rem', borderTop:'1px solid var(--border)', background:'var(--surface2)', display:'flex', gap:'0.5rem', alignItems:'center' }}>
                        <span style={{ fontSize:'0.82rem', color:'var(--text-dim)', flex:1 }}>Cancel all bookings for this screening?</span>
                        <button onClick={() => setConfirmCancel(null)} style={{ background:'none', border:'1px solid var(--border)', borderRadius:'8px', padding:'0.35rem 0.65rem', fontSize:'0.78rem', cursor:'pointer', color:'var(--text-dim)' }}>Keep</button>
                        <button onClick={() => doCancel(ev?.id, movie?.title || ev?.title)} disabled={isCancelling}
                          style={{ background:'var(--danger)', color:'#fff', border:'none', borderRadius:'8px', padding:'0.35rem 0.65rem', fontSize:'0.78rem', fontWeight:600, cursor:'pointer', opacity:isCancelling?0.6:1 }}>
                          {isCancelling ? '…' : 'Yes, cancel'}
                        </button>
                      </div>
                    ) : (
                      <div style={{ padding:'0.5rem 1rem', borderTop:'1px solid var(--border)', display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                        {confirmedSeats > 0 && (
                          <button onClick={() => setConfirmCancel({ eventId: ev?.id })} disabled={isCancelling}
                            style={{ background:'none', border:'1.5px solid var(--danger)', borderRadius:'8px', padding:'0.35rem 0.75rem', fontSize:'0.78rem', cursor:'pointer', color:'var(--danger)', fontWeight:600 }}>
                            Cancel booking
                          </button>
                        )}
                        {waitlistSeats > 0 && confirmedSeats === 0 && (
                          <button onClick={() => setConfirmCancel({ eventId: ev?.id })} disabled={isCancelling}
                            style={{ background:'none', border:'1.5px solid var(--danger)', borderRadius:'8px', padding:'0.35rem 0.75rem', fontSize:'0.78rem', cursor:'pointer', color:'var(--danger)', fontWeight:600 }}>
                            Leave waitlist
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── My Bookings Card (→ /bookings) ────────────────────────────────────────────
function MyBookingsCard({ bookings, onViewAll, onOpenEvent }) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const upcoming = bookings.filter(b => b.status !== 'cancelled' && b.events?.hub_type === 'movie' && localDate(b.events?.event_date) >= today)

  // Group by event_id
  const grouped = {}
  for (const b of upcoming) {
    if (!grouped[b.event_id]) grouped[b.event_id] = { ev: b.events, confirmed: 0, waitlist: 0 }
    if (b.status === 'waitlist') grouped[b.event_id].waitlist += (b.seats || 1)
    else grouped[b.event_id].confirmed += (b.seats || 1)
  }
  const groups = Object.values(grouped).sort((a, b) => localDate(a.ev?.event_date) - localDate(b.ev?.event_date))

  if (!groups.length) return null

  return (
    <div
      onClick={onViewAll}
      style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow)', marginBottom: '1.25rem', cursor: 'pointer' }}
    >
      <div style={{ background: 'var(--amber)', padding: '0.6rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>My Bookings</span>
        <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.78rem', fontWeight: 600 }}>View all ›</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {groups.slice(0, 3).map(({ ev, confirmed, waitlist }, i) => {
          const movie = ev?.movies || ev?.movie_snapshot
          return (
            <div key={ev?.id} onClick={e => { e.stopPropagation(); onOpenEvent?.(ev?.id) }} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderTop: i > 0 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
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
                {confirmed > 0 && <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--teal)' }}>✓ {confirmed} seat{confirmed !== 1 ? 's' : ''}</div>}
                {waitlist > 0 && <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--amber-dark)' }}>⏳ +{waitlist} waitlist</div>}
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>Tap to manage →</div>
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
                  background: 'var(--surface)',
                  color: 'var(--text)',
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


// ── Hub Welcome Banner (collapsible, persists dismiss in localStorage) ────────
function WelcomeBanner({ text, colour = "var(--teal)" }) {
  const STORAGE_KEY = "movies_welcome_dismissed"
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "1" } catch { return false }
  })
  const [expanded,  setExpanded]  = useState(false)

  if (!text) return null
  if (dismissed) {
    return (
      <button onClick={() => { setDismissed(false); setExpanded(true) }}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
          color: colour, fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
          padding: "0 0 0.75rem", fontFamily: "inherit" }}>
        <span style={{ fontSize: "1rem" }}>ℹ</span> Show welcome message
      </button>
    )
  }
  return (
    <div style={{ background: colour,
      borderRadius: 14, padding: "0.9rem 1rem", marginBottom: "1rem",
      position: "relative" }}>
      <div style={{ fontSize: "0.88rem", lineHeight: 1.55, color: "#fff" }}>
        {/<[a-z][\s\S]*>/i.test(text)
          ? <span dangerouslySetInnerHTML={{ __html: text }} />
          : <FormattedText text={text} c1Colour={colour} c2Colour="var(--text-dim)" />
        }
      </div>
      <button
        onClick={() => {
          setDismissed(true)
          try { localStorage.setItem(STORAGE_KEY, "1") } catch {}
        }}
        style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none",
          color: "rgba(255,255,255,0.7)", fontSize: "1rem", cursor: "pointer", lineHeight: 1, padding: 4 }}
        aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MoviesHomePage() {
  const router = useRouter()
  const [loading, setLoading]     = useState(true)
  const [welcomeText, setWelcomeText] = useState('')
  const [nextEvent, setNextEvent] = useState(null)
  const [nextEventCoordinator, setNextEventCoordinator] = useState(null)
  const [myBookings, setMyBookings] = useState([])
  const [nextBooking, setNextBooking] = useState(null)
  const [unvoted, setUnvoted]     = useState([])
  const [memberId, setMemberId]   = useState(null)
  const [swiperDone, setSwiperDone] = useState(false)
  const [session, setSession] = useState(null)
  const [slideOutEvent, setSlideOutEvent] = useState(null)

  const load = useCallback(async () => {
    fetch('/api/hub-settings').then(r => r.json()).then(d => setWelcomeText(d.movies?.text || '')).catch(() => {})
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }
    setSession(session)

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
        .select('*, movies(id, title, poster_url, genre, runtime, year, rating_imdb, rating_rt, imdb_id, plot)')
        .eq('hub_type', 'movie')
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .order('event_time', { ascending: true })
        .limit(1),

      supabase.from('bookings')
        .select('id, event_id, status, seats, booked_at, events(id, event_date, event_time, title, hub_type, movies(id, title, poster_url))')
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
    if (nextEv?.id) {
      supabase.from('event_coordinators').select('member_id, members!member_id(id, name, username)')
        .eq('event_id', nextEv.id).is('replaced_at', null).limit(1).maybeSingle()
        .then(({ data }) => setNextEventCoordinator(data?.members || null))
    } else {
      setNextEventCoordinator(null)
    }
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

  // Opens EventSlideOut for any movie event by ID.
  // Fetches full event + booking counts fresh on every open — always current.
  async function openSlideOutForEvent(eventId, baseEvent = null) {
    if (!eventId || !memberId) return
    const [
      { data: eventData },
      { data: myRows },
      { data: confirmedRows },
      { data: waitlistRows },
    ] = await Promise.all([
      supabase.from('events')
        .select('*, movies(id, title, poster_url, genre, runtime, year, rating_imdb, rating_rt, imdb_id, plot)')
        .eq('id', eventId).single(),
      supabase.from('bookings').select('id, status, seats, payment_status')
        .eq('event_id', eventId).eq('member_id', memberId).neq('status', 'cancelled'),
      supabase.from('bookings').select('seats')
        .eq('event_id', eventId).eq('status', 'confirmed'),
      supabase.from('bookings').select('seats')
        .eq('event_id', eventId).eq('status', 'waitlist'),
    ])
    const ev = eventData || baseEvent
    if (!ev) return
    const bookings_count = (confirmedRows || []).reduce((sum, b) => sum + (b.seats || 1), 0)
    const waitlist_count = (waitlistRows || []).reduce((sum, b) => sum + (b.seats || 1), 0)
    setSlideOutEvent({
      ...ev,
      hub_type: 'movie',
      movie: ev.movies || null,
      bookings_count,
      waitlist_count,
      my_bookings: (myRows || []).map(b => ({ status: b.status, seats: b.seats || 1, payment_status: b.payment_status })),
    })
  }

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

      <WelcomeBanner text={welcomeText} colour="var(--teal)" />

      {nextEvent ? (
        <NextScreeningCard event={nextEvent} myBooking={nextBookingSummary} coordinator={nextEventCoordinator} onOpen={() => openSlideOutForEvent(nextEvent.id, nextEvent)} />
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', padding: '1.5rem 1.25rem', textAlign: 'center', marginBottom: '1.25rem', boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎬</div>
          <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>No upcoming screenings</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>Check back soon — the next film will be announced here.</div>
        </div>
      )}

      <MyBookingsCard bookings={myBookings} onViewAll={() => router.push('/screenings')} onOpenEvent={id => openSlideOutForEvent(id)} />

      {!swiperDone && unvoted.length > 0 && memberId && (
        <RatingSwiper movies={unvoted} memberId={memberId} onDone={() => setSwiperDone(true)} />
      )}

      {/* Unified booking slide-over — same pattern as Social and Book Club */}
      <EventSlideOut
        event={slideOutEvent}
        onClose={() => setSlideOutEvent(null)}
        onRefresh={async () => { if (slideOutEvent?.id) await openSlideOutForEvent(slideOutEvent.id); load() }}
      />

{(swiperDone || unvoted.length === 0) && (
        <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '1.5rem 0' }}>
          <div style={{ fontSize: '0.88rem' }}>You&apos;re all caught up on ratings!</div>
        </div>
      )}
    </div>
  )
}
