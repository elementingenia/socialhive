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

function seatsLabel(seatsRemaining, maxSeats) {
  if (seatsRemaining === 0) return { text: 'Full', color: 'var(--danger)' }
  if (seatsRemaining <= 3) return { text: `${seatsRemaining} seat${seatsRemaining === 1 ? '' : 's'} left`, color: 'var(--amber-dark)' }
  return { text: `${seatsRemaining} of ${maxSeats} seats available`, color: 'var(--text-dim)' }
}

// ── Backdrop ──────────────────────────────────────────────────────────────────
function Overlay({ children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}
    >
      <div onClick={e => e.stopPropagation()} style={{ width: '100%' }}>{children}</div>
    </div>
  )
}

// ── Seat Picker ───────────────────────────────────────────────────────────────
function SeatPicker({ seatsRemaining, isFull, onPick, onCancel }) {
  const maxChoice = isFull ? 4 : Math.min(4, seatsRemaining)
  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '0.4rem', fontWeight: 500 }}>
        {isFull ? 'Join waitlist — how many seats?' : 'How many seats?'}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {[1, 2, 3, 4].map(n => (
          <button
            key={n}
            onClick={() => onPick(n)}
            disabled={!isFull && n > seatsRemaining}
            style={{
              width: 36, height: 36, borderRadius: '50%', border: '2px solid',
              borderColor: (!isFull && n > seatsRemaining) ? 'var(--border)' : isFull ? 'var(--amber)' : 'var(--teal)',
              background: (!isFull && n > seatsRemaining) ? 'var(--surface2)' : 'transparent',
              color: (!isFull && n > seatsRemaining) ? 'var(--border)' : isFull ? 'var(--amber-dark)' : 'var(--teal)',
              fontWeight: 700, fontSize: '0.9rem',
              cursor: (!isFull && n > seatsRemaining) ? 'not-allowed' : 'pointer',
            }}
          >
            {n}
          </button>
        ))}
        <button
          onClick={onCancel}
          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '0.78rem', cursor: 'pointer', padding: '0 0.25rem' }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ── Add Screening Sheet (admin) ───────────────────────────────────────────────
function AddScreeningSheet({ session, onClose, onAdded }) {
  const [movies, setMovies] = useState([])
  const [movieSearch, setMovieSearch] = useState('')
  const [pickedMovie, setPickedMovie] = useState(null)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('18:00')
  const [maxSeats, setMaxSeats] = useState(20)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

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
    if (!res.ok) { setErr(data.error || 'Failed'); return }
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
            <input
              placeholder="Search movies…"
              value={movieSearch}
              onChange={e => setMovieSearch(e.target.value)}
              style={{ width: '100%', padding: '0.65rem 0.85rem', border: '1.5px solid var(--border)', borderRadius: '10px', fontSize: '0.9rem', background: 'var(--surface2)', marginBottom: '0.5rem', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
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
function ScreeningCard({ ev, session, isAdmin, onRefresh }) {
  const [acting, setActing] = useState(false)
  const [pickingSeats, setPickingSeats] = useState(false)

  const { text: seatsText, color: seatsColor } = seatsLabel(ev.seats_remaining, ev.max_seats)
  const myStatus = ev.my_booking?.status || null
  const mySeats = ev.my_booking?.seats || 1
  const movie = ev.movies
  const isFull = ev.seats_remaining === 0

  async function book(seats) {
    setPickingSeats(false)
    setActing(true)
    await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ event_id: ev.id, seats }),
    })
    setActing(false)
    onRefresh()
  }

  async function cancel() {
    setActing(true)
    await fetch('/api/bookings', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ event_id: ev.id }),
    })
    setActing(false)
    onRefresh()
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
      <div style={{ display: 'flex' }}>
        {/* Poster */}
        {movie?.poster_url ? (
          <img src={movie.poster_url} alt={movie.title} style={{ width: 90, minHeight: 130, objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 90, minHeight: 130, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', flexShrink: 0 }}>🎬</div>
        )}

        {/* Info */}
        <div style={{ flex: 1, padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.3 }}>{ev.title}</div>
          <div style={{ color: 'var(--teal)', fontSize: '0.82rem', fontWeight: 600 }}>
            {fmtDate(ev.event_date)} · {fmtTime(ev.event_time)}
          </div>
          {movie?.genre && <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>{movie.genre}</div>}
          {ev.notes && <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem', fontStyle: 'italic' }}>{ev.notes}</div>}

          {/* Seat availability */}
          <div style={{ marginTop: '0.2rem', fontSize: '0.78rem', color: seatsColor, fontWeight: 500 }}>
            {seatsText}
            {ev.waitlist_count > 0 && <span style={{ color: 'var(--amber-dark)', marginLeft: '0.5rem' }}>· {ev.waitlist_count} on waitlist</span>}
          </div>

          {/* Actions */}
          <div style={{ marginTop: 'auto', paddingTop: '0.4rem' }}>
            {myStatus === 'confirmed' && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.65rem', borderRadius: '20px' }}>
                  ✓ {mySeats} seat{mySeats > 1 ? 's' : ''} booked
                </span>
                <button onClick={cancel} disabled={acting}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.3rem 0.65rem', fontSize: '0.78rem', cursor: acting ? 'not-allowed' : 'pointer', color: 'var(--text-dim)' }}>
                  Cancel
                </button>
              </div>
            )}
            {myStatus === 'waitlist' && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ background: '#fef3c7', color: '#d97706', fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.65rem', borderRadius: '20px' }}>
                  ⏳ Waitlist — {mySeats} seat{mySeats > 1 ? 's' : ''}
                </span>
                <button onClick={cancel} disabled={acting}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.3rem 0.65rem', fontSize: '0.78rem', cursor: acting ? 'not-allowed' : 'pointer', color: 'var(--text-dim)' }}>
                  Leave
                </button>
              </div>
            )}
            {!myStatus && !pickingSeats && (
              <button
                onClick={() => setPickingSeats(true)}
                disabled={acting}
                style={{
                  background: isFull ? 'var(--amber)' : 'var(--teal)', color: '#fff', border: 'none',
                  borderRadius: '8px', padding: '0.4rem 1rem', fontSize: '0.82rem', fontWeight: 600,
                  cursor: acting ? 'not-allowed' : 'pointer', opacity: acting ? 0.6 : 1,
                }}
              >
                {isFull ? 'Join Waitlist' : 'Book'}
              </button>
            )}
            {!myStatus && pickingSeats && (
              <SeatPicker
                seatsRemaining={ev.seats_remaining}
                isFull={isFull}
                onPick={book}
                onCancel={() => setPickingSeats(false)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Admin bar */}
      {isAdmin && (
        <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
          <span>{ev.confirmed_seats} seats confirmed · {ev.waitlist_count} on waitlist</span>
          <span>{ev.max_seats} total</span>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Screenings() {
  const [screenings, setScreenings] = useState([])
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [member, setMember] = useState(null)
  const [showAdd, setShowAdd] = useState(false)

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
            <ScreeningCard key={ev.id} ev={ev} session={session} isAdmin={member?.is_admin} onRefresh={loadScreenings} />
          ))}
        </div>
      )}

      {showAdd && (
        <Overlay onClose={() => setShowAdd(false)}>
          <AddScreeningSheet session={session} onClose={() => setShowAdd(false)} onAdded={loadScreenings} />
        </Overlay>
      )}
    </div>
  )
}
