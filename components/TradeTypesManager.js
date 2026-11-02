'use client'
// Admin: the trade-type list residents pick from in Recommend a Trade
// (Q1: admin-editable, plus "Something else" free text). Renaming a type
// moves every trade of that type with it.
import { useState } from 'react'
import { authedFetch } from '@/lib/getAuthToken'
import { COLOUR } from '@/components/ResidentEditPanel'
import { TRADE_TYPE_MAX } from '@/lib/trades'

const input = { flex: 1, minWidth: 0, padding: '0.6rem 0.8rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.95rem', fontFamily: 'inherit', boxSizing: 'border-box' }
const pill = { fontSize: '0.75rem', fontWeight: 700, padding: '0.3rem 0.65rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }

export default function TradeTypesManager({ types = [], unlisted = [], onChanged }) {
  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function post(body) {
    setBusy(true); setErr(null)
    try {
      const res = await authedFetch('/api/trades', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({}))
      setBusy(false)
      if (!res.ok) { setErr(d.error || 'Something went wrong'); return false }
      onChanged?.()
      return true
    } catch { setBusy(false); setErr('Could not reach the server'); return false }
  }

  const sorted = [...types].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div>
      <div style={{ fontSize: '0.83rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
        The list residents choose from when they recommend a trade. They can also type &ldquo;Something else&rdquo;. Renaming a type moves every trade of that type with it.
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem' }}>
        <input value={newName} onChange={e => setNewName(e.target.value)} maxLength={TRADE_TYPE_MAX} placeholder="New trade type" style={input} />
        <button type="button" disabled={busy || !newName.trim()} onClick={async () => { if (await post({ action: 'type_add', name: newName })) setNewName('') }}
          style={{ ...pill, background: COLOUR, color: '#fff', border: 'none', opacity: busy || !newName.trim() ? 0.5 : 1 }}>Add</button>
      </div>

      {sorted.map(t => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0', borderBottom: '1px solid var(--border)' }}>
          {editId === t.id ? (
            <>
              <input value={editName} onChange={e => setEditName(e.target.value)} maxLength={TRADE_TYPE_MAX} style={input} />
              <button type="button" disabled={busy || !editName.trim()} onClick={async () => { if (await post({ action: 'type_rename', id: t.id, name: editName })) setEditId(null) }} style={pill}>Save</button>
              <button type="button" onClick={() => setEditId(null)} style={pill}>Cancel</button>
            </>
          ) : (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: '0.92rem', fontWeight: 600, color: t.active ? 'var(--text)' : 'var(--text-dim)' }}>
                {t.name}{!t.active && <span style={{ fontWeight: 400 }}> (hidden)</span>}
              </span>
              <button type="button" onClick={() => { setEditId(t.id); setEditName(t.name) }} style={pill}>Rename</button>
              <button type="button" disabled={busy} onClick={() => post({ action: 'type_active', id: t.id, active: !t.active })} style={pill}>
                {t.active ? 'Hide' : 'Show'}
              </button>
            </>
          )}
        </div>
      ))}

      {unlisted.length > 0 && (
        <div style={{ marginTop: '1.25rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.4rem' }}>Typed in by residents</div>
          {unlisted.map(u => (
            <div key={u.name} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ flex: 1, fontSize: '0.9rem' }}>{u.name} <span style={{ color: 'var(--text-dim)' }}>· {u.count}</span></span>
              <button type="button" disabled={busy} onClick={() => post({ action: 'type_add', name: u.name })} style={pill}>Add to list</button>
            </div>
          ))}
        </div>
      )}
      {err && <div role="alert" style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '0.6rem' }}>{err}</div>}
    </div>
  )
}
