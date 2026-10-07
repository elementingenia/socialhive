'use client'
// Show Time: add a showing, one question at a time (Iain, 2026-10-07).
// Scope: claude/Element_Happenings_ShowTime_Resident_Events_Scope_Answered.md
//
// Everyone creates a showing here -- residents, Owners and admins. Anything
// beyond the five questions (poster, notes, co-coordinators, booking rules)
// is changed afterwards through the normal Edit on the showing's card.
// Server rules live in lib/residentShowing.js and app/api/screenings/resident.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { authedFetch } from '@/lib/getAuthToken'
import TimeField from '@/components/TimeField'
import { sydneyTodayStr } from '@/lib/date'
import { SHOWING_TITLE_MAX } from '@/lib/residentShowing'

const TEAL = 'var(--teal)'
const INPUT = { width: '100%', padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: 10, fontSize: '1rem', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box', fontFamily: 'inherit', appearance: 'none', WebkitAppearance: 'none' }
const LABEL = { display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '0.4rem' }
const QUESTION = { fontSize: '1.15rem', fontWeight: 800, margin: '0 0 0.75rem', lineHeight: 1.3 }

function Choice({ selected, onClick, children, sub }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} style={{
      width: '100%', textAlign: 'left', padding: '0.85rem 1rem', borderRadius: 12, marginBottom: '0.6rem',
      border: `2px solid ${selected ? TEAL : 'var(--border)'}`, background: selected ? 'var(--teal)14' : 'var(--surface)',
      color: 'var(--text)', fontFamily: 'inherit', fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: '0.6rem',
    }}>
      <span style={{ flex: 1 }}>
        {children}
        {sub && <span style={{ display: 'block', fontWeight: 400, fontSize: '0.85rem', color: 'var(--text-dim)', marginTop: 2 }}>{sub}</span>}
      </span>
      {selected && <span style={{ color: TEAL, fontSize: '1.1rem' }}>✓</span>}
    </button>
  )
}

function Note({ tone = 'info', children }) {
  const warn = tone === 'warn'
  return (
    <div role={warn ? 'alert' : undefined} style={{
      borderRadius: 10, padding: '0.75rem 0.9rem', fontSize: '0.9rem', lineHeight: 1.4, marginBottom: '0.75rem',
      background: warn ? '#fef2f2' : 'var(--surface2)', color: warn ? '#991b1b' : 'var(--text)',
      border: `1px solid ${warn ? '#fca5a5' : 'var(--border)'}`,
    }}>{children}</div>
  )
}

// ── Movie search: our list first, then every film ────────────────────────────
function MoviePicker({ picked, onPick }) {
  const [query, setQuery]       = useState('')
  const [local, setLocal]       = useState([])
  const [online, setOnline]     = useState(null)   // null = not searched yet
  const [busy, setBusy]         = useState(false)
  const [err, setErr]           = useState(null)
  const seq = useRef(0)

  // Suggestions list and DVDs we own, live as you type (2+ letters).
  useEffect(() => {
    const q = query.trim()
    setOnline(null); setErr(null)
    if (q.length < 2) { setLocal([]); return }
    const mine = ++seq.current
    const t = setTimeout(async () => {
      const { data } = await supabase.from('movies')
        .select('id, title, year, poster_url, we_own, is_viewing_suggestion')
        .ilike('title', `%${q}%`)
        .or('we_own.eq.true,is_viewing_suggestion.eq.true')
        .order('title').limit(8)
      if (mine === seq.current) setLocal(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  async function searchOnline() {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query.trim())}`)
      setOnline((await res.json()) || [])
    } catch { setOnline([]); setErr("Couldn't search right now. Try again.") }
    setBusy(false)
  }

  // A film from the wider search joins the Suggestions list (agreed scope),
  // so it can be rated afterwards like any other suggestion.
  async function pickOnline(tmdbId) {
    setBusy(true); setErr(null)
    try {
      const det = await fetch(`/api/tmdb/details?id=${tmdbId}`).then(r => r.json())
      if (det.error) throw new Error('details')
      const res = await authedFetch('/api/movies/add', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(det),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.id) { onPick(data); setBusy(false); return }
      // Already suggested, or a DVD we own -- use the existing record.
      const { data: existing } = await supabase.from('movies')
        .select('id, title, year, poster_url, we_own, is_viewing_suggestion')
        .eq('tmdb_id', String(tmdbId)).order('we_own', { ascending: false }).limit(1)
      if (existing?.[0]) onPick(existing[0])
      else setErr(data?.error || "Couldn't add that film. Try another.")
    } catch {
      setErr("Couldn't load that film. Try again.")
    }
    setBusy(false)
  }

  if (picked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--surface2)', borderRadius: 12, padding: '0.75rem' }}>
        {picked.poster_url && <img src={picked.poster_url} alt="" style={{ width: 40, height: 60, objectFit: 'cover', borderRadius: 4 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{picked.title}</div>
          {picked.year && <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{picked.year}</div>}
        </div>
        <button type="button" onClick={() => onPick(null)} style={{ background: 'none', border: 'none', color: TEAL, fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit' }}>Change</button>
      </div>
    )
  }

  const row = (m, onClick, tag) => (
    <button key={(m.id || m.tmdb_id) + (tag || '')} type="button" onClick={onClick} disabled={busy} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.6rem 0.75rem',
      border: 'none', borderBottom: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
      textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
    }}>
      {m.poster_url ? <img src={m.poster_url} alt="" style={{ width: 30, height: 45, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
        : <span style={{ width: 30, textAlign: 'center', flexShrink: 0 }}>🎬</span>}
      <span style={{ flex: 1, minWidth: 0, fontSize: '0.95rem' }}>{m.title}{m.year ? <span style={{ color: 'var(--text-dim)' }}> ({m.year})</span> : null}</span>
      {tag && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', flexShrink: 0 }}>{tag}</span>}
    </button>
  )

  return (
    <div>
      <label style={LABEL} htmlFor="stw-movie">Movie name</label>
      <input id="stw-movie" value={query} onChange={e => setQuery(e.target.value)} placeholder="Start typing the title…" autoComplete="off" style={INPUT} />
      {query.trim().length >= 2 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginTop: '0.5rem' }}>
          {local.map(m => row(m, () => onPick(m), m.we_own ? 'Our DVD' : 'Suggested'))}
          {online === null ? (
            <button type="button" onClick={searchOnline} disabled={busy} style={{
              width: '100%', padding: '0.75rem', border: 'none', background: 'var(--surface2)', color: TEAL,
              fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer', fontFamily: 'inherit',
            }}>{busy ? 'Searching…' : local.length ? 'Not here? Search all films' : 'Search all films'}</button>
          ) : online.length === 0 ? (
            <div style={{ padding: '0.75rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>No films found. Check the spelling, or choose &ldquo;Something else&rdquo;.</div>
          ) : online.map(m => row(m, () => pickOnline(m.tmdb_id)))}
        </div>
      )}
      {busy && online !== null && <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>Adding the film…</div>}
      {err && <div style={{ color: 'var(--danger)', fontSize: '0.88rem', marginTop: '0.4rem' }}>{err}</div>}
    </div>
  )
}

// ── The wizard ──────────────────────────────────────────────────────────────
export default function ShowTimeWizard({ info, onClose, onCreated }) {
  const capacity = info?.capacity || 20
  const venue    = info?.venueName || 'Cinema'
  // A Private resident sees an extra first step (agreed scope).
  const steps = [...(info?.isPrivate ? ['privacy'] : []), 'ingenia', 'what', 'when', 'seats', 'notify']
  const [stepIdx, setStepIdx]     = useState(0)
  const [open, setOpen]           = useState(false)
  const [privacyAck, setPrivacyAck] = useState(false)
  const [ingenia, setIngenia]     = useState(null)     // true | false | null
  const [mode, setMode]           = useState(null)     // 'movie' | 'other'
  const [movie, setMovie]         = useState(null)
  const [freeText, setFreeText]   = useState('')
  const [date, setDate]           = useState('')
  const [time, setTime]           = useState('')
  const [endTime, setEndTime]     = useState('')
  const [kept, setKept]           = useState(1)
  const [notifyChoice, setNotify] = useState(null)
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState(null)

  useEffect(() => { requestAnimationFrame(() => setOpen(true)) }, [])
  function close() { setOpen(false); setTimeout(onClose, 280) }

  const step = steps[stepIdx]
  const today = sydneyTodayStr()
  const canNext = {
    privacy: privacyAck,
    ingenia: ingenia === true,
    what: mode === 'movie' ? !!movie : mode === 'other' ? !!freeText.trim() : false,
    when: !!date && date >= today && !!time && !!endTime && endTime > time,
    seats: Number.isInteger(kept) && kept >= 0 && kept <= capacity,
    notify: !!notifyChoice,
  }[step]

  function next() { setErr(null); if (canNext && stepIdx < steps.length - 1) setStepIdx(i => i + 1) }
  function back() { setErr(null); if (stepIdx > 0) setStepIdx(i => i - 1) }

  async function create() {
    setSaving(true); setErr(null)
    try {
      const res = await authedFetch('/api/screenings/resident', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privacy_ack: privacyAck, ingenia_confirmed: ingenia === true,
          movie_id: mode === 'movie' ? movie?.id : null,
          showing_title: mode === 'other' ? freeText.trim() : null,
          event_date: date, event_time: time, event_end_time: endTime,
          seats_kept: kept, notify: notifyChoice,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(data.error || "Couldn't add the showing. Please try again."); setSaving(false); return }
      onCreated?.(data, { mode })
      close()
    } catch {
      setErr('Could not reach the server. Please try again.')
    }
    setSaving(false)
  }

  const btn = (primary, disabled) => ({
    flex: 1, padding: '0.9rem', borderRadius: 12, fontSize: '1rem', fontWeight: 700, fontFamily: 'inherit',
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: primary ? 'none' : '1px solid var(--border)',
    background: primary ? (disabled ? 'var(--border)' : TEAL) : 'var(--surface)',
    color: primary ? (disabled ? 'var(--text-dim)' : '#fff') : 'var(--text)',
  })
  const isLast = stepIdx === steps.length - 1

  return (
    <>
      <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, opacity: open ? 1 : 0, transition: 'opacity 0.25s' }} />
      <div role="dialog" aria-modal="true" aria-label="Add a showing" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px, 100%)', background: 'var(--surface)', zIndex: 201,
        overflowY: 'auto', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ height: 4, background: TEAL }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Add a showing</h2>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>Step {stepIdx + 1} of {steps.length}</div>
          </div>
          <button onClick={close} aria-label="Close" style={{ background: 'var(--surface2)', border: 'none', borderRadius: '50%', width: 36, height: 36, fontSize: 20, cursor: 'pointer', color: 'var(--text)' }}>✕</button>
        </div>

        <div style={{ padding: '1.25rem', flex: 1 }}>
          {step === 'privacy' && (
            <>
              <p style={QUESTION}>Your name will be shown</p>
              <Note>Your profile is set to Private. When you add a showing, your name is shown to everyone as the person who added it and as its coordinator. That&apos;s so people know who to ask about it.</Note>
              <Choice selected={privacyAck} onClick={() => setPrivacyAck(true)}>That&apos;s fine, show my name</Choice>
              <Choice selected={false} onClick={close}>Cancel, don&apos;t add a showing</Choice>
            </>
          )}

          {step === 'ingenia' && (
            <>
              <p style={QUESTION}>Have you booked the {venue} in the Ingenia app?</p>
              <Choice selected={ingenia === true} onClick={() => setIngenia(true)}>Yes</Choice>
              <Choice selected={ingenia === false} onClick={() => setIngenia(false)}>No</Choice>
              {ingenia === false && (
                <Note tone="warn">The {venue} can&apos;t be used without a valid booking in the Ingenia app. Book it there first, then come back and choose Yes.</Note>
              )}
            </>
          )}

          {step === 'what' && (
            <>
              <p style={QUESTION}>What are you showing?</p>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                {[['movie', 'A movie'], ['other', 'Something else']].map(([v, txt]) => (
                  <button key={v} type="button" onClick={() => setMode(v)} aria-pressed={mode === v} style={{
                    flex: 1, padding: '0.75rem', borderRadius: 12, fontFamily: 'inherit', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer',
                    border: `2px solid ${mode === v ? TEAL : 'var(--border)'}`, background: mode === v ? 'var(--teal)14' : 'var(--surface)',
                    color: mode === v ? TEAL : 'var(--text)',
                  }}>{txt}</button>
                ))}
              </div>
              {mode === 'movie' && <MoviePicker picked={movie} onPick={setMovie} />}
              {mode === 'other' && (
                <>
                  <label style={LABEL} htmlFor="stw-other">What&apos;s showing</label>
                  <input id="stw-other" value={freeText} onChange={e => setFreeText(e.target.value)} maxLength={SHOWING_TITLE_MAX}
                    placeholder="e.g. AFL Grand Final" style={INPUT} />
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
                    Want a picture? Once it&apos;s saved, tap Edit on the showing to add one.
                  </div>
                </>
              )}
            </>
          )}

          {step === 'when' && (
            <>
              <p style={QUESTION}>When are you showing it?</p>
              <div style={{ marginBottom: '1rem' }}>
                <label style={LABEL} htmlFor="stw-date">Date</label>
                <input id="stw-date" type="date" value={date} min={today} onChange={e => setDate(e.target.value)} style={INPUT} />
                {date && <div style={{ fontSize: '0.85rem', color: TEAL, fontWeight: 600, marginTop: '0.3rem' }}>
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>}
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={LABEL}>Start time</label>
                <TimeField value={time} onChange={setTime} colour={time ? 'var(--green)' : 'var(--border)'} />
              </div>
              <div>
                <label style={LABEL}>Expected end time</label>
                <TimeField value={endTime} onChange={setEndTime} colour={endTime ? 'var(--green)' : 'var(--border)'} minTime={time || null} />
                <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: '0.35rem' }}>
                  This holds the {venue} so nobody else books it at the same time.
                </div>
              </div>
            </>
          )}

          {step === 'seats' && (
            <>
              <p style={QUESTION}>How many seats are you keeping for yourself?</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', margin: '0.5rem 0 1rem' }}>
                <button type="button" aria-label="One fewer seat" onClick={() => setKept(k => Math.max(0, k - 1))} disabled={kept <= 0}
                  style={{ width: 52, height: 52, borderRadius: '50%', border: `2px solid ${TEAL}`, background: 'var(--surface)', color: TEAL, fontSize: '1.6rem', fontWeight: 700, cursor: 'pointer', opacity: kept <= 0 ? 0.4 : 1 }}>−</button>
                <div aria-live="polite" style={{ fontSize: '2.2rem', fontWeight: 800, minWidth: 48, textAlign: 'center' }}>{kept}</div>
                <button type="button" aria-label="One more seat" onClick={() => setKept(k => Math.min(capacity, k + 1))} disabled={kept >= capacity}
                  style={{ width: 52, height: 52, borderRadius: '50%', border: `2px solid ${TEAL}`, background: 'var(--surface)', color: TEAL, fontSize: '1.6rem', fontWeight: 700, cursor: 'pointer', opacity: kept >= capacity ? 0.4 : 1 }}>+</button>
              </div>
              <Note>
                <strong>{capacity - kept}</strong> of {capacity} seats will be open for others to book, up to 4 seats per booking.
                {kept > 0 ? <>Your {kept === 1 ? 'seat is' : 'seats are'} booked in your name. </> : null}You&apos;re set as the coordinator, so you can edit or cancel the showing later.
              </Note>
            </>
          )}

          {step === 'notify' && (
            <>
              <p style={QUESTION}>Who do you want to tell?</p>
              <Choice selected={notifyChoice === 'all'} onClick={() => setNotify('all')} sub="Everyone who uses the app">All residents</Choice>
              <Choice selected={notifyChoice === 'members'} onClick={() => setNotify('members')} sub="Residents who have joined Show Time">Show Time members only</Choice>
              <Choice selected={notifyChoice === 'none'} onClick={() => setNotify('none')} sub="It still appears in Show Time for anyone to find">Nobody</Choice>
            </>
          )}

          {err && <Note tone="warn">{err}</Note>}
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', padding: '1rem 1.25rem 1.5rem', borderTop: '1px solid var(--border)', position: 'sticky', bottom: 0, background: 'var(--surface)' }}>
          {stepIdx > 0 && <button type="button" onClick={back} disabled={saving} style={btn(false, saving)}>Back</button>}
          {isLast ? (
            <button type="button" onClick={create} disabled={!canNext || saving} style={btn(true, !canNext || saving)}>
              {saving ? 'Adding…' : 'Add showing'}
            </button>
          ) : (
            <button type="button" onClick={next} disabled={!canNext} style={btn(true, !canNext)}>Next</button>
          )}
        </div>
      </div>
    </>
  )
}
