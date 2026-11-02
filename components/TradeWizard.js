'use client'
// Recommend a Trade -- one question at a time, same pattern as Show Time's
// "Add a showing" (Iain, 2026-11-03, Element_Happenings_Recommend_a_Trade_
// Scope_Answered). Also used to edit a trade's details (original
// recommender or admin). Rules: lib/trades.js; server: app/api/trades.
import { useEffect, useState } from 'react'
import { authedFetch } from '@/lib/getAuthToken'
import { formatPhoneInput } from '@/lib/phone'
import { COLOUR } from '@/components/ResidentEditPanel'
import { TRADE_NOTE_MAX, TRADE_NAME_MAX, TRADE_TYPE_MAX, isValidTradePhone, isValidEmail } from '@/lib/trades'

const INPUT = { width: '100%', padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: 10, fontSize: '1rem', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box', fontFamily: 'inherit', appearance: 'none', WebkitAppearance: 'none' }
const LABEL = { display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '0.4rem' }
const QUESTION = { fontSize: '1.15rem', fontWeight: 800, margin: '0 0 0.75rem', lineHeight: 1.3 }

function Choice({ selected, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} style={{
      width: '100%', textAlign: 'left', padding: '0.8rem 1rem', borderRadius: 12, marginBottom: '0.5rem',
      border: `2px solid ${selected ? COLOUR : 'var(--border)'}`, background: 'var(--surface)',
      color: 'var(--text)', fontFamily: 'inherit', fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: '0.6rem',
    }}>
      <span style={{ flex: 1 }}>{children}</span>
      {selected && <span style={{ color: COLOUR, fontSize: '1.1rem' }}>✓</span>}
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

const OTHER = '__other__'

// editing: { id, trade_type, name, business_name, phone, email, note, hasMine }
export default function TradeWizard({ types = [], editing = null, onClose, onSaved }) {
  const listed = types.filter(t => t.active).map(t => t.name)
  const startType = editing?.trade_type || ''
  const startIsListed = !startType || listed.some(n => n.toLowerCase() === startType.toLowerCase())
  const [typePick, setTypePick] = useState(editing ? (startIsListed ? startType : OTHER) : null)
  const [otherType, setOtherType] = useState(startIsListed ? '' : startType)
  const [name, setName] = useState(editing?.name && editing.name !== editing.business_name ? editing.name : '')
  const [business, setBusiness] = useState(editing?.business_name || '')
  const [phone, setPhone] = useState(editing?.phone ? formatPhoneInput(editing.phone) : '')
  const [email, setEmail] = useState(editing?.email || '')
  const [note, setNote] = useState(editing?.note || '')
  const [dup, setDup] = useState(null)
  const [stepIdx, setStepIdx] = useState(0)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(null)

  const tradeType = typePick === OTHER ? otherType.trim() : (typePick || '')
  const showNote = !editing || editing.hasMine
  const steps = ['what', 'who', 'contact', ...(dup ? ['dup'] : []), ...(showNote ? ['note'] : ['save'])]
  const step = steps[stepIdx]

  useEffect(() => { requestAnimationFrame(() => setOpen(true)) }, [])
  function close() { setOpen(false); setTimeout(onClose, 280) }

  const canNext = {
    what: !!tradeType,
    who: !!(name.trim() || business.trim()),
    contact: isValidTradePhone(phone) && isValidEmail(email),
    dup: false,
    note: true,
    save: true,
  }[step]

  async function next() {
    setErr(null)
    if (!canNext) return
    if (step === 'contact' && !editing) {
      setBusy(true)
      try {
        const res = await authedFetch('/api/trades', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check', trade_type: tradeType, name, business_name: business, phone }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) { setErr(d.error || "Couldn't check the list. Please try again."); setBusy(false); return }
        setDup(d.duplicate || null)
      } catch { setErr('Could not reach the server. Please try again.'); setBusy(false); return }
      setBusy(false)
    }
    setStepIdx(i => i + 1)
  }
  function back() { setErr(null); if (step === 'dup') setDup(null); if (stepIdx > 0) setStepIdx(i => i - 1) }

  async function post(body) {
    setBusy(true); setErr(null)
    try {
      const res = await authedFetch('/api/trades', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => ({}))
      setBusy(false)
      if (!res.ok) { setErr(d.error || 'Something went wrong. Please try again.'); return null }
      return d
    } catch {
      setBusy(false); setErr('Could not reach the server. Please try again.'); return null
    }
  }

  async function save() {
    const fields = { trade_type: tradeType, name, business_name: business, phone, email, ...(showNote ? { note } : {}) }
    const d = editing
      ? await post({ action: 'edit', contact_id: editing.id, ...fields })
      : await post({ action: 'add', ...fields })
    if (!d) return
    onSaved?.()
    if (editing) { close(); return }
    setDone('added')
  }

  async function recommendInstead() {
    const d = await post({ action: 'recommend', contact_id: dup.id, note })
    if (!d) return
    onSaved?.()
    setDone('recommended')
  }

  const btn = (primary, disabled) => ({
    flex: 1, padding: '0.9rem', borderRadius: 12, fontSize: '1rem', fontWeight: 700, fontFamily: 'inherit',
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: primary ? 'none' : '1px solid var(--border)',
    background: primary ? (disabled ? 'var(--border)' : COLOUR) : 'var(--surface)',
    color: primary ? (disabled ? 'var(--text-dim)' : '#fff') : 'var(--text)',
  })
  const isLast = stepIdx === steps.length - 1
  const shownName = name.trim() || business.trim()
  const title = editing ? 'Edit trade details' : 'Recommend a trade'

  return (
    <>
      <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, opacity: open ? 1 : 0, transition: 'opacity 0.25s' }} />
      <div role="dialog" aria-modal="true" aria-label={title} style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px, 100%)', background: 'var(--surface)', zIndex: 201,
        overflowY: 'auto', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ height: 4, background: COLOUR }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>{title}</h2>
            {!done && <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>Step {stepIdx + 1} of {steps.length}</div>}
          </div>
          <button onClick={close} aria-label="Close" style={{ background: 'var(--surface2)', border: 'none', borderRadius: '50%', width: 36, height: 36, fontSize: 20, cursor: 'pointer', color: 'var(--text)' }}>✕</button>
        </div>

        <div style={{ padding: '1.25rem', flex: 1 }}>
          {done ? (
            <>
              <p style={QUESTION}>{done === 'added' ? 'Thanks — added to Trades' : 'Thanks — your recommendation is in'}</p>
              <Note>
                {done === 'added'
                  ? <><strong>{shownName}</strong> is now on Info › Contacts › Trades, with you as the person who recommended them.</>
                  : <>You&apos;re now listed as recommending <strong>{dup?.name}</strong>.</>}
              </Note>
            </>
          ) : (
            <>
              {step === 'what' && (
                <>
                  <p style={QUESTION}>What kind of trade are they?</p>
                  {listed.map(n => (
                    <Choice key={n} selected={typePick === n} onClick={() => setTypePick(n)}>{n}</Choice>
                  ))}
                  <Choice selected={typePick === OTHER} onClick={() => setTypePick(OTHER)}>Something else</Choice>
                  {typePick === OTHER && (
                    <div style={{ marginTop: '0.25rem' }}>
                      <label style={LABEL} htmlFor="tw-other">What do they do?</label>
                      <input id="tw-other" value={otherType} onChange={e => setOtherType(e.target.value)} maxLength={TRADE_TYPE_MAX}
                        placeholder="e.g. Pool maintenance" style={INPUT} />
                    </div>
                  )}
                </>
              )}

              {step === 'who' && (
                <>
                  <p style={QUESTION}>Who are they?</p>
                  <Note>Fill in either one, or both.</Note>
                  <label style={LABEL} htmlFor="tw-name">Their name</label>
                  <input id="tw-name" value={name} onChange={e => setName(e.target.value)} maxLength={TRADE_NAME_MAX}
                    placeholder="e.g. Jake Pace" style={{ ...INPUT, marginBottom: '0.9rem' }} />
                  <label style={LABEL} htmlFor="tw-biz">Business name</label>
                  <input id="tw-biz" value={business} onChange={e => setBusiness(e.target.value)} maxLength={TRADE_NAME_MAX}
                    placeholder="e.g. PP Plumbing" style={INPUT} />
                </>
              )}

              {step === 'contact' && (
                <>
                  <p style={QUESTION}>How do we reach them?</p>
                  <label style={LABEL} htmlFor="tw-phone">Phone number</label>
                  <input id="tw-phone" type="tel" inputMode="numeric" value={phone}
                    onChange={e => setPhone(formatPhoneInput(e.target.value))}
                    placeholder="0400 000 000" style={{ ...INPUT, marginBottom: '0.35rem' }} />
                  {phone && !isValidTradePhone(phone) && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--danger)', marginBottom: '0.6rem' }}>Enter all 10 digits</div>
                  )}
                  <label style={{ ...LABEL, marginTop: '0.6rem' }} htmlFor="tw-email">Email (optional)</label>
                  <input id="tw-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="name@example.com" style={INPUT} />
                  {email && !isValidEmail(email) && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--danger)', marginTop: '0.35rem' }}>That email doesn&apos;t look right</div>
                  )}
                </>
              )}

              {step === 'dup' && dup && (
                <>
                  <p style={QUESTION}>We already have them</p>
                  <Note><strong>{dup.name}</strong>{dup.trade_type ? ` (${dup.trade_type})` : ''} is already on the Trades list.</Note>
                  <label style={LABEL} htmlFor="tw-dupnote">What did they do well? (optional)</label>
                  <textarea id="tw-dupnote" value={note} onChange={e => setNote(e.target.value.slice(0, TRADE_NOTE_MAX))} rows={3}
                    placeholder="e.g. Fixed our hot water, fair price, on time" style={{ ...INPUT, resize: 'vertical' }} />
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: '0.3rem 0 0.9rem', textAlign: 'right' }}>{note.length}/{TRADE_NOTE_MAX}</div>
                  <button type="button" onClick={recommendInstead} disabled={busy} style={{ ...btn(true, busy), width: '100%' }}>
                    {busy ? 'Saving…' : `Recommend ${dup.name} instead`}
                  </button>
                </>
              )}

              {(step === 'note' || step === 'save') && (
                <>
                  <p style={QUESTION}>{editing ? 'Check and save' : 'Your recommendation'}</p>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '0.8rem 1rem', marginBottom: '0.9rem', fontSize: '0.95rem', lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 700 }}>{shownName}</div>
                    <div style={{ color: 'var(--role-accent)', fontWeight: 600 }}>{[tradeType, business.trim() && business.trim() !== shownName ? business.trim() : null].filter(Boolean).join(' · ')}</div>
                    <div>{phone}</div>
                    {email.trim() && <div>{email.trim()}</div>}
                  </div>
                  {step === 'note' && (
                    <>
                      <label style={LABEL} htmlFor="tw-note">What did they do well? (optional)</label>
                      <textarea id="tw-note" value={note} onChange={e => setNote(e.target.value.slice(0, TRADE_NOTE_MAX))} rows={3}
                        placeholder="e.g. Fixed our hot water, fair price, on time" style={{ ...INPUT, resize: 'vertical' }} />
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '0.3rem', textAlign: 'right' }}>{note.length}/{TRADE_NOTE_MAX}</div>
                      {!editing && <Note>Your name is shown as the person who recommended them. Other residents can add themselves too.</Note>}
                    </>
                  )}
                </>
              )}

              {err && <Note tone="warn">{err}</Note>}
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', padding: '1rem 1.25rem 1.5rem', borderTop: '1px solid var(--border)', position: 'sticky', bottom: 0, background: 'var(--surface)' }}>
          {done ? (
            <button type="button" onClick={close} style={btn(true, false)}>Done</button>
          ) : (
            <>
              {stepIdx > 0 && <button type="button" onClick={back} disabled={busy} style={btn(false, busy)}>Back</button>}
              {step === 'dup' ? null : isLast ? (
                <button type="button" onClick={save} disabled={busy} style={btn(true, busy)}>
                  {busy ? 'Saving…' : editing ? 'Save changes' : 'Add to Trades'}
                </button>
              ) : (
                <button type="button" onClick={next} disabled={!canNext || busy} style={btn(true, !canNext || busy)}>
                  {busy ? 'Checking…' : 'Next'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
