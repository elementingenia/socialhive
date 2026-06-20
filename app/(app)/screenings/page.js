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

// ── Community Score ───────────────────────────────────────────────────────────
function CommunityScore({ communityScore }) {
  if (!communityScore || communityScore.count === 0) return null
  return (
    <span style={{ color: 'var(--teal)', fontWeight: 800, fontSize: '0.9rem', lineHeight: 1 }}>
      <sup style={{ fontSize: '0.5rem', fontWeight: 700, verticalAlign: 'super', lineHeight: 0 }}>
        ({communityScore.count})
      </sup>
      {communityScore.avg.toFixed(1)}
    </span>
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
          <span>{t.type === 'error' ? '✕' : t.type === 'warn' ? '⏳' : '✓'}</span>
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

// ── Split Booking Dialog ──────────────────────────────────────────────────────
function SplitDialog({ offer, onAccept, onDecline }) {
  return (
    <div onClick={onDecline} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Almost enough seats</div>
        <div style={{ fontSize: '0.88rem', color: 'var(--text-dim)', marginBottom: '1rem', lineHeight: 1.55 }}>
          We can confirm <strong style={{ color: '#15803d' }}>{offer.confirmed} seat{offer.confirmed !== 1 ? 's' : ''}</strong> right
          now and hold <strong style={{ color: 'var(--amber-dark)' }}>{offer.waitlisted} seat{offer.waitlisted !== 1 ? 's' : ''}</strong> on
          the waitlist — you&apos;ll be first in line if more space opens up.
        </div>
        <div style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.82rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
            <span style={{ color: 'var(--text-dim)' }}>✓ Confirmed now</span>
            <span style={{ fontWeight: 700, color: '#15803d' }}>{offer.confirmed} seat{offer.confirmed !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>⏳ On the waitlist</span>
            <span style={{ fontWeight: 700, color: 'var(--amber-dark)' }}>{offer.waitlisted} seat{offer.waitlisted !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={onDecline} style={{ flex: 1, padding: '0.75rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', color: 'var(--text)' }}>
            Go back
          </button>
          <button onClick={onAccept} style={{ flex: 1, padding: '0.75rem', background: 'var(--teal)', border: 'none', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', color: '#fff' }}>
            Accept
          </button>
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
// allowOverflow: red overflow buttons shown even when changing (for confirmed→split change)
// noOverflow: all seats above seatsRemaining are disabled (for split→confirm change)
function SeatPicker({ seatsRemaining, isFull, currentSeats, onPick, onCancel, allowOverflow, noOverflow }) {
  const isChanging = !!currentSeats
  const showOverflowHint = !isFull && seatsRemaining > 0 && seatsRemaining < 4 &&
    (!isChanging || allowOverflow)

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '0.4rem', fontWeight: 500 }}>
        {isFull ? 'Join waitlist — how many seats?' : isChanging ? 'Change to how many seats?' : 'How many seats?'}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {[1, 2, 3, 4].map(n => {
          const isActive = n === currentSeats
          // Disabled: changing without overflow allowed (e.g. split→confirm change caps at confirmed)
          const isDisabled = isChanging && noOverflow && n > seatsRemaining
          // Overflow (red): new booking OR change with allowOverflow
          const willOverflow = !isFull && n > seatsRemaining && seatsRemaining > 0 &&
            (!isChanging || allowOverflow) && !isDisabled

          let borderColor, bgColor, textColor, cursor
          if (isActive) {
            borderColor = 'var(--teal)'; bgColor = 'var(--teal)'; textColor = '#fff'; cursor = 'pointer'
          } else if (isDisabled) {
            borderColor = 'var(--border)'; bgColor = 'var(--surface2)'; textColor = 'var(--border)'; cursor = 'not-allowed'
          } else if (isFull) {
            borderColor = 'var(--amber)'; bgColor = 'transparent'; textColor = 'var(--amber-dark)'; cursor = 'pointer'
          } else if (willOverflow) {
            borderColor = 'var(--danger)'; bgColor = 'transparent'; textColor = 'var(--danger)'; cursor = 'pointer'
          } else {
            borderColor = 'var(--teal)'; bgColor = 'transparent'; textColor = 'var(--teal)'; cursor = 'pointer'
          }

          return (
            <button
              key={n}
              onClick={() => cursor !== 'not-allowed' && onPick(n)}
              style={{
                width: 40, height: 40, borderRadius: '50%', border: '2px solid',
                borderColor, background: bgColor, color: textColor,
                fontWeight: 700, fontSize: '0.95rem', cursor,
              }}
            >{n}</button>
          )
        })}
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '0.8rem', cursor: 'pointer', padding: '0 0.25rem' }}>✕</button>
      </div>
      {showOverflowHint && (
        <div style={{ fontSize: '0.7rem', color: 'var(--danger)', marginTop: '0.35rem' }}>
          Red seats will be placed on the waitlist
        </div>
      )}
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
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ movie_id: pickedMovie?.id || null, event_date: date, event_time: time, max_seats: Number(maxSeats), notes: notes || null }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setErr(data.error || 'Failed'); addToast('Failed to add screening', 'error'); return }
    addToast('Screening added — ' + (pickedMovie?.title || 'Movie Night') + ' on ' + date, 'success')
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
  const [acting,           setActing]          = useState(false)
  const [pickingSeats,     setPickingSeats]     = useState(false)
  const [changingSeats,    setChangingSeats]    = useState(false)
  const [changingSplit,    setChangingSplit]     = useState(false)
  const [confirmCancel,    setConfirmCancel]    = useState(false)
  const [showAttendees,    setShowAttendees]    = useState(false)
  const [splitOffer,       setSplitOffer]       = useState(null)
  const [changeSplitOffer, setChangeSplitOffer] = useState(null)

  const movie    = ev.movies
  const isFull   = ev.seats_remaining === 0

  const hasConfirmed      = ev.my_booking?.has_confirmed      || false
  const hasWaitlist       = ev.my_booking?.has_waitlist       || false
  const myConfirmedSeats  = ev.my_booking?.confirmed_seats    || 0
  const myWaitlistSeats   = ev.my_booking?.waitlist_seats     || 0
  const myWaitlistPos     = ev.my_booking?.waitlist_position  || null
  const hasAnyBooking     = hasConfirmed || hasWaitlist

  async function book(seats) {
    setPickingSeats(false)
    setActing(true)
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ event_id: ev.id, seats }),
    })
    const data = await res.json()
    setActing(false)
    if (!res.ok) { addToast(data.error || 'Booking failed', 'error'); return }
    if (data.status === 'split_offer') {
      setSplitOffer({ confirmed: data.confirmed, waitlisted: data.waitlisted, seats })
      return
    }
    if (data.status === 'waitlist') {
      addToast('Added to waitlist — ' + seats + ' seat' + (seats > 1 ? 's' : '') + ' for ' + ev.title, 'warn')
    } else {
      addToast(seats + ' seat' + (seats > 1 ? 's' : '') + ' confirmed for ' + ev.title, 'success')
    }
    onRefresh()
  }

  async function acceptSplit() {
    const { seats, confirmed, waitlisted } = splitOffer
    setSplitOffer(null)
    setActing(true)
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ event_id: ev.id, seats, accept_split: true }),
    })
    const data = await res.json()
    setActing(false)
    if (!res.ok) { addToast(data.error || 'Booking failed', 'error'); return }
    // Two separate notifications — one for each outcome
    addToast((data.confirmed || confirmed) + ' seat' + ((data.confirmed || confirmed) > 1 ? 's' : '') + ' confirmed for ' + ev.title, 'success')
    setTimeout(() => {
      addToast((data.waitlisted || waitlisted) + ' seat' + ((data.waitlisted || waitlisted) > 1 ? 's' : '') + ' added to waitlist for ' + ev.title, 'warn')
    }, 600)
    onRefresh()
  }

  async function doChange(newSeats) {
    setChangingSeats(false)
    // If overflow into waitlist territory, show confirmation dialog first
    const maxConfirmable = ev.seats_remaining + myConfirmedSeats
    if (newSeats > maxConfirmable) {
      setChangeSplitOffer({ newSeats, confirmed: maxConfirmable, waitlisted: newSeats - maxConfirmable })
      return
    }
    await commitChange(newSeats)
  }

  async function commitChange(newSeats) {
    setChangeSplitOffer(null)
    setActing(true)
    const res = await fetch('/api/bookings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ event_id: ev.id, seats: newSeats }),
    })
    const data = await res.json()
    setActing(false)
    if (!res.ok) { addToast(data.error || 'Could not change seats', 'error'); return }
    if (data.status === 'split_change') {
      addToast(data.confirmed + ' seat' + (data.confirmed > 1 ? 's' : '') + ' confirmed for ' + ev.title, 'success')
      setTimeout(() => addToast(data.waitlisted + ' seat' + (data.waitlisted > 1 ? 's' : '') + ' added to waitlist for ' + ev.title, 'warn'), 600)
    } else {
      addToast('Changed to ' + newSeats + ' seat' + (newSeats > 1 ? 's' : '') + ' for ' + ev.title, 'success')
    }
    onRefresh()
  }

  async function doChangeSplit(newSeats) {
    setChangingSplit(false)
    setActing(true)
    const res = await fetch('/api/bookings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ event_id: ev.id, seats: newSeats }),
    })
    const data = await res.json()
    setActing(false)
    if (!res.ok) { addToast(data.error || 'Could not change seats', 'error'); return }
    if (data.status === 'split_change') {
      addToast(data.confirmed + ' seat' + (data.confirmed > 1 ? 's' : '') + ' confirmed for ' + ev.title, 'success')
      setTimeout(() => addToast(data.waitlisted + ' seat' + (data.waitlisted > 1 ? 's' : '') + ' on waitlist for ' + ev.title, 'warn'), 600)
    } else {
      addToast('Changed to ' + newSeats + ' seat' + (newSeats > 1 ? 's' : '') + ' for ' + ev.title, 'success')
      if (myWaitlistSeats > 0) setTimeout(() => addToast('Waitlist place removed for ' + ev.title, 'warn'), 600)
    }
    onRefresh()
  }

  async function doCancel() {
    setConfirmCancel(false)
    setActing(true)
    const res = await fetch('/api/bookings', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ event_id: ev.id }),
    })
    setActing(false)
    if (!res.ok) { addToast('Could not cancel — please try again', 'error'); return }
    addToast('Booking cancelled for ' + ev.title, 'success')
    onRefresh()
  }

  const confirmedAttendees = (ev.attendees || []).filter(a => a.status === 'confirmed')
  const waitlistAttendees  = (ev.attendees || []).filter(a => a.status === 'waitlist')

  return (
    <>
      <div style={{
        background: 'var(--surface)',
        borderRadius: '14px',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--teal)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow)',
      }}>
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

            <div style={{ color: 'var(--teal)', fontSize: '0.82rem', fontWeight: 600 }}>
              {fmtDate(ev.event_date)} · {fmtTime(ev.event_time)}
            </div>

            {movie?.genre && (
              <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>{movie.genre}</div>
            )}

            {movie?.plot && (
              <div style={{ color: 'var(--text-dim)', fontSize: '0.77rem', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {movie.plot}
              </div>
            )}

            {(movie?.rating_imdb || movie?.rating_rt || ev.community_score) && (
              <div style={{ display: 'flex', gap: '0.65rem', fontSize: '0.75rem', alignItems: 'center' }}>
                {movie?.rating_imdb && (movie?.imdb_id
                  ? <a href={`https://www.imdb.com/title/${movie.imdb_id}/`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--amber-dark)', fontWeight: 600, textDecoration: 'none' }}>★ {movie.rating_imdb}</a>
                  : <span style={{ color: 'var(--amber-dark)', fontWeight: 600 }}>★ {movie.rating_imdb}</span>
                )}
                {movie?.rating_rt && (
                  <a href={`https://www.rottentomatoes.com/search?search=${encodeURIComponent(movie.title)}`} target="_blank" rel="noopener noreferrer" style={{ color: '#fa320a', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    🍅 {movie.rating_rt}
                  </a>
                )}
                {ev.community_score && (
                  <CommunityScore communityScore={ev.community_score} />
                )}
              </div>
            )}

            <div style={{ marginTop: '0.2rem' }}>
              <CapacityBar
                confirmedSeats={ev.confirmed_seats}
                maxSeats={ev.max_seats}
                waitlistCount={ev.waitlist_count}
              />
            </div>

            {ev.notes && (
              <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem', fontStyle: 'italic' }}>{ev.notes}</div>
            )}

            {/* Actions */}
            <div style={{ paddingTop: '0.2rem' }}>

              {/* Split booking: both confirmed + waitlisted — badges + buttons */}
              {hasConfirmed && hasWaitlist && !changingSplit && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.65rem', borderRadius: '20px' }}>
                      ✓ {myConfirmedSeats} seat{myConfirmedSeats > 1 ? 's' : ''} confirmed
                    </span>
                    <span style={{ background: '#fef3c7', color: '#d97706', fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.65rem', borderRadius: '20px' }}>
                      ⏳ {myWaitlistPos ? `#${myWaitlistPos} waitlist` : 'Waitlist'} — {myWaitlistSeats} seat{myWaitlistSeats > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button onClick={() => setChangingSplit(true)} disabled={acting}
                      style={{ background: 'none', border: '1px solid var(--teal)', borderRadius: '8px', padding: '0.3rem 0.65rem', fontSize: '0.78rem', cursor: acting ? 'not-allowed' : 'pointer', color: 'var(--teal)', fontWeight: 600 }}>
                      Change
                    </button>
                    <button onClick={() => setConfirmCancel(true)} disabled={acting}
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.3rem 0.65rem', fontSize: '0.78rem', cursor: acting ? 'not-allowed' : 'pointer', color: 'var(--text-dim)' }}>
                      Cancel all
                    </button>
                  </div>
                </div>
              )}

              {/* Split booking: Change seat picker — total seats (confirmed+waitlist), overflow allowed */}
              {hasConfirmed && hasWaitlist && changingSplit && (
                <SeatPicker
                  seatsRemaining={myConfirmedSeats + myWaitlistSeats}
                  isFull={false}
                  currentSeats={myConfirmedSeats + myWaitlistSeats}
                  onPick={doChangeSplit}
                  onCancel={() => setChangingSplit(false)}
                  allowOverflow={true}
                />
              )}

              {/* Confirmed only */}
              {hasConfirmed && !hasWaitlist && !changingSeats && (
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.65rem', borderRadius: '20px' }}>
                    ✓ {myConfirmedSeats} seat{myConfirmedSeats > 1 ? 's' : ''} booked
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

              {/* Change seats picker — overflow (red) seats allowed, go to waitlist */}
              {hasConfirmed && !hasWaitlist && changingSeats && (
                <SeatPicker
                  seatsRemaining={ev.seats_remaining + myConfirmedSeats}
                  isFull={false}
                  currentSeats={myConfirmedSeats}
                  onPick={doChange}
                  onCancel={() => setChangingSeats(false)}
                  allowOverflow={true}
                />
              )}

              {/* Waitlist only */}
              {!hasConfirmed && hasWaitlist && (
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <span style={{ background: '#fef3c7', color: '#d97706', fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.65rem', borderRadius: '20px' }}>
                    ⏳ {myWaitlistPos ? `#${myWaitlistPos} on waitlist` : 'Waitlist'} — {myWaitlistSeats} seat{myWaitlistSeats > 1 ? 's' : ''}
                  </span>
                  <button onClick={() => setConfirmCancel(true)} disabled={acting}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.3rem 0.65rem', fontSize: '0.78rem', cursor: acting ? 'not-allowed' : 'pointer', color: 'var(--text-dim)' }}>
                    Leave
                  </button>
                </div>
              )}

              {/* Book button */}
              {!hasAnyBooking && !pickingSeats && (
                <button onClick={() => setPickingSeats(true)} disabled={acting}
                  style={{ background: isFull ? 'var(--amber)' : 'var(--teal)', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.4rem 1rem', fontSize: '0.82rem', fontWeight: 600, cursor: acting ? 'not-allowed' : 'pointer', opacity: acting ? 0.6 : 1 }}>
                  {acting ? '…' : isFull ? 'Join Waitlist' : 'Book'}
                </button>
              )}

              {/* Seat picker for new booking */}
              {!hasAnyBooking && pickingSeats && (
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

        {/* Admin attendees accordion */}
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
            hasConfirmed && hasWaitlist
              ? 'Cancel all your bookings for ' + ev.title + '? Both your confirmed seats and waitlist place will be released.'
              : !hasConfirmed && hasWaitlist
              ? 'Leave the waitlist for ' + ev.title + '? Your place in the queue will be lost.'
              : 'Cancel your ' + (myConfirmedSeats > 1 ? myConfirmedSeats + ' seats' : 'seat') + ' for ' + ev.title + '?' + (myConfirmedSeats > 1 ? ' All seats will be released.' : '')
          }
          onConfirm={doCancel}
          onCancel={() => setConfirmCancel(false)}
        />
      )}

      {splitOffer && (
        <SplitDialog
          offer={splitOffer}
          onAccept={acceptSplit}
          onDecline={() => setSplitOffer(null)}
        />
      )}

      {changeSplitOffer && (
        <SplitDialog
          offer={{ confirmed: changeSplitOffer.confirmed, waitlisted: changeSplitOffer.waitlisted }}
          onAccept={() => commitChange(changeSplitOffer.newSeats)}
          onDecline={() => setChangeSplitOffer(null)}
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
      headers: { 'Authorization': 'Bearer ' + session.access_token },
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

