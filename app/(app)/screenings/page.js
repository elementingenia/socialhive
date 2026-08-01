'use client'
import EventCoordinators from "@/components/EventCoordinators"
import { useLocations } from "@/lib/useLocations"
import EventImagePicker from "@/components/EventImagePicker"
import { validateShowing, posterFor, posterPosition, posterAlt } from "@/lib/showing"
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { computeFreeCost } from '@/lib/freeCost'
import EventSlideOut from '@/components/EventSlideOut'
import { BusIcon } from '@/components/NavIcons'
import { authedFetch, getAuthToken } from '@/lib/getAuthToken'
import { cutoffToInputValue, cutoffFromInputValue } from '@/lib/booking'
import TimeField from '@/components/TimeField'
import { useSameDateWarning } from '@/components/SameDateWarning'
import AttendeeNamingPicker from '@/components/AttendeeNamingPicker'

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
        role="button" tabIndex={0} aria-haspopup="listbox" aria-expanded={open}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); setQuery('') } }}
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
  // The id of the event this sheet is editing. For a brand-new showing it is
  // null until the first save, then it becomes the created event's id — so the
  // sheet switches from "create" to "edit" and a SECOND press of Save PATCHES
  // rather than creating a duplicate. (It would have: isEdit derived from the
  // `event` prop, which never changes after create.)
  const [savedId, setSavedId] = useState(null)
  const eventId = event?.id || savedId
  const isEdit  = !!eventId
  // A Movies event is a SHOWING. A film is one kind; "AFL Grand Final" is
  // another (Iain, 2026-07-31). Either way it books the venue — which is what
  // makes booking a football night through Movies secure the Cinema.
  const [showMode, setShowMode]       = useState(event && !event.movie_id ? 'other' : 'movie')
  const [freeText, setFreeText]       = useState(event && !event.movie_id ? (event.title || '') : '')
  const [movies, setMovies]           = useState([])
  const [pickedMovie, setPickedMovie] = useState(null)
  const [movieOpen, setMovieOpen]     = useState(false)
  const [movieQuery, setMovieQuery]   = useState('')
  const movieRef                      = useRef(null)
  const [date, setDate]               = useState(event?.event_date || '')
  const [time, setTime]               = useState(event?.event_time?.slice(0, 5) || '18:00')
  const [endTime, setEndTime]         = useState(event?.event_end_time?.slice(0, 5) || '20:00')
  const [maxSeats, setMaxSeats]       = useState(event?.max_seats || 20)
  // Venue for THIS screening. Defaults to the Cinema and renders LOCKED —
  // changing it is a deliberate act, not something to do by brushing past a
  // dropdown (Iain, 2026-07-31).
  //
  // THE DEFAULT IS BOUND BY ID, not by name. Iain: "If the location Cinema is
  // edited, as long as that edited name remains the default for movies, all
  // good." A name lookup fails exactly that test — rename Cinema to anything
  // else and the lookup finds nothing, so new screenings would default to no
  // venue at all. The id is stored once in hub_settings.location_id (migration
  // 073 pointed it at the Cinema) and survives any rename, because a rename
  // does not change the row's identity.
  //
  // There is deliberately no admin UI for it: the default is set, not managed.
  const allVenues                     = useLocations()
  const [venueId, setVenueId]         = useState(event?.location_id || null)
  const [venueEditing, setVenueEditing] = useState(false)
  const [notes, setNotes]             = useState(event?.notes || '')
  const [cutoff, setCutoff]           = useState(cutoffToInputValue(event?.reservation_cutoff))
  const [allowGuests, setAllowGuests] = useState(event ? !!event.allow_nonresident_guests : true) // new events default to "Anyone" (2026-07-25)
  const [requireNaming, setRequireNaming] = useState(!!event?.require_attendee_names)
  const [coordinator, setCoordinator] = useState(event?.coordinator?.id || null)
  const [saving, setSaving]           = useState(false)
  const [justSaved, setJustSaved]     = useState(false)
  const [cancelling, setCancelling]   = useState(false)
  const [err, setErr]                 = useState(null)
  // Default a NEW screening to the Movies venue. An existing screening keeps
  // whatever it was saved with. The name fallback only covers a database where
  // 073 has not run.
  useEffect(() => {
    let alive = true
    supabase.from('hub_settings').select('location_id').eq('hub_type', 'movies').maybeSingle()
      .then(({ data }) => {
        if (alive && data?.location_id) setVenueId(v => v || data.location_id)
      })
    return () => { alive = false }
  }, [])
  const fallbackVenueId = allVenues.find(v => v.name?.trim().toLowerCase() === 'cinema')?.id || null
  useEffect(() => {
    if (fallbackVenueId) setVenueId(v => v || fallbackVenueId)
  }, [fallbackVenueId])

  const venue      = allVenues.find(v => v.id === venueId) || null
  const venueName  = venue?.name || null
  const venueClosed = venue?.booking_status === 'closed'

  const { ask: askSameDate, Modal: SameDateModal } = useSameDateWarning()
  const [open, setOpen]               = useState(false)

  useEffect(() => {
    supabase.from('movies').select('id, title, poster_url, year').eq('we_own', false).eq('is_viewing_suggestion', true).order('title')
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

  async function cancelScreening() {
    if (!eventId) return
    if (!confirm('Cancel this screening? Anyone booked will be notified. It will be removed from the list.')) return
    setCancelling(true); setErr(null)
    const res = await authedFetch('/api/screenings', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId }),
    })
    setCancelling(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErr(d.error || 'Could not cancel this screening'); return
    }
    addToast('Screening cancelled', 'success')
    onSaved(); handleClose()
  }


  async function handleSubmit() {
    if (!date || !time) { setErr('Date and time are required'); return }
    if (!endTime) { setErr('An end time is required -- every screening books the Cinema as a common space'); return }

    // Space hard block (B) checked FIRST -- if the Cinema is unavailable
    // that's the only message, never a soft warning clicked through just to
    // get rejected on save. Same-date soft warning (A) only shows when
    // there's no hard conflict. Every screening books the fixed 'Cinema'
    // location (app/api/screenings/route.js's CINEMA_NAME), so that's what's
    // sent here even though there's no location picker in this form.
    try {
      const pre = await authedFetch('/api/events/precheck', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_date: date, event_time: time, event_end_time: endTime,
          location_type: 'onsite', location_id: venueId, exclude_event_id: eventId || null,
        }),
      }).then(r => r.json()).catch(() => ({}))
      if (pre.spaceConflict) { setErr(pre.spaceConflict.message); return }
      if (pre.sameDateEvents?.length) {
        if (!(await askSameDate(pre.sameDateEvents))) return
      }
    } catch {}

    const showErr = validateShowing({ mode: showMode, movieId: pickedMovie?.id, freeText })
    if (showErr) { setErr(showErr); return }

    setSaving(true); setErr(null)
    const body = { movie_id: showMode === 'movie' ? (pickedMovie?.id || null) : null,
                   showing_title: showMode === 'other' ? freeText.trim() : null,
                   location_id: venueId || null, event_date: date, event_time: time, event_end_time: endTime, max_seats: Number(maxSeats), notes: notes || null, coordinator_id: coordinator || null, reservation_cutoff: cutoffFromInputValue(cutoff), allow_nonresident_guests: allowGuests, require_attendee_names: requireNaming }
    if (eventId) body.event_id = eventId
    // try/finally so the button can NEVER be left stuck on "Saving…". It just
    // was: the route 500'd with an HTML body, res.json() threw, and
    // setSaving(false) was never reached — the save had actually worked, which
    // made it look like a hang rather than an error. A parse failure must not
    // be able to strand the UI, whatever the server does.
    let res, data
    try {
      res = await authedFetch('/api/screenings', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      data = await res.json().catch(() => ({}))
    } catch (e) {
      setSaving(false)
      setErr('Could not reach the server. Please try again.')
      addToast('Failed to save', 'error')
      return
    } finally {
      setSaving(false)
    }
    if (!res.ok) {
      setErr(data.error || `Save failed (${res.status})`)
      addToast('Failed to save', 'error'); return
    }
    const shownAs = showMode === 'other' ? freeText.trim() : (pickedMovie?.title || 'Movie Night')
    const wasCreate = !eventId
    addToast((wasCreate ? 'Screening added' : 'Screening updated') + ' — ' + shownAs + ' on ' + date, 'success')
    onSaved()

    // A brand-new free-text showing has no poster yet and the uploader needs an
    // event id, so the sheet stays open for it. It MUST be obvious that the save
    // worked, or this looks exactly like a failure — which is what happened the
    // first time out (Iain: "after saving then closing, the event was not
    // created"; it had been, there was just no signal). Hence the banner, and
    // switching to edit mode so the next Save updates instead of duplicating.
    if (wasCreate && showMode === 'other' && data?.id) {
      setSavedId(data.id)
      setJustSaved(true)
      return
    }
    handleClose()
  }

  const INPUT = { width: '100%', padding: '0.65rem 0.85rem', border: '1.5px solid var(--border)', borderRadius: '10px', fontSize: '1rem', background: 'var(--surface2)', boxSizing: 'border-box', fontFamily: 'inherit', appearance: 'none', WebkitAppearance: 'none' }
  const LABEL = { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }

  return (
    <>
      {SameDateModal}
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, opacity: open ? 1 : 0, transition: 'opacity 0.25s' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(420px, 100%)', background: 'var(--surface)', zIndex: 201, overflowY: 'auto', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)', boxShadow: '-8px 0 32px rgba(0,0,0,0.15)', paddingBottom: 32 }}>
        <div style={{ height: 4, background: 'var(--teal)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>{isEdit ? 'Edit Screening' : 'Add Screening'}</h2>
          <button onClick={handleClose} style={{ background: 'var(--surface2)', border: 'none', borderRadius: '50%', width: 36, height: 36, fontSize: 20, cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        <div style={{ padding: '1.25rem' }}>
          {/* Saving a new showing keeps this sheet open so a poster can be
              added — which looks identical to a failed save unless we say so. */}
          {justSaved && (
            <div style={{
              background: 'rgba(21,128,61,0.10)', border: '1px solid rgba(21,128,61,0.35)',
              color: '#15803d', borderRadius: 10, padding: '0.7rem 0.85rem',
              marginBottom: '1rem', fontSize: '0.85rem', fontWeight: 600,
            }}>
              ✓ Showing saved. Add a poster below if you want one, then close — nothing else to do.
            </div>
          )}
          {/* WHAT'S SHOWING — a film, or anything else the Cinema is being used
              for. Either way the venue is booked, which is the point. */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={LABEL}>Showing</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[['movie', 'A movie'], ['other', 'Something else']].map(([v, txt]) => (
                <button key={v} type="button" onClick={() => setShowMode(v)} style={{
                  flex: 1, padding: '0.5rem', borderRadius: 10, fontFamily: 'inherit',
                  fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', border: '2px solid',
                  borderColor: showMode === v ? 'var(--teal)' : 'var(--border)',
                  background: showMode === v ? 'var(--teal)18' : 'var(--surface)',
                  color: showMode === v ? 'var(--teal)' : 'var(--text-dim)',
                }}>{txt}</button>
              ))}
            </div>
          </div>

          {showMode === 'other' ? (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={LABEL}>What&apos;s showing <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input value={freeText} onChange={e => setFreeText(e.target.value)} maxLength={80}
                  placeholder="e.g. AFL Grand Final"
                  style={{ ...INPUT, border: `1.5px solid ${freeText.trim() ? 'var(--green)' : 'var(--danger)'}` }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={LABEL}>Poster</label>
                {/* Same uploader and focal-point picker Social and Clubs use, and
                    it fills the exact slot a movie poster fills on the card.
                    It needs an event to attach to, so on a NEW showing it
                    appears once the screening has been saved — the form stays
                    open after create for precisely this reason. */}
                {eventId ? (
                  <EventImagePicker
                    eventId={eventId}
                    imageUrl={event?.image_url}
                    focalX={event?.image_focal_x}
                    focalY={event?.image_focal_y}
                    colour="var(--teal)"
                    getToken={getAuthToken}
                    onUpdated={onSaved}
                  />
                ) : (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', background: 'var(--surface2)', borderRadius: 10, padding: '0.7rem 0.85rem' }}>
                    Save this showing first, then add a poster here. Without one the card shows the 🎬 placeholder.
                  </div>
                )}
              </div>
            </>
          ) : (
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
          )}
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
            <TimeField value={time} onChange={setTime} colour={time ? 'var(--green)' : 'var(--danger)'} />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={LABEL}>Ends <span style={{ color: 'var(--danger)' }}>*</span></label>
            <TimeField value={endTime} onChange={setEndTime} colour={endTime ? 'var(--green)' : 'var(--danger)'} />
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.3rem' }}>
              Every screening books {venueName || 'the venue'} as a common space, so an end time keeps it from double-booking.
            </div>
          </div>

          {/* VENUE — locked by default. Preset to the hub's nominated venue;
              "Edit" unlocks it for this screening only. Changing it here does
              NOT change the hub default (Admin > Movies > Venue does that). */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={LABEL}>Venue</label>
            {!venueEditing ? (
              <div style={{
                ...INPUT, display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: 'var(--surface2)', color: venueName ? 'var(--text)' : 'var(--danger)',
              }}>
                <span style={{ flex: 1, fontWeight: 600 }}>{venueName || 'No venue set'}</span>
                <button type="button" onClick={() => setVenueEditing(true)} style={{
                  background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 700,
                  fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                }}>Edit</button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {allVenues.map(v => (
                    <button key={v.id} type="button" onClick={() => { setVenueId(v.id); setVenueEditing(false) }} style={{
                      padding: '0.55rem 0.8rem', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: '0.88rem', border: '2px solid',
                      borderColor: venueId === v.id ? 'var(--teal)' : 'var(--border)',
                      background: venueId === v.id ? 'var(--teal)12' : 'var(--surface)',
                      color: venueId === v.id ? 'var(--teal)' : 'var(--text)',
                      fontWeight: venueId === v.id ? 700 : 500,
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                    }}>
                      <span style={{ flex: 1 }}>{v.name}</span>
                      {v.booking_status === 'closed' && (
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#b45309' }}>Closed</span>
                      )}
                      {venueId === v.id && <span>✓</span>}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => { setVenueEditing(false) }} style={{
                  marginTop: '0.4rem', background: 'none', border: 'none', color: 'var(--text-dim)',
                  fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                }}>Cancel</button>
              </>
            )}
            {/* Only warn when there IS something to warn about. */}
            {venueClosed && (
              <div style={{ fontSize: '0.72rem', color: '#b45309', marginTop: '0.3rem' }}>
                {venueName} is currently closed for bookings.
              </div>
            )}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={LABEL}>Max Seats</label>
            <input type="number" value={maxSeats} onChange={e => setMaxSeats(e.target.value)} min={1} max={200} style={INPUT} />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <AttendeeNamingPicker
              allowGuests={allowGuests}
              onAllowGuestsChange={setAllowGuests}
              required={requireNaming}
              onRequiredChange={setRequireNaming}
              colour="var(--teal, #0d9488)"
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={LABEL}>Bookings close (optional)</label>
            <input type="datetime-local" value={cutoff} onChange={e => setCutoff(e.target.value)} style={INPUT} />
            <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '0.35rem' }}>After this, residents see &ldquo;Bookings Closed&rdquo; instead of the booking button. Leave blank to keep bookings open until the screening.</div>
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

          {/* Cancel a screening. Only once it exists, and visually separated
              from Save so it can't be hit by accident. Archives rather than
              hard-deletes — bookings and history survive — which is exactly
              what Clubs does. */}
          {eventId && (
            <button onClick={cancelScreening} disabled={cancelling}
              style={{ width: '100%', marginTop: '2rem', padding: '0.6rem', borderRadius: 8,
                border: '1px solid #fca5a5', background: '#fee2e2', color: '#991b1b',
                fontWeight: 700, fontSize: '0.8rem', fontFamily: 'inherit',
                cursor: cancelling ? 'not-allowed' : 'pointer', opacity: cancelling ? 0.6 : 1 }}>
              {cancelling ? 'Cancelling…' : 'Cancel this screening'}
            </button>
          )}
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
  // Own row always pinned to the top of the list, ahead of everyone else —
  // consistent with the Coordinator View panel and every other attendee list.
  const bySelfFirst = (a, b) => (b.isOwn === true) - (a.isOwn === true)
  const confirmedAttendees = (ev.attendees || []).filter(a => a.status === 'confirmed').sort(bySelfFirst)
  const waitlistAttendees  = (ev.attendees || []).filter(a => a.status === 'waitlist').sort(bySelfFirst)

  return (
    <div onClick={onOpen}
      style={{ background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow)', cursor: 'pointer' }}>

      <div style={{ display: 'flex' }}>
        {/* A film's poster, or the uploaded image for a free-text showing — the
            same slot either way, so an AFL Grand Final card looks like a film's.
            An uploaded photo honours its focal point; a movie poster is authored
            art and stays centred. */}
        {posterFor(ev, movie)
          ? <img src={posterFor(ev, movie)} alt={posterAlt(ev, movie)}
              style={{ width: 100, minHeight: 140, objectFit: 'cover', objectPosition: posterPosition(ev, movie), flexShrink: 0 }} />
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
            <div style={{ fontWeight: 800, fontSize: '1.1rem', lineHeight: 1.2 }}>
              {movie?.title || ev.title}{movie?.rating && <span style={{ fontWeight: 400, fontSize: '0.75em', verticalAlign: 'baseline', color: 'var(--text-dim)' }}> ({movie.rating})</span>}
            </div>
            {isAdmin && freeCostData && (
              <span style={{ background: freeCostData.isFree ? '#dcfce7' : '#fef3c7', color: freeCostData.isFree ? '#15803d' : '#d97706', borderRadius: '20px', padding: '0.15rem 0.55rem', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                ● {freeCostData.isFree ? (freeCostData.reasons[0] || 'Free') : 'Cost'}
              </span>
            )}
            {ev.has_bus && ev.bus_driver && (
              <span style={{ fontSize: '0.72rem', color: 'var(--teal)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <BusIcon size={12} /> {ev.bus_driver.name || ev.bus_driver.username}
              </span>
            )}
          </div>
          <EventCoordinators eventId={ev.id} eventTitle={movie?.title || ev.title}
            names={ev.coordinator ? [ev.coordinator.name || ev.coordinator.username] : []} colour="var(--teal)" />
          {movie?.actors && (
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
              {movie.actors.split(',')[0]?.trim()}
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
                  <div key={i} style={{ padding: '0.2rem 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                      <span style={{ fontWeight: a.isOwn ? 700 : 400, color: a.isOwn ? 'var(--teal)' : 'var(--text)' }}>
                        {a.name}
                        {a.isPrivate && !a.isOwn && a.name !== 'Resident' && <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-dim)', marginLeft: 4 }}>(P)</span>}
                      </span>
                      <span style={{ color: 'var(--text-dim)' }}>{a.seats} seat{a.seats > 1 ? 's' : ''}</span>
                    </div>
                    {a.party && a.party.length > 0 && (
                      <div style={{ paddingLeft: '0.85rem', marginTop: '0.1rem', display: 'flex', flexDirection: 'column', gap: '0.05rem' }}>
                        {a.party.map((p, j) => (
                          <span key={j} style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                            + {p.name}{p.guest ? ' (guest)' : ''}{p.isPrivate && !p.guest && p.name !== 'Resident' ? ' (P)' : ''}
                          </span>
                        ))}
                      </div>
                    )}
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
                    <span style={{ fontWeight: a.isOwn ? 700 : 400, color: a.isOwn ? 'var(--teal)' : 'var(--text)' }}>
                      {a.name}
                      {a.isPrivate && !a.isOwn && a.name !== 'Resident' && <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-dim)', marginLeft: 4 }}>(P)</span>}
                    </span>
                    <span style={{ color: 'var(--text-dim)' }}>{a.seats} seat{a.seats > 1 ? 's' : ''}</span>
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
      authedFetch('/api/screenings'),
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
    const res = await authedFetch('/api/screenings')
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
