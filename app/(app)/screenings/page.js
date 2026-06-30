'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { computeFreeCost } from '@/lib/freeCost'
import EventSlideOut from '@/components/EventSlideOut'
import { BusIcon } from '@/components/NavIcons'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateLong(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).toUpperCase()
}

function fmtTime24(timeStr) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function parseGenres(g) {
  if (!g) return []
  return g.split(/[,|\/]/).map(x => x.trim()).filter(Boolean)
}

// ── Capacity Bar ──────────────────────────────────────────────────────────────
function CapacityBar({ confirmedSeats, maxSeats, waitlistSeats }) {
  const pct       = maxSeats > 0 ? Math.min(100, (confirmedSeats / maxSeats) * 100) : 0
  const remaining = Math.max(0, maxSeats - confirmedSeats)
  const barColor  = pct >= 85 ? 'var(--danger)' : pct >= 55 ? 'var(--amber)' : 'var(--green)'
  const labelColor = pct >= 85 ? 'var(--danger)' : pct >= 55 ? 'var(--amber-dark)' : 'var(--green)'
  return (
    <div style={{ marginBottom: '0.4rem' }}>
      <div style={{ height: 7, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden', marginBottom: '0.25rem' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 4, transition: 'width 0.4s ease', minWidth: pct > 0 ? 6 : 0 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
        <span style={{ color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>{remaining}</strong> of {maxSeats} seats left
          {waitlistSeats > 0 && <span style={{ color: 'var(--amber-dark)', marginLeft: '0.4rem' }}>· {waitlistSeats} on waitlist</span>}
        </span>
        <span style={{ color: labelColor, fontWeight: 600 }}>{remaining === 0 ? 'Full' : `${Math.round(pct)}%`}</span>
      </div>
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div style={{ position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 999, display: 'flex', flexDirection: 'column', gap: '0.5rem', pointerEvents: 'none', minWidth: 260, maxWidth: '90vw' }}>
      {toasts.map(t => (
        <div key={t.id} style={{ background: t.type === 'error' ? 'var(--danger)' : t.type === 'warn' ? 'var(--amber-dark)' : '#15803d', color: '#fff', padding: '0.75rem 1.1rem', borderRadius: '12px', fontSize: '0.88rem', fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>{t.type === 'error' ? '✕' : t.type === 'warn' ? '⏳' : '✓'}</span>
          {t.message}
        </div>
      ))}
    </div>
  )
}

// ── Coord Picker ──────────────────────────────────────────────────────────────
function CoordPicker({ members, value, onChange }) {
  const chosen = members.find(m => m.id === value) || null
  const [query, setQuery] = useState('')
  const [open, setOpen]   = useState(false)
  const containerRef      = useRef(null)

  const filtered = members.filter(m =>
    !query || (m.name || m.username || '').toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div onClick={() => { setOpen(o => !o); setQuery('') }}
        style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: 10, border: `1.5px solid ${open ? 'var(--teal)' : 'var(--border)'}`, background: 'var(--surface)', color: chosen ? 'var(--text)' : 'var(--text-dim)', fontSize: '0.95rem', boxSizing: 'border-box', fontFamily: 'inherit', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{chosen ? (chosen.name || chosen.username) : '— Select coordinator —'}</span>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>▾</span>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 60, overflow: 'hidden' }}>
          <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)' }}>
            <input autoFocus type="text" placeholder="Search name…" value={query} onChange={e => setQuery(e.target.value)}
              style={{ width: '100%', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit' }} />
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {value && (
              <div onClick={() => { onChange(''); setOpen(false) }}
                style={{ padding: '0.65rem 1rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                — Clear selection —
              </div>
            )}
            {filtered.map(m => (
              <div key={m.id} onClick={() => { onChange(m.id); setOpen(false) }}
                style={{ padding: '0.65rem 1rem', cursor: 'pointer', background: m.id === value ? 'rgba(0,128,128,0.08)' : 'transparent', borderBottom: '1px solid var(--border)', fontWeight: m.id === value ? 700 : 400, fontSize: '0.88rem', color: m.id === value ? 'var(--teal)' : 'var(--text)' }}>
                {m.name || m.username}
              </div>
            ))}
            {filtered.length === 0 && <div style={{ padding: '0.9rem 1rem', fontSize: '0.85rem', color: 'var(--text-dim)' }}>No match</div>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add/Edit Screening Sheet (admin) ──────────────────────────────────────────
function ScreeningSheet({ session, event, members, onClose, onSaved, addToast }) {
  const isEdit = !!event
  const [movies, setMovies]           = useState([])
  const [pickedMovie, setPickedMovie] = useState(null)
  const [movieOpen, setMovieOpen]     = useState(false)
  const [movieQuery, setMovieQuery]   = useState('')
  const movieRef                      = useRef(null)
  const [date, setDate]               = useState(event?.event_date || '')
  const [time, setTime]               = useState(event?.event_time?.slice(0, 5) || '18:00')
  const [maxSeats, setMaxSeats]       = useState(event?.max_seats || 20)
  const [notes, setNotes]             = useState(event?.notes || '')
  const [coordinator, setCoordinator] = useState(event?.coordinator?.id || null)
  const [saving, setSaving]           = useState(false)
  const [err, setErr]                 = useState(null)
  const [open, setOpen]               = useState(false)

  useEffect(() => {
    supabase.from('movies').select('id, title, poster_url, year').eq('we_own', false).order('title')
      .then(({ data }) => setMovies(data || []))
    if (event?.movie_id) {
      supabase.from('movies').select('id, title, poster_url, year').eq('id', event.movie_id).single()
        .then(({ data }) => { if (data) setPickedMovie(data) })
    }
    requestAnimationFrame(() => setOpen(true))
  }, [])

  const moviePool = movies.filter(m => !movieQuery || m.title.toLowerCase().includes(movieQuery.toLowerCase()))

  useEffect(() => {
    if (!movieOpen) return
    function handler(e) { if (movieRef.current && !movieRef.current.contains(e.target)) { setMovieOpen(false); setMovieQuery('') } }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [movieOpen])

  function handleClose() { setOpen(false); setTimeout(onClose, 280) }

  async function handleSubmit() {
    if (!date || !time) { setErr('Date and time are required'); return }
    setSaving(true); setErr(null)
    const body = { movie_id: pickedMovie?.id || null, event_date: date, event_time: time, max_seats: Number(maxSeats), notes: notes || null, coordinator_id: coordinator || null }
    if (isEdit) body.event_id = event.id
    const res = await fetch('/api/screenings', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setErr(data.error || 'Failed'); addToast('Failed to save', 'error'); return }
    addToast((isEdit ? 'Screening updated' : 'Screening added') + ' — ' + (pickedMovie?.title || 'Movie Night') + ' on ' + date, 'success')
    onSaved(); handleClose()
  }

  const INPUT = { width: '100%', padding: '0.65rem 0.85rem', border: '1.5px solid var(--border)', borderRadius: '10px', fontSize: '0.9rem', background: 'var(--surface2)', boxSizing: 'border-box', fontFamily: 'inherit' }
  const LABEL = { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }

  return (
    <>
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, opacity: open ? 1 : 0, transition: 'opacity 0.25s' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(420px, 100%)', background: 'var(--surface)', zIndex: 201, overflowY: 'auto', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)', boxShadow: '-8px 0 32px rgba(0,0,0,0.15)', paddingBottom: 32 }}>
        <div style={{ height: 4, background: 'var(--teal)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>{isEdit ? 'Edit Screening' : 'Add Screening'}</h2>
          <button onClick={handleClose} style={{ background: 'var(--surface2)', border: 'none', borderRadius: '50%', width: 36, height: 36, fontSize: 20, cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        <div style={{ padding: '1.25rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={LABEL}>Movie</label>
            {pickedMovie ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--surface2)', borderRadius: '10px', padding: '0.75rem' }}>
                {pickedMovie.poster_url && <img src={pickedMovie.poster_url} alt="" style={{ width: 36, height: 54, objectFit: 'cover', borderRadius: 4 }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{pickedMovie.title}</div>
                  {pickedMovie.year && <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{pickedMovie.year}</div>}
                </div>
                <button onClick={() => setPickedMovie(null)} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>Change</button>
              </div>
            ) : (
              <div ref={movieRef} style={{ position: 'relative' }}>
                <button onClick={() => setMovieOpen(v => !v)} style={{ ...INPUT, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: movieOpen ? '10px 10px 0 0' : '10px' }}>
                  <span style={{ color: 'var(--text-dim)' }}>Select a movie…</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{movieOpen ? '▲' : '▼'}</span>
                </button>
                {movieOpen && (
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 10px 10px', zIndex: 50, maxHeight: 260, overflowY: 'auto' }}>
                    <input autoFocus value={movieQuery} onChange={e => setMovieQuery(e.target.value)} placeholder="Type to filter…"
                      style={{ width: '100%', padding: '0.6rem 0.85rem', border: 'none', borderBottom: '1px solid var(--border)', fontSize: '0.9rem', background: 'var(--surface2)', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }} />
                    {moviePool.map(m => (
                      <div key={m.id} onClick={() => { setPickedMovie(m); setMovieOpen(false); setMovieQuery('') }}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.6rem 0.85rem', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}>
                        {m.poster_url && <img src={m.poster_url} alt="" style={{ width: 28, height: 42, objectFit: 'cover', borderRadius: 3 }} />}
                        <span style={{ fontSize: '0.88rem' }}>{m.title}</span>
                        {m.year && <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginLeft: 'auto' }}>{m.year}</span>}
                      </div>
                    ))}
                    {moviePool.length === 0 && <div style={{ padding: '0.75rem', color: 'var(--text-dim)', fontSize: '0.85rem' }}>No movies found</div>}
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={LABEL}>Coordinator (optional)</label>
            <CoordPicker members={members} value={coordinator} onChange={setCoordinator} />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={LABEL}>Date <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} min={new Date().toISOString().split('T')[0]}
              style={{ ...INPUT, border: `1.5px solid ${date ? 'var(--green)' : 'var(--danger)'}` }} />
            {date && <div style={{ fontSize: '0.75rem', color: 'var(--teal)', fontWeight: 600, marginTop: '0.3rem' }}>
              {new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long' })}
            </div>}
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={LABEL}>Time <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              style={{ ...INPUT, border: `1.5px solid ${time ? 'var(--green)' : 'var(--danger)'}` }} />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={LABEL}>Max Seats</label>
            <input type="number" value={maxSeats} onChange={e => setMaxSeats(e.target.value)} min={1} max={200} style={INPUT} />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={LABEL}>Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Bring a chair! BYO drinks." rows={2} style={{ ...INPUT, resize: 'vertical' }} />
          </div>
          {err && <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{err}</div>}
          <button onClick={handleSubmit} disabled={saving}
            style={{ width: '100%', padding: '0.9rem', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '1rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Screening'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Booking Status Strip ───────────────────────────────────────────────────────
// Always-visible bottom strip — shows booking state and tells user what tapping does
function BookingStrip({ myBooking, isFull }) {
  const hasConfirmed   = myBooking?.has_confirmed || false
  const hasWaitlist    = myBooking?.has_waitlist  || false
  const confirmedSeats = myBooking?.confirmed_seats || 0
  const waitlistSeats  = myBooking?.waitlist_seats  || 0
  const waitlistPos    = myBooking?.waitlist_position || null
  const base = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.55rem 1rem', fontSize: '0.82rem', fontWeight: 600, gap: '0.5rem' }

  if (hasConfirmed && hasWaitlist) {
    return (
      <div style={{ ...base, background: '#f0fdf4', borderTop: '1px solid #bbf7d0', flexWrap: 'wrap' }}>
        <span style={{ color: '#15803d' }}>✓ {confirmedSeats} confirmed + {waitlistSeats} waitlisted</span>
        <span style={{ color: '#15803d', fontSize: '0.75rem' }}>Tap to manage →</span>
      </div>
    )
  }
  if (hasConfirmed) {
    return (
      <div style={{ ...base, background: '#f0fdf4', borderTop: '1px solid #bbf7d0' }}>
        <span style={{ color: '#15803d' }}>✓ {confirmedSeats} seat{confirmedSeats !== 1 ? 's' : ''} confirmed</span>
        <span style={{ color: '#15803d', fontSize: '0.75rem' }}>Tap to modify or cancel →</span>
      </div>
    )
  }
  if (hasWaitlist) {
    return (
      <div style={{ ...base, background: '#fffbeb', borderTop: '1px solid #fde68a' }}>
        <span style={{ color: '#d97706' }}>⏳ {waitlistPos ? `#${waitlistPos} on waitlist` : 'On waitlist'} · {waitlistSeats} seat{waitlistSeats !== 1 ? 's' : ''}</span>
        <span style={{ color: '#d97706', fontSize: '0.75rem' }}>Tap to manage →</span>
      </div>
    )
  }
  if (isFull) {
    return (
      <div style={{ ...base, background: '#fff7ed', borderTop: '1px solid #fed7aa' }}>
        <span style={{ color: '#c2410c' }}>This screening is full</span>
        <span style={{ color: '#c2410c', fontSize: '0.75rem' }}>Tap to join the waitlist →</span>
      </div>
    )
  }
  return (
    <div style={{ ...base, background: 'rgba(0,128,128,0.06)', borderTop: '1px solid rgba(0,128,128,0.15)' }}>
      <span style={{ color: 'var(--teal)' }}>Reserve your seat</span>
      <span style={{ color: 'var(--teal)', fontSize: '0.75rem' }}>Tap to book →</span>
    </div>
  )
}

// ── Screening Card ─────────────────────────────────────────────────────────────
// Pure display — tap anywhere to open the unified slide-over for booking/modify/cancel
function ScreeningCard({ ev, isAdmin, freeCostData, onOpen, onEdit }) {
  const [showAttendees, setShowAttendees] = useState(false)
  const movie              = ev.movies
  const isFull             = ev.seats_remaining === 0
  const confirmedAttendees = (ev.attendees || []).filter(a => a.status === 'confirmed')
  const waitlistAttendees  = (ev.attendees || []).filter(a => a.status === 'waitlist')

  return (
    <div onClick={onOpen}
      style={{ background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow)', cursor: 'pointer' }}>

      <div style={{ display: 'flex' }}>
        {movie?.poster_url
          ? <img src={movie.poster_url} alt={movie.title} style={{ width: 100, minHeight: 140, objectFit: 'cover', flexShrink: 0 }} />
          : <div style={{ width: 100, minHeight: 140, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', flexShrink: 0 }}>🎬</div>
        }
        <div style={{ flex: 1, padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <div style={{ color: 'var(--teal)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', lineHeight: 1.2 }}>
              {fmtDateLong(ev.event_date)}{ev.event_time ? ' · ' + fmtTime24(ev.event_time) : ''}
            </div>
            {isAdmin && onEdit && (
              <button onClick={e => { e.stopPropagation(); onEdit(ev) }}
                style={{ background: 'none', border: '1px solid var(--teal)', borderRadius: '8px', padding: '0.2rem 0.65rem', fontSize: '0.72rem', color: 'var(--teal)', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>
                Edit
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', lineHeight: 1.2 }}>{movie?.title || ev.title}</div>
            {isAdmin && freeCostData && (
              <span style={{ background: freeCostData.isFree ? '#dcfce7' : '#fef3c7', color: freeCostData.isFree ? '#15803d' : '#d97706', borderRadius: '20px', padding: '0.15rem 0.55rem', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                ● {freeCostData.isFree ? (freeCostData.reasons[0] || 'Free') : 'Cost'}
              </span>
            )}
            {ev.coordinator && (
              <span style={{ fontSize: '0.72rem', color: 'var(--teal)', fontWeight: 600 }}>
                👤 {ev.coordinator.name || ev.coordinator.username}
              </span>
            )}
            {ev.has_bus && ev.bus_driver && (
              <span style={{ fontSize: '0.72rem', color: 'var(--teal)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <BusIcon size={12} /> {ev.bus_driver.name || ev.bus_driver.username}
              </span>
            )}
          </div>
          {(movie?.actors || movie?.rating) && (
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
              {movie.actors?.split(',')[0]?.trim()}{movie.actors && movie.rating ? ' · ' : ''}{movie.rating || ''}
            </div>
          )}
          {(() => {
            const genres = parseGenres(movie?.genre)
            return genres.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                {genres.map(g => <span key={g} style={{ background: 'var(--surface2)', borderRadius: '20px', padding: '0.15rem 0.5rem', fontSize: '0.7rem', color: 'var(--text-dim)' }}>{g}</span>)}
              </div>
            )
          })()}
          {movie?.plot && (
            <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', lineHeight: 1.5 }}>{movie.plot}</div>
          )}
          {(movie?.rating_imdb || movie?.rating_rt || ev.community_score?.count > 0) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.2rem' }}>
              {movie?.rating_imdb && (movie?.imdb_id
                ? <a href={`https://www.imdb.com/title/${movie.imdb_id}/`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ textDecoration: 'none' }}>
                    <span style={{ display: 'inline-block', background: 'rgba(180,150,0,0.15)', color: 'var(--amber-dark)', fontWeight: 700, fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: '20px', border: '1px solid rgba(180,150,0,0.3)' }}>IMDb {movie.rating_imdb}</span>
                  </a>
                : <span style={{ display: 'inline-block', background: 'rgba(180,150,0,0.15)', color: 'var(--amber-dark)', fontWeight: 700, fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: '20px', border: '1px solid rgba(180,150,0,0.3)' }}>IMDb {movie.rating_imdb}</span>
              )}
              {movie?.rating_rt && (
                <a href={`https://www.rottentomatoes.com/search?search=${encodeURIComponent(movie.title || '')}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ textDecoration: 'none' }}>
                  <span style={{ display: 'inline-block', background: 'rgba(220,50,30,0.12)', color: '#c0392b', fontWeight: 700, fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: '20px', border: '1px solid rgba(220,50,30,0.25)' }}>🍅 RT {movie.rating_rt}</span>
                </a>
              )}
              {ev.community_score?.count > 0 && (
                <span style={{ display: 'inline-block', background: 'rgba(0,128,128,0.12)', color: 'var(--teal)', fontWeight: 700, fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: '20px', border: '1px solid rgba(0,128,128,0.25)' }}>
                  Community {ev.community_score.avg.toFixed(1)}
                </span>
              )}
            </div>
          )}
          <div style={{ marginTop: '0.2rem' }}>
            <CapacityBar confirmedSeats={ev.confirmed_seats} maxSeats={ev.max_seats} waitlistSeats={ev.waitlist_seats} />
          </div>
          {ev.notes && <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem', fontStyle: 'italic' }}>{ev.notes}</div>}
        </div>
      </div>

      {/* Booking status strip — always visible */}
      <BookingStrip myBooking={ev.my_booking} isFull={isFull} />

      {/* Attendees accordion */}
      <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
        <button onClick={e => { e.stopPropagation(); setShowAttendees(v => !v) }}
          style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 1rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'inherit' }}>
          <span>
            <strong style={{ color: 'var(--text)' }}>{ev.confirmed_seats} seat{ev.confirmed_seats !== 1 ? 's' : ''}</strong>
            {isAdmin && ev.waitlist_seats > 0 && <span style={{ color: 'var(--amber-dark)', marginLeft: '0.5rem' }}>· {ev.waitlist_seats} waitlist</span>}
            <span style={{ marginLeft: '0.5rem' }}>of {ev.max_seats}</span>
          </span>
          <span style={{ fontSize: '0.65rem', color: 'var(--teal)' }}>{showAttendees ? '▲ Hide' : '▼ Attendees'}</span>
        </button>
        {showAttendees && (
          <div style={{ padding: '0 1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            {confirmedAttendees.length > 0 ? (
              <>
                {isAdmin && <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.15rem' }}>Confirmed</div>}
                {confirmedAttendees.map((a, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.2rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span>{a.name}</span><span style={{ color: 'var(--text-dim)' }}>{a.seats} seat{a.seats > 1 ? 's' : ''}</span>
                  </div>
                ))}
              </>
            ) : (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>No bookings yet</div>
            )}
            {isAdmin && waitlistAttendees.length > 0 && (
              <>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--amber-dark)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '0.5rem', marginBottom: '0.15rem' }}>Waitlist</div>
                {waitlistAttendees.map((a, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.2rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span>{a.name}</span><span style={{ color: 'var(--text-dim)' }}>{a.seats} seat{a.seats > 1 ? 's' : ''}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Adapter: screenings API shape → EventSlideOut shape ───────────────────────
// EventSlideOut/BookingSection expects: my_bookings[], bookings_count, waitlist_count, movie (singular)
// Screenings API returns:              my_booking{},  confirmed_seats, waitlist_seats, movies (join alias)
function toSlideOutShape(ev) {
  const myBookings = []
  if (ev.my_booking?.has_confirmed) {
    myBookings.push({ status: 'confirmed', seats: ev.my_booking.confirmed_seats, payment_status: null })
  }
  if (ev.my_booking?.has_waitlist) {
    myBookings.push({ status: 'waitlist', seats: ev.my_booking.waitlist_seats, payment_status: null })
  }
  return {
    ...ev,
    hub_type: 'movie',
    bookings_count: ev.confirmed_seats || 0,
    waitlist_count:  ev.waitlist_seats  || 0,
    my_bookings: myBookings,
    movie: ev.movies || null,
  }
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Screenings() {
  const [screenings,    setScreenings]    = useState([])
  const [loading,       setLoading]       = useState(true)
  const [session,       setSession]       = useState(null)
  const [member,        setMember]        = useState(null)
  const [showAdd,       setShowAdd]       = useState(false)
  const [editEvent,     setEditEvent]     = useState(null)
  const [members,       setMembers]       = useState([])
  const [toasts,        setToasts]        = useState([])
  const [slideOutEvent, setSlideOutEvent] = useState(null)
  const [streamingServices, setStreamingServices] = useState([])
  const [dvdTmdbIds,        setDvdTmdbIds]        = useState(new Set())
  const [dvdImdbIds,        setDvdImdbIds]        = useState(new Set())
  const [ownershipRecords,  setOwnershipRecords]  = useState([])

  function addToast(message, type = 'success') {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (s) {
        supabase.from('members').select('id, is_admin').eq('auth_id', s.user.id).single()
          .then(({ data }) => setMember(data))
        supabase.from('members').select('id, name, username').order('name')
          .then(({ data }) => setMembers(data || []))
      }
    })
  }, [])

  const loadScreenings = useCallback(async () => {
    if (!session) return
    setLoading(true)
    const [screeningsRes, { data: dvdData }, settingsRes, { data: ownData }] = await Promise.all([
      fetch('/api/screenings', { headers: { 'Authorization': 'Bearer ' + session.access_token } }),
      supabase.from('movies').select('tmdb_id, imdb_id').eq('we_own', true),
      supabase.from('settings').select('value').eq('key', 'our_streaming_services').single(),
      supabase.from('movie_ownership').select('movie_id, ownership_type, members(name)'),
    ])
    const data = await screeningsRes.json()
    setScreenings(Array.isArray(data) ? data : [])
    const dvds = dvdData || []
    setDvdTmdbIds(new Set(dvds.map(d => d.tmdb_id).filter(Boolean)))
    setDvdImdbIds(new Set(dvds.map(d => d.imdb_id).filter(Boolean)))
    try { setStreamingServices(JSON.parse(settingsRes.data?.value || '[]')) } catch { setStreamingServices([]) }
    setOwnershipRecords((ownData || []).map(o => ({ movie_id: o.movie_id, ownership_type: o.ownership_type, member_name: o.members?.name || null })))
    setLoading(false)
  }, [session])

  useEffect(() => {
    if (session) loadScreenings()
  }, [session, loadScreenings])

  function openSlideOut(ev) {
    setSlideOutEvent(toSlideOutShape(ev))
  }

  async function handleSlideOutRefresh() {
    if (!session || !slideOutEvent) return
    const currentId = slideOutEvent.id
    const res = await fetch('/api/screenings', { headers: { 'Authorization': 'Bearer ' + session.access_token } })
    const data = await res.json()
    if (!Array.isArray(data)) return
    setScreenings(data)
    const updated = data.find(e => e.id === currentId)
    if (updated) setSlideOutEvent(toSlideOutShape(updated))
  }

  return (
    <div style={{ padding: '1.25rem 1rem 6rem' }}>
      <Toast toasts={toasts} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--teal)' }}>🎬 Upcoming Screenings</h1>
        {member?.is_admin && (
          <button onClick={() => setShowAdd(true)}
            style={{ background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '10px', padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
            + Add
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>
      ) : screenings.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '3rem', fontSize: '0.9rem' }}>
          No upcoming screenings yet.
          {member?.is_admin && <div style={{ marginTop: '0.5rem', fontSize: '0.82rem' }}>Use &quot;+ Add&quot; to schedule one.</div>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {screenings.map(ev => {
            const freeCostData = member?.is_admin && ev.movies
              ? computeFreeCost(ev.movies, { streamingServices, dvdTmdbIds, dvdImdbIds, ownershipRecords: ownershipRecords.filter(o => o.movie_id === ev.movie_id) })
              : null
            return (
              <ScreeningCard
                key={ev.id}
                ev={ev}
                isAdmin={member?.is_admin}
                freeCostData={freeCostData}
                onOpen={() => openSlideOut(ev)}
                onEdit={ev => setEditEvent(ev)}
              />
            )
          })}
        </div>
      )}

      {/* Unified booking slide-over — same pattern as Social and Book Club */}
      <EventSlideOut
        event={slideOutEvent}
        onClose={() => setSlideOutEvent(null)}
        onRefresh={handleSlideOutRefresh}
      />

      {(showAdd || editEvent) && (
        <ScreeningSheet
          session={session}
          event={editEvent || null}
          members={members}
          onClose={() => { setShowAdd(false); setEditEvent(null) }}
          onSaved={loadScreenings}
          addToast={addToast}
        />
      )}
    </div>
  )
}
