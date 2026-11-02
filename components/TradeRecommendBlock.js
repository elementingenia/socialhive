'use client'
// "Recommended by" on a trade's Contacts card, plus "I recommend them too"
// (Recommend a Trade, Iain 2026-11-03). Data comes from GET /api/trades.
// Private residents get a notice instead (Iain: Private residents don't
// get a voice here); the server refuses them too.
import { useState } from 'react'
import { authedFetch } from '@/lib/getAuthToken'
import { COLOUR } from '@/components/ResidentEditPanel'
import { recommendedByLine, TRADE_NOTE_MAX, PRIVATE_NOTICE } from '@/lib/trades'

const small = {
  fontSize: '0.78rem', fontWeight: 700, padding: '0.3rem 0.7rem', borderRadius: 16, fontFamily: 'inherit', cursor: 'pointer',
}

export default function TradeRecommendBlock({ contactId, trade, isPrivate, onChanged, onEdit }) {
  const [showNotes, setShowNotes] = useState(false)
  const [composing, setComposing] = useState(false)
  const [privateNotice, setPrivateNotice] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  if (!trade || !trade.recommendations) return null

  const recs = trade.recommendations
  const notes = recs.filter(r => r.note)
  const line = recommendedByLine(recs.map(r => r.name))

  async function post(body) {
    setBusy(true); setErr(null)
    try {
      const res = await authedFetch('/api/trades', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, ...body }),
      })
      const d = await res.json().catch(() => ({}))
      setBusy(false)
      if (!res.ok) { setErr(d.error || 'Something went wrong. Please try again.'); return false }
      onChanged?.()
      return true
    } catch {
      setBusy(false); setErr('Could not reach the server. Please try again.'); return false
    }
  }

  function startRecommend() {
    if (isPrivate) { setPrivateNotice(true); return }
    setComposing(true)
  }

  return (
    <div style={{ marginTop: '0.4rem', fontSize: '0.82rem' }}>
      {line && (
        notes.length ? (
          <button type="button" onClick={() => setShowNotes(v => !v)} aria-expanded={showNotes} style={{
            background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: '0.82rem',
            color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
          }}>
            <span aria-hidden>👍 </span>{line} <span style={{ color: COLOUR, fontWeight: 700 }}>{showNotes ? 'Hide comments ▲' : `Comments (${notes.length}) ▼`}</span>
          </button>
        ) : (
          <div style={{ color: 'var(--text)' }}><span aria-hidden>👍 </span>{line}</div>
        )
      )}

      {showNotes && notes.length > 0 && (
        <div style={{ margin: '0.35rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {notes.map(r => (
            <div key={r.member_id} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '0.4rem 0.6rem', lineHeight: 1.35 }}>
              &ldquo;{r.note}&rdquo; <span style={{ color: 'var(--text-dim)' }}>— {r.name}</span>
            </div>
          ))}
        </div>
      )}

      {composing ? (
        <div style={{ marginTop: '0.5rem' }}>
          <label htmlFor={`tr-note-${contactId}`} style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '0.3rem' }}>
            What did they do well? (optional)
          </label>
          <textarea id={`tr-note-${contactId}`} value={note} onChange={e => setNote(e.target.value.slice(0, TRADE_NOTE_MAX))} rows={2}
            placeholder="e.g. Fixed our hot water, fair price, on time"
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.7rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', fontSize: '0.9rem', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', alignItems: 'center' }}>
            <button type="button" disabled={busy} onClick={async () => { if (await post({ action: 'recommend', note })) { setComposing(false); setNote('') } }}
              style={{ ...small, border: 'none', background: COLOUR, color: '#fff', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Saving…' : 'Recommend'}
            </button>
            <button type="button" onClick={() => { setComposing(false); setNote('') }}
              style={{ ...small, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>Cancel</button>
            <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: '0.75rem' }}>{note.length}/{TRADE_NOTE_MAX}</span>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.45rem', alignItems: 'center' }}>
          {!trade.mine && (
            <button type="button" onClick={startRecommend}
              style={{ ...small, border: `1.5px solid ${COLOUR}`, background: 'var(--surface)', color: COLOUR }}>
              👍 I recommend them too
            </button>
          )}
          {trade.mine && (
            <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>
              ✓ {trade.mine.is_original ? 'You added this trade' : 'You recommend them'}
            </span>
          )}
          {trade.canWithdraw && (
            <button type="button" disabled={busy} onClick={() => post({ action: 'withdraw' })}
              style={{ ...small, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
              Remove my recommendation
            </button>
          )}
          {trade.canEdit && onEdit && (
            <button type="button" onClick={onEdit}
              style={{ ...small, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
              Edit details
            </button>
          )}
        </div>
      )}

      {privateNotice && (
        <div role="alert" style={{ marginTop: '0.45rem', borderRadius: 8, padding: '0.55rem 0.7rem', background: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5', lineHeight: 1.35 }}>
          {PRIVATE_NOTICE}
          <button type="button" onClick={() => setPrivateNotice(false)} style={{ display: 'block', marginTop: '0.35rem', ...small, border: '1px solid #fca5a5', background: '#fff', color: '#991b1b' }}>OK</button>
        </div>
      )}
      {err && <div role="alert" style={{ color: 'var(--danger)', marginTop: '0.35rem' }}>{err}</div>}
    </div>
  )
}
