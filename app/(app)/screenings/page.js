'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtTime(timeStr) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`
}

// ── Capacity Bar ──────────────────────────────────────────────────────────────
function CapacityBar({ confirmedSeats, maxSeats, waitlistCount }) {
  const pct       = maxSeats > 0 ? Math.min(100, (confirmedSeats / maxSeats) * 100) : 0
  const remaining = Math.max(0, maxSeats - confirmedSeats)
  const barColor   = pct >= 85 ? 'var(--danger)' : pct >= 55 ? 'var(--amber)' : 'var(--green)'
  const labelColor = pct >= 85 ? 'var(--danger)' : pct >= 55 ? 'var(--amber-dark)' : 'var(--green)'

  return (
    <div style={{ marginBottom: '0.4rem' }}>
      <div style={{ height: 7, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden', marginBottom: '0.25rem' }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: barColor, borderRadius: 4,
          transition: 'width 0.4s ease, background 0.4s ease', minWidth: pct > 0 ? 6 : 0,
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
        <span style={{ color: 'var(--text-dim)' }}>
          {confirmedSeats}/{maxSeats} seats taken
          {waitlistCount > 0 && <span style={{ color: 'var(--amber-dark)', marginLeft: '0.4rem' }}>· {waitlistCount} waiting</span>}
        </span>
        <span style={{ color: labelColor, fontWeight: 600 }}>
          {remaining === 0 ? 'Full' : `${remaining} left`}
        </span>
      </div>
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div style={{ position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 999, display: 'flex', flexDirection: 'column', gap: '0.5rem', pointerEvents: 'none', minWidth: 260, maxWidth: '90vw' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === 'error' ? 'var(--danger)' : t.type === 'warn' ? 'var(--amber-dark)' : '#15803d',
          color: '#fff', padding: '0.75rem 1.1rem', borderRadius: '12px',
          fontSize: '0.88rem', fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          <span>{t.type === 'error' ? '✕' : t.type === 'warn' ? '⚠️' : '✓'}</span>
          {t.message}
        </div>
      ))}
    </div>
  )
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Are you sure?</div>
        <div style={{ fontSize: '0.88rem', color: 'var(--text-dim)', marginBottom: '1.25rem', lineHeight: 1.5 }}>{message}</div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '0.75rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', color: 'var(--text)' }}>Keep it</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '0.75rem', background: 'var(--danger)', border: 'none', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', color: '#fff' }}>Yes, cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Backdrop ──────────────────────────────────────────────────────────────────
function Overlay({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%' }}>{children}</div>
    </div>
  )
}

// ── Seat Picker ───────────────────────────────────────────────────────────────
function SeatPicker({ seatsRemaining, isFull, currentSeats, onPick, onCancel }) {
  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '0.4rem', fontWeight: 500 }}>
        {isFull ? 'Join waitlist — how many seats?' : currentSeats ? 'Change to how many seats?' : 'How many seats?'}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {[1, 2, 3, 4].map(n => {
          const disabled = !isFull && !currentSeats && n > seatsRemaining
          const isActive = n === currentSeats
          return (
            <button key={n} onClick={() => !disabled && onPick(n)} style={{
              width: 40, height: 40, borderRadius: '50%', border: '2px solid',
              borderColor: isActive ? 'var(--teal)' : disabled ? 'var(--border)' : isFull ? 'var(--amber)' : 'var(--teal)',
              background: isActive ? 'var(--teal)' : disabled ? 'var(--surface2)' : 'transparent',
              color: isActive ? '#fff' : disabled ? 'var(--border)' : isFull ? 'var(--amber-dark)' : 'var(--teal)',
              fontWeight: 700, fontSize: '0.95rem', cursor: disabled ? 'not-allowed' : 'pointer',
            }}>{n}</button>
          )
        })}
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '0.8rem', cursor: 'pointer', padding: '0 0.25rem' }}>✕</button>
      </div>
    </div>
  )
}

// ── Add Screening Sheet (admin) ───────────────────────────────────────────────
function AddScreeningSheet({ session, onClose, onAdded, addToast }) {
  const [movies, setMovies] = useState([])
  const [movieSearch, setMovieSearch] = useState('')
  const [pickedMovie, setPickedMovie] = useState(null)
  const [date, setDate]       = useState('')
  const [time, setTime]       = useState('18:00')
  const [maxSeats, setMaxSeats] = useState(20)
  const [notes, setNotes]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState(null)

  useEffect(() => {
    supabase.from('movies').select('id, title, poster_url, year').order('title')
      .then(({ data }) => setMovies(data || []))
  }, [])

  const filtered = movieSearch
    ? movies.filter(m => m.title.toLowerCase().includes(movieSearch.toLowerCase()))
    : movies

  async function handleSubmit() {
    if (!date || !time) { setErr('Date and time are required'); return }
    setSaving(true); setErr(null)
    const res = await fetch('/api/screenings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ movie_id: pickedMovie?.id || null, event_date: date, event_time: time, max_seats: Number(maxSeats), notes: notes || null }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setErr(data.error || 'Failed'); addToast('Failed to add screening', 'error'); return }
    addToast(`Screening added — ${pickedMovie?.title || 'Movie Night'} on ${date}`, 'success')
    onAdded(); onClose()
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Add Screening</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-dim)' }}>×</button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Movie</label>
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
          <>
            <input placeholder="Search movies…" value={movieSearch} onChange={e => setMovieSearch(e.target.value)}
              style={{ width: '100%', padding: '0.65rem 0.85rem', border: '1.5px solid var(--border)', borderRadius: '10px', fontSize: '0.9rem', background: 'var(--surface2)', marginBottom: '0.5rem', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '10px' }}>
              {filtered.slice(0, 30).map(m => (
                <div key={m.id} onClick={() => { setPickedMovie(m); setMovieSearch('') }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.6rem 0.85rem', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                  {m.poster_url && <img src={m.poster_url} alt="" style={{ width: 28, height: 42, objectFit: 'cover', borderRadius: 3 }} />}
                  <span style={{ fontSize: '0.88rem' }}>{m.title}</span>
                  {m.year && <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginLeft: 'auto' }}>{m.year}</span>}
                </div>
              ))}
              {filtered.length === 0 && <div style={{ padding: '0.75rem', color: 'var(--text-dim)', fontSize: '0.85rem' }}>No movies found</div>}
            </div>
          </>
        )}
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date *</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} min={new Date().toISOString().split('T')[0]}
          style={{ width: '100%', padding: '0.65rem 0.85rem', border: '1.5px solid var(--border)', borderRadius: '10px', fontSize: '0.9rem', background: 'var(--surface2)', boxSizing: 'border-box', fontFamily: 'inherit' }} />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time *</label>
        <input type="time" value={time} onChange={e => setTime(e.target.value)}
          style={{ width: '100%', padding: '0.65rem 0.85rem', border: '1.5px solid var(--border)', borderRadius: '10px', fontSize: '0.9rem', background: 'var(--surface2)', boxSizing: 'border-box', fontFamily: 'inherit' }} />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Max Seats</label>
        <input type="number" value={maxSeats} onChange={e => setMaxSeats(e.target.value)} min={1} max={200}
          style={{ width: '100%', padding: '0.65rem 0.85rem', border: '1.5px solid var(--border)', borderRadius: '10px', fontSize: '0.9rem', background: 'var(--surface2)', boxSizing: 'border-box', fontFamily: 'inherit' }} />
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes (optional)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Bring a chair! BYO drinks." rows={2}
          style={{ width: '100%', padding: '0.65rem 0.85rem', border: '1.5px solid var(--border)', borderRadius: '10px', fontSize: '0.9rem', background: 'var(--surface2)', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
      </div>

      {err && <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{err}</div>}

      <button onClick={handleSubmit} disabled={saving}
        style={{ width: '100%', padding: '0.9rem', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '1rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Saving…' : 'Add Screening'}
      </button>
    </div>
  )
}

// ── Screening Card ────────────────────────────────────────────────────────────
function ScreeningCard({ ev, session, isAdmin, onRefresh, addToast }) {
  const [acting,        setActing]        = useState(false)
  const [pickingSeats,  setPickingSeats]  = useState(false)
  const [changingSeats, setChangingSeats] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [showAttendees, setShowAttendees] = useState(false)

  const myStatus = ev.my_booking?.status || null
  const mySeats  = ev.my_booking?.seats  || 1
  const movie    = ev.movies
  const isFull   = ev.seats_remaining === 0

  async function book(seats) {
    setPickingSeats(false)
    setActing(true)
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ event_id: ev.id, seats }),
    })
    const data = await res.json()
    setActing(false)
    if (!res.ok) { addToast(data.error || 'Booking failed', 'error'); return }
    if (data.status === 'waitlist') {
      addToast(`Added to waitlist — ${seats} seat${seats > 1 ? 's' : ''} for ${ev.title}`, 'warn')
    } else {
      addToast(`Booked! ${seats} seat${seats > 1 ? 's' : ''} confirmed for ${ev.title}`, 'success')
    }
    onRefresh()
  }

  async function doChange(newSeats) {
    setChangingSeats(false)
    setActing(true)
    const res = await fetch('/api/bookings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ event_id: ev.id, seats: newSeats }),
    })
    const data = await res.json()
    setActing(false)
    if (!res.ok) { addToast(data.error || 'Could not change seats', 'error'); return }
    addToast(`Changed to ${newSeats} seat${newSeats > 1 ? 's' : ''} for ${ev.title}`, 'success')
    onRefresh()
  }

  async function doCancel() {
    setConfirmCancel(false)
    setActing(true)
    const res = await fetch('/api/bookings', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ event_id: ev.id }),
    })
    setActing(false)
    if (!res.ok) { addToast('Could not cancel — please try again', 'error'); return }
    addToast(`Booking cancelled for ${ev.title}`, 'success')
    onRefresh()
  }

  const confirmedAttendees = (ev.attendees || []).filter(a => a.status === 'confirmed')
  const waitlistAttendees  = (ev.attendees || []).filter(a => a.status === 'waitlist')

  return (
    <>
      <div style={{ background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex' }}>
          {/* Poster */}
          {movie?.poster_url ? (
            <img src={movie.poster_url} alt={movie.title} style={{ width: 90, minHeight: 130, objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 90, minHeight: 130, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', flexShrink: 0 }}>🎬</div>
          )}

          {/* Info */}
          <div style={{ flex: 1, padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.3 }}>{ev.title}</div>

            {/* Date/time */}
            <div style={{ color: 'var(--teal)', fontSize: '0.82rem', fontWeight: 600 }}>
              {fmtDate(ev.event_date)} · {fmtTime(ev.event_time)}
            </div>

            {/* Capacity bar — right under date/time */}
            <CapacityBar
              confirmedSeats={ev.confirmed_seats}
              maxSeats={ev.max_seats}
              waitlistCount={ev.waitlist_count}
            />

            {/* Genre */}
            {movie?.genre && (
              <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>{movie.genre}</div>
            )}

            {/* Plot */}
            {movie?.plot && (
              <div style={{ color: 'var(--text-dim)', fontSize: '0.77rem', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {movie.plot}
              </div>
            )}

            {/* Ratings */}
            {(movie?.rating_imdb || movie?.rating_rt) && (
              <div style={{ display: 'flex', gap: '0.65rem', fontSize: '0.75rem' }}>
                {movie.rating_imdb && <span style={{ color: 'var(--amber-dark)', fontWeight: 600 }}>★ {movie.rating_imdb}</span>}
                {movie.rating_rt   && <span style={{ color: '#fa320a', fontWeight: 600 }}>🍅 {movie.rating_rt}</span>}
              </div>
            )}

            {/* Notes */}
            {ev.notes && (
              <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem', fontStyle: 'italic' }}>{ev.notes}</div>
            )}

            {/* Actions */}
            <div style={{ paddingTop: '0.2rem' }}>
              {/* Confirmed booking */}
              {myStatus === 'confirmed' && !changingSeats && (
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.65rem', borderRadius: '20px' }}>
                    ✓ {mySeats} seat{mySeats > 1 ? 's' : ''} booked
                  </span>
                  <button onClick={() => setChangingSeats(true)} disabled={acting}
                    style={{ background: 'none', border: '1px solid var(--teal)', borderRadius: '8px', padding: '0.3rem 0.65rem', fontSize: '0.78rem', cursor: 'pointer', color: 'var(--teal)', fontWeight: 600 }}>
                    Change
                  </button>
                  <button onClick={() => setConfirmCancel(true)} disabled={acting}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.3rem 0.65rem', fontSize: '0.78rem', cursor: acting ? 'not-allowed' : 'pointer', color: 'var(--text-dim)' }}>
                    Cancel
                  </button>
                </div>
              )}

              {/* Change seats picker */}
              {myStatus === 'confirmed' && changingSeats && (
                <SeatPicker
                  seatsRemaining={ev.seats_remaining + mySeats}
                  isFull={false}
                  currentSeats={mySeats}
                  onPick={doChange}
                  onCancel={() => setChangingSeats(false)}
                />
              )}

              {/* Waitlist */}
              {myStatus === 'waitlist' && (
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <span style={{ background: '#fef3c7', color: '#d97706', fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.65rem', borderRadius: '20px' }}>
                    ⏳ Waitlist — {mySeats} seat{mySeats > 1 ? 's' : ''}
                  </span>
                  <button onClick={() => setConfirmCancel(true)} disabled={acting}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.3rem 0.65rem', fontSize: '0.78rem', cursor: acting ? 'not-allowed' : 'pointer', color: 'var(--text-dim)' }}>
                    Leave
                  </button>
                </div>
              )}

              {/* Book button */}
              {!myStatus && !pickingSeats && (
                <button onClick={() => setPickingSeats(true)} disabled={acting}
                  style={{ background: isFull ? 'var(--amber)' : 'var(--teal)', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.4rem 1rem', fontSize: '0.82rem', fontWeight: 600, cursor: acting ? 'not-allowed' : 'pointer', opacity: acting ? 0.6 : 1 }}>
                  {acting ? '…' : isFull ? 'Join Waitlist' : 'Book'}
                </button>
              )}

              {/* Seat picker for new booking */}
              {!myStatus && pickingSeats && (
                <SeatPicker seatsRemaining={ev.seats_remaining} isFull={isFull} onPick={book} onCancel={() => setPickingSeats(false)} />
              )}
            </div>
          </div>
        </div>

        {/* Admin bar with attendees accordion */}
        {isAdmin && (
          <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
            <button
              onClick={() => setShowAttendees(!showAttendees)}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 1rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'inherit' }}
            >
              <span>
                <strong style={{ color: 'var(--green)' }}>{ev.confirmed_seats} seats confirmed</strong>
                {ev.waitlist_count > 0 && <span style={{ color: 'var(--amber-dark)', marginLeft: '0.5rem' }}>· {ev.waitlist_count} on waitlist</span>}
                <span style={{ marginLeft: '0.5rem' }}>of {ev.max_seats}</span>
              </span>
              <span style={{ fontSize: '0.65rem', color: 'var(--teal)' }}>{showAttendees ? '▲ Hide' : '▼ Attendees'}</span>
            </button>

            {showAttendees && (
              <div style={{ padding: '0 1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                {confirmedAttendees.length > 0 && (
                  <>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.15rem' }}>Confirmed</div>
                    {confirmedAttendees.map((a, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.2rem 0', borderBottom: '1px solid var(--border)' }}>
                        <span>{a.name}</span>
                        <span style={{ color: 'var(--text-dim)' }}>{a.seats} seat{a.seats > 1 ? 's' : ''}</span>
                      </div>
                    ))}
                  </>
                )}
                {waitlistAttendees.length > 0 && (
                  <>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--amber-dark)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '0.5rem', marginBottom: '0.15rem' }}>Waitlist</div>
                    {waitlistAttendees.map((a, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.2rem 0', borderBottom: '1px solid var(--border)' }}>
                        <span>{a.name}</span>
                        <span style={{ color: 'var(--text-dim)' }}>{a.seats} seat{a.seats > 1 ? 's' : ''}</span>
                      </div>
                    ))}
                  </>
                )}
                {confirmedAttendees.length === 0 && waitlistAttendees.length === 0 && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>No bookings yet</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {confirmCancel && (
        <ConfirmDialog
          message={
            myStatus === 'waitlist'
              ? `Leave the waitlist for ${ev.title}? Your place in the queue will be lost.`
              : `Cancel your ${mySeats > 1 ? mySeats + ' seats' : 'seat'} for ${ev.title}?${mySeats > 1 ? ' All seats will be released.' : ''}`
          }
          onConfirm={doCancel}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Screenings() {
  const [screenings, setScreenings] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [session,    setSession]    = useState(null)
  const [member,     setMember]     = useState(null)
  const [showAdd,    setShowAdd]    = useState(false)
  const [toasts,     setToasts]     = useState([])

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
      }
    })
  }, [])

  const loadScreenings = useCallback(async () => {
    if (!session) return
    setLoading(true)
    const res = await fetch('/api/screenings', {
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    })
    const data = await res.json()
    setScreenings(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [session])

  useEffect(() => {
    if (session) loadScreenings()
  }, [session, loadScreenings])

  return (
    <div style={{ padding: '1.25rem 1rem 6rem' }}>
      <Toast toasts={toasts} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Upcoming Screenings</h1>
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
          {member?.is_admin && <div style={{ marginTop: '0.5rem', fontSize: '0.82rem' }}>Use "+ Add" to schedule one.</div>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {screenings.map(ev => (
            <ScreeningCard key={ev.id} ev={ev} session={session} isAdmin={member?.is_admin} onRefresh={loadScreenings} addToast={addToast} />
          ))}
        </div>
      )}

      {showAdd && (
        <Overlay onClose={() => setShowAdd(false)}>
          <AddScreeningSheet session={session} onClose={() => setShowAdd(false)} onAdded={loadScreenings} addToast={addToast} />
        </Overlay>
      )}
    </div>
  )
}
