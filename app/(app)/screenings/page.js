'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { computeFreeCost } from '@/lib/freeCost'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtDateLong(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).toUpperCase()
}

function fmtTime(timeStr) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`
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
          <strong style={{ color: 'var(--text)' }}>{Math.max(0, maxSeats - confirmedSeats)}</strong> of {maxSeats} seats left
          {waitlistSeats > 0 && <span style={{ color: 'var(--amber-dark)', marginLeft: '0.4rem' }}>· {waitlistSeats} seat{waitlistSeats !== 1 ? 's' : ''} on waitlist</span>}
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


// ── CoordPicker ───────────────────────────────────────────────────────────────
function CoordPicker({ members, value, onChange, valid = false }) {
  const chosen = members.find(m => m.id === value) || null
  const [query,  setQuery]  = useState("")
  const [open,   setOpen]   = useState(false)
  const containerRef        = useRef(null)

  const filtered = members.filter(m =>
    !query || (m.name || m.username || "").toLowerCase().includes(query.toLowerCase())
  ).slice(0, query.length >= 2 ? 10 : 5)

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const borderCol = open ? "var(--teal)" : valid ? "var(--green)" : "var(--border)"
  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div
        onClick={() => { setOpen(o => !o); setQuery("") }}
        style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: 10,
          border: `1.5px solid ${borderCol}`, background: "var(--surface)",
          color: chosen ? "var(--text)" : "var(--text-dim)", fontSize: "0.95rem",
          boxSizing: "border-box", fontFamily: "inherit", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{chosen ? (chosen.name || chosen.username) : "— Select coordinator —"}</span>
        <span style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>▾</span>
      </div>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
          boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 60, overflow: "hidden" }}>
          <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
            <input
              autoFocus
              type="text"
              placeholder="Search name…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ width: "100%", border: "none", background: "transparent",
                color: "var(--text)", fontSize: "0.9rem", outline: "none", fontFamily: "inherit" }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {value && (
              <div
                onClick={() => { onChange(""); setOpen(false) }}
                style={{ padding: "0.65rem 1rem", cursor: "pointer", fontSize: "0.85rem",
                  color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>
                — Clear selection —
              </div>
            )}
            {filtered.map(m => (
              <div key={m.id}
                onClick={() => { onChange(m.id); setOpen(false) }}
                style={{ padding: "0.65rem 1rem", cursor: "pointer",
                  background: m.id === value ? "rgba(0,128,128,0.08)" : "transparent",
                  borderBottom: "1px solid var(--border)",
                  fontWeight: m.id === value ? 700 : 400, fontSize: "0.88rem",
                  color: m.id === value ? "var(--teal)" : "var(--text)" }}>
                {m.name || m.username}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "0.9rem 1rem", fontSize: "0.85rem", color: "var(--text-dim)" }}>No match</div>
            )}
            {members.length > 5 && !query && (
              <div style={{ padding: "0.5rem 1rem", fontSize: "0.72rem", color: "var(--text-dim)",
                borderTop: "1px solid var(--border)" }}>
                Type to search all {members.length} members
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add/Edit Screening Sheet (admin) ─────────────────────────────────────────
function ScreeningSheet({ session, event, members, onClose, onSaved, addToast }) {
  const isEdit = !!event
  const [movies, setMovies] = useState([])
  const [pickedMovie, setPickedMovie] = useState(null)
  const [movieOpen, setMovieOpen] = useState(false)
  const [movieQuery, setMovieQuery] = useState("")
  const movieRef = useRef(null)
  const [date, setDate]         = useState(event?.event_date || "")
  const [time, setTime]         = useState(event?.event_time?.slice(0,5) || "18:00")
  const [maxSeats, setMaxSeats] = useState(event?.max_seats || 20)
  const [notes, setNotes]       = useState(event?.notes || "")
  const [coordinator, setCoordinator] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState(null)
  const [open, setOpen]       = useState(false)

  useEffect(() => {
    supabase.from("movies").select("id, title, poster_url, year").eq("we_own", false).order("title")
      .then(({ data }) => setMovies(data || []))
    if (event?.movie_id) {
      supabase.from("movies").select("id, title, poster_url, year").eq("id", event.movie_id).single()
        .then(({ data }) => { if (data) setPickedMovie(data) })
    }
    if (event?.id) {
      supabase.from("event_coordinators").select("member_id, members(id, name, username)")
        .eq("event_id", event.id).is("replaced_at", null).limit(1).maybeSingle()
        .then(({ data }) => { if (data?.members) setCoordinator(data.members) })
    }
    requestAnimationFrame(() => setOpen(true))
  }, [])

  const moviePool = movies.filter(m => !movieQuery || m.title.toLowerCase().includes(movieQuery.toLowerCase()))
  const movieFiltered = moviePool.slice(0, movieQuery ? 40 : 5)

  useEffect(() => {
    if (!movieOpen) return
    function handler(e) { if (movieRef.current && !movieRef.current.contains(e.target)) { setMovieOpen(false); setMovieQuery("") } }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [movieOpen])

  function handleClose() { setOpen(false); setTimeout(onClose, 280) }

  async function handleSubmit() {
    if (!date || !time) { setErr("Date and time are required"); return }
    setSaving(true); setErr(null)
    const body = {
      movie_id: pickedMovie?.id || null, event_date: date, event_time: time,
      max_seats: Number(maxSeats), notes: notes || null, coordinator_id: coordinator?.id || null,
    }
    if (isEdit) body.event_id = event.id
    const res = await fetch("/api/screenings", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + session.access_token },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setErr(data.error || "Failed"); addToast("Failed to save", "error"); return }
    addToast((isEdit ? "Screening updated" : "Screening added") + " — " + (pickedMovie?.title || "Movie Night") + " on " + date, "success")
    onSaved()
    handleClose()
  }

  const INPUT = { width: "100%", padding: "0.65rem 0.85rem", border: "1.5px solid var(--border)", borderRadius: "10px", fontSize: "0.9rem", background: "var(--surface2)", boxSizing: "border-box", fontFamily: "inherit" }
  const LABEL = { display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.05em" }

  return (
    <>
      <div onClick={handleClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, opacity: open ? 1 : 0, transition: "opacity 0.25s" }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "min(420px, 100%)",
        background: "var(--surface)", zIndex: 201, overflowY: "auto",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.15)", paddingBottom: 32,
      }}>
        <div style={{ height: 4, background: "var(--teal)" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>{isEdit ? "Edit Screening" : "Add Screening"}</h2>
          <button onClick={handleClose} style={{ background: "var(--surface2)", border: "none", borderRadius: "50%", width: 36, height: 36, fontSize: 20, cursor: "pointer", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        <div style={{ padding: "1.25rem" }}>
          {/* Movie picker — shows first 5 on open, filter by typing */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={LABEL}>Movie</label>
            {pickedMovie ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: "var(--surface2)", borderRadius: "10px", padding: "0.75rem" }}>
                {pickedMovie.poster_url && <img src={pickedMovie.poster_url} alt="" style={{ width: 36, height: 54, objectFit: "cover", borderRadius: 4 }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{pickedMovie.title}</div>
                  {pickedMovie.year && <div style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>{pickedMovie.year}</div>}
                </div>
                <button onClick={() => setPickedMovie(null)} style={{ background: "none", border: "none", color: "var(--teal)", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}>Change</button>
              </div>
            ) : (
              <div ref={movieRef} style={{ position: "relative" }}>
                <button onClick={() => setMovieOpen(v => !v)} style={{
                  ...INPUT, cursor: "pointer", textAlign: "left", display: "flex",
                  justifyContent: "space-between", alignItems: "center",
                  borderRadius: movieOpen ? "10px 10px 0 0" : "10px",
                }}>
                  <span style={{ color: "var(--text-dim)" }}>Select a movie…</span>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>{movieOpen ? "▲" : "▼"}</span>
                </button>
                {movieOpen && (
                  <div style={{ position: "absolute", left: 0, right: 0, top: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 10px 10px", zIndex: 50, maxHeight: 260, overflowY: "auto" }}>
                    <input autoFocus value={movieQuery} onChange={e => setMovieQuery(e.target.value)}
                      placeholder="Type to filter…"
                      style={{ width: "100%", padding: "0.6rem 0.85rem", border: "none", borderBottom: "1px solid var(--border)", fontSize: "0.9rem", background: "var(--surface2)", boxSizing: "border-box", fontFamily: "inherit", outline: "none" }} />
                    {movieFiltered.map(m => (
                      <div key={m.id} onClick={() => { setPickedMovie(m); setMovieOpen(false); setMovieQuery("") }}
                        style={{ display: "flex", alignItems: "center", gap: "0.65rem", padding: "0.6rem 0.85rem", cursor: "pointer", borderBottom: "1px solid var(--border)" }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                        onMouseLeave={e => e.currentTarget.style.background = ""}>
                        {m.poster_url && <img src={m.poster_url} alt="" style={{ width: 28, height: 42, objectFit: "cover", borderRadius: 3 }} />}
                        <span style={{ fontSize: "0.88rem" }}>{m.title}</span>
                        {m.year && <span style={{ color: "var(--text-dim)", fontSize: "0.78rem", marginLeft: "auto" }}>{m.year}</span>}
                      </div>
                    ))}
                    {movieFiltered.length === 0 && <div style={{ padding: "0.75rem", color: "var(--text-dim)", fontSize: "0.85rem" }}>No movies found</div>}
                    {!movieQuery && moviePool.length > 5 && <div style={{ padding: "0.5rem 0.85rem", color: "var(--text-dim)", fontSize: "0.78rem", fontStyle: "italic" }}>Showing first 5 — type to filter all {moviePool.length}</div>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Coordinator */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={LABEL}>Coordinator (optional)</label>
            <CoordPicker members={members} value={coordinator} onChange={setCoordinator} />
          </div>

          {/* Date */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={LABEL}>Date <span style={{ color: "var(--danger)" }}>*</span></label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} onClick={e => e.currentTarget.showPicker?.()}
              min={new Date().toISOString().split("T")[0]}
              style={{ ...INPUT, border: `1.5px solid ${date ? "var(--green)" : "var(--danger)"}` }} />
            {date && <div style={{ fontSize: "0.75rem", color: "var(--teal)", fontWeight: 600, marginTop: "0.3rem" }}>
              {new Date(date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long" })}
            </div>}
          </div>

          {/* Time */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={LABEL}>Time <span style={{ color: "var(--danger)" }}>*</span></label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              style={{ ...INPUT, border: `1.5px solid ${time ? "var(--green)" : "var(--danger)"}` }} />
          </div>

          {/* Max seats */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={LABEL}>Max Seats</label>
            <input type="number" value={maxSeats} onChange={e => setMaxSeats(e.target.value)} min={1} max={200} style={INPUT} />
          </div>

          {/* Notes */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={LABEL}>Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Bring a chair! BYO drinks." rows={2}
              style={{ ...INPUT, resize: "vertical" }} />
          </div>

          {err && <div style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: "1rem" }}>{err}</div>}

          <button onClick={handleSubmit} disabled={saving}
            style={{ width: "100%", padding: "0.9rem", background: "var(--teal)", color: "#fff", border: "none", borderRadius: "12px", fontSize: "1rem", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Screening"}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Screening Card ────────────────────────────────────────────────────────────
function ScreeningCard({ ev, session, isAdmin, freeCostData, members, onRefresh, addToast, onEdit }) {
  const [acting,           setActing]          = useState(false)
  const [pickingSeats,     setPickingSeats]     = useState(false)
  const [changingSeats,    setChangingSeats]    = useState(false)
  const [changingSplit,    setChangingSplit]     = useState(false)
  const [confirmCancel,    setConfirmCancel]    = useState(false)
  const [showAttendees,    setShowAttendees]    = useState(false)
  const [confirmLeaveWaitlist, setConfirmLeaveWaitlist] = useState(false)
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
            <img src={movie.poster_url} alt={movie.title} style={{ width: 100, minHeight: 140, objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 100, minHeight: 140, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', flexShrink: 0 }}>🎬</div>
          )}

          {/* Info */}
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

            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', lineHeight: 1.2 }}>{movie?.title || ev.title}</div>
              {isAdmin && freeCostData && (
                <span style={{ background:freeCostData.isFree?'#dcfce7':'#fef3c7', color:freeCostData.isFree?'#15803d':'#d97706', borderRadius:'20px', padding:'0.15rem 0.55rem', fontSize:'0.68rem', fontWeight:700, whiteSpace:'nowrap' }}>
                  ● {freeCostData.isFree ? (freeCostData.reasons[0] || 'Free') : 'Cost'}
                </span>
              )}
              {ev.coordinator && (
                <span style={{ fontSize:'0.72rem', color:'var(--teal)', fontWeight:600 }}>
                  👤 {ev.coordinator.name || ev.coordinator.username}
                </span>
              )}
            </div>

            {(movie?.actors || movie?.rating) && (
              <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                {movie.actors?.split(',')[0]?.trim()}{movie.actors && movie.rating ? ' ' : ''}{movie.rating ? `(${movie.rating})` : ''}
              </div>
            )}

            {(() => { const genres = parseGenres(movie?.genre); return genres.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                {genres.map(g => <span key={g} style={{ background: 'var(--surface2)', borderRadius: '20px', padding: '0.15rem 0.5rem', fontSize: '0.7rem', color: 'var(--text-dim)' }}>{g}</span>)}
              </div>
            )})()}

            {movie?.plot && (
              <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', lineHeight: 1.5 }}>
                {movie.plot}
              </div>
            )}

            {(movie?.rating_imdb || movie?.rating_rt || ev.community_score) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.2rem' }}>
                {movie?.rating_imdb && (movie?.imdb_id
                  ? <a href={`https://www.imdb.com/title/${movie.imdb_id}/`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                      <span style={{ display: 'inline-block', background: 'rgba(180,150,0,0.15)', color: 'var(--amber-dark)', fontWeight: 700, fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: '20px', border: '1px solid rgba(180,150,0,0.3)' }}>IMDb {movie.rating_imdb}</span>
                    </a>
                  : <span style={{ display: 'inline-block', background: 'rgba(180,150,0,0.15)', color: 'var(--amber-dark)', fontWeight: 700, fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: '20px', border: '1px solid rgba(180,150,0,0.3)' }}>IMDb {movie.rating_imdb}</span>
                )}
                {movie?.rating_rt && (
                  <a href={`https://www.rottentomatoes.com/search?search=${encodeURIComponent(movie.title)}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
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
              <CapacityBar
                confirmedSeats={ev.confirmed_seats}
                maxSeats={ev.max_seats}
                waitlistSeats={ev.waitlist_seats}
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
                      {myConfirmedSeats} Seat{myConfirmedSeats > 1 ? 's' : ''} Booked
                    </span>
                    <span style={{ background: '#fef3c7', color: '#d97706', fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.65rem', borderRadius: '20px' }}>
                      {myWaitlistPos ? `#${myWaitlistPos} Waitlist` : 'Waitlist'} {myWaitlistSeats} Seat{myWaitlistSeats > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button onClick={() => setChangingSplit(true)} disabled={acting}
                      style={{ background: 'none', border: '1px solid var(--teal)', borderRadius: '8px', padding: '0.3rem 0.65rem', fontSize: '0.78rem', cursor: acting ? 'not-allowed' : 'pointer', color: 'var(--teal)', fontWeight: 600 }}>
                      Change seats
                    </button>
                    <button onClick={() => setConfirmLeaveWaitlist(true)} disabled={acting}
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.3rem 0.65rem', fontSize: '0.78rem', cursor: acting ? 'not-allowed' : 'pointer', color: 'var(--text-dim)' }}>
                      Leave waitlist
                    </button>
                    <button onClick={() => setConfirmCancel(true)} disabled={acting}
                      style={{ background: 'none', border: '1px solid var(--danger)', borderRadius: '8px', padding: '0.3rem 0.65rem', fontSize: '0.78rem', cursor: acting ? 'not-allowed' : 'pointer', color: 'var(--danger)' }}>
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
                  noOverflow={true}
                />
              )}

              {/* Confirmed only */}
              {hasConfirmed && !hasWaitlist && !changingSeats && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button disabled style={{ background: '#15803d', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.45rem 0.85rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'default' }}>
                    {myConfirmedSeats} Seat{myConfirmedSeats > 1 ? 's' : ''} Booked
                  </button>
                  <button onClick={() => setChangingSeats(true)} disabled={acting}
                    style={{ background: 'none', border: '1.5px solid var(--border)', borderRadius: '8px', padding: '0.4rem 0.75rem', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text)', fontWeight: 600 }}>
                    Change seats
                  </button>
                  <button onClick={() => setConfirmCancel(true)} disabled={acting}
                    style={{ background: 'none', border: '1.5px solid var(--danger)', borderRadius: '8px', padding: '0.4rem 0.75rem', fontSize: '0.8rem', cursor: acting ? 'not-allowed' : 'pointer', color: 'var(--danger)', fontWeight: 600 }}>
                    Cancel booking
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
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button disabled style={{ background: '#d97706', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.45rem 0.85rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'default' }}>
                    {myWaitlistPos ? `#${myWaitlistPos} Waitlist` : 'Waitlist'} {myWaitlistSeats} Seat{myWaitlistSeats > 1 ? 's' : ''}
                  </button>
                  <button onClick={() => setConfirmLeaveWaitlist(true)} disabled={acting}
                    style={{ background: 'none', border: '1.5px solid var(--danger)', borderRadius: '8px', padding: '0.4rem 0.75rem', fontSize: '0.8rem', cursor: acting ? 'not-allowed' : 'pointer', color: 'var(--danger)', fontWeight: 600 }}>
                    Leave Waitlist
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

        {/* Attendees accordion — all members see confirmed; admins also see waitlist */}
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
          <button
            onClick={() => setShowAttendees(!showAttendees)}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 1rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'inherit' }}
          >
            <span>
              <strong style={{ color: 'var(--green)' }}>{ev.confirmed_seats} confirmed</strong>
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
                      <span>{a.name}</span>
                      <span style={{ color: 'var(--text-dim)' }}>{a.seats} seat{a.seats > 1 ? 's' : ''}</span>
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
                      <span>{a.name}</span>
                      <span style={{ color: 'var(--text-dim)' }}>{a.seats} seat{a.seats > 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmCancel && (
        <ConfirmDialog
          message={
            hasConfirmed && hasWaitlist
              ? 'Cancel all your bookings for ' + ev.title + '? Both your confirmed seats and waitlist place will be released.'
              : 'Cancel your ' + (myConfirmedSeats > 1 ? myConfirmedSeats + ' seats' : 'seat') + ' for ' + ev.title + '?' + (myConfirmedSeats > 1 ? ' All seats will be released.' : '')
          }
          onConfirm={doCancel}
          onCancel={() => setConfirmCancel(false)}
        />
      )}

      {confirmLeaveWaitlist && (
        <ConfirmDialog
          message={'Leave the waitlist for ' + ev.title + '? Your place in the queue will be lost.'}
          onConfirm={doCancel}
          onCancel={() => setConfirmLeaveWaitlist(false)}
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
  const [editEvent,  setEditEvent]  = useState(null)
  const [members,    setMembers]    = useState([])
  const [toasts,     setToasts]     = useState([])
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
    setOwnershipRecords((ownData||[]).map(o => ({ movie_id: o.movie_id, ownership_type: o.ownership_type, member_name: o.members?.name || null })))
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
            <ScreeningCard key={ev.id} ev={ev} session={session} isAdmin={member?.is_admin} members={members} freeCostData={member?.is_admin && ev.movies ? computeFreeCost(ev.movies, { streamingServices, dvdTmdbIds, dvdImdbIds, ownershipRecords: ownershipRecords.filter(o => o.movie_id === ev.movie_id) }) : null} onRefresh={loadScreenings} addToast={addToast} onEdit={ev => setEditEvent(ev)} />
          ))}
        </div>
      )}

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

