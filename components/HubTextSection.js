"use client"
import { useState, useEffect, useRef } from 'react'
import RichEditor from '@/components/RichEditor'
import { getAuthToken } from '@/lib/getAuthToken'
import { HUB_SECTIONS } from '@/lib/hubSections'

// Self-contained Page Texts editor for ONE hub_settings row. Extracted from
// Admin's PageTextsTab 2026-08-12 (Owner self-service scope, Part A.3) so an
// Owner's "Manage this area" screen can render just their own section
// without pulling in Admin's page or its blanket is_admin gate. Each
// instance fetches/saves independently — a few extra GET /api/hub-settings
// calls on Admin's Page Texts tab (one per section instead of one shared
// fetch) in exchange for a component that works standing alone. The write
// goes through PATCH /api/hub-settings, which is itself Owner-scoped per
// hub_type (see app/api/hub-settings/route.js's HUB_TYPE_TO_OWNER_KEY).
function SubRow({ item, hubColour, onChange, onDelete }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        <RichEditor
          key={item.id}
          initialValue={item.text}
          hubColour={hubColour}
          subOnly
          bg="tile"
          onChange={html => onChange(item.id, html)}
        />
      </div>
      <button onClick={() => onDelete(item.id)}
        style={{ marginTop: 4, background: 'none', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
          color: 'var(--danger)', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>
        ×
      </button>
    </div>
  )
}

export default function HubTextSection({ sectionKey }) {
  const sec = HUB_SECTIONS.find(s => s.key === sectionKey)
  const [data,    setData]    = useState(null)
  const [draft,   setDraft]   = useState({})
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [loading, setLoading] = useState(true)
  const subCounter = useRef(0)
  function newSubId() { subCounter.current += 1; return 'sub_' + subCounter.current }

  useEffect(() => {
    let cancelled = false
    fetch('/api/hub-settings')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        const row = d[sectionKey] || {}
        setData(row)
        const init = {
          text: row.text || '',
          subs: (row.subs || []).map(text => ({ id: newSubId(), text })),
        }
        if (sec?.hasLoanCap) init.loanCap = row.loanCap ?? 3
        setDraft(init)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [sectionKey, sec?.hasLoanCap])

  if (!sec) return null
  if (loading || !draft) return <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '2rem' }}>Loading…</div>

  function setDraftField(field, val) { setDraft(d => ({ ...d, [field]: val })) }

  async function save() {
    setSaving(true)
    const body = { hub_type: sectionKey, welcome_text: draft.text || '' }
    if (sec.hasSubs) {
      body.sub_messages = (draft.subs || []).map(s => s.text).filter(t => t && t !== '<br>' && t !== '<div><br></div>')
    }
    if (sec.hasLoanCap) {
      body.loan_cap = Number(draft.loanCap) || 3
    }
    await fetch('/api/hub-settings', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (await getAuthToken()),
      },
      body: JSON.stringify(body),
    })
    setData({
      text: body.welcome_text,
      subs: body.sub_messages || data?.subs || [],
      loanCap: body.loan_cap !== undefined ? body.loan_cap : data?.loanCap,
    })
    setSaved(true); setSaving(false)
    setTimeout(() => setSaved(false), 2500)
  }

  const subs = draft.subs || []

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 14,
      border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ background: sec.colour + '18', borderBottom: '1px solid var(--border)',
        padding: '0.65rem 1rem', fontWeight: 700, fontSize: '0.85rem', color: sec.colour }}>
        {sec.label}
      </div>
      <div style={{ padding: '0.9rem 1rem' }}>
        {sec.hint && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 8, lineHeight: 1.4 }}>
            {sec.hint}
          </div>
        )}

        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)',
          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
          {sec.hasSubs ? 'Main Message' : 'Message'}
        </div>
        <div style={{ marginBottom: sec.hasSubs ? 16 : 0 }}>
          <RichEditor
            key={sectionKey}
            initialValue={draft.text || ''}
            hubColour={sec.hex}
            subOnly={false}
            bg="tile"
            onChange={html => setDraftField('text', html)}
          />
        </div>

        {sec.hasSubs && (
          <>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)',
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Sub Notices
            </div>
            {subs.map(item => (
              <SubRow
                key={item.id}
                item={item}
                hubColour={sec.hex}
                onChange={(id, html) => {
                  const next = subs.map(s => s.id === id ? { ...s, text: html } : s)
                  setDraftField('subs', next)
                }}
                onDelete={id => {
                  const next = subs.filter(s => s.id !== id)
                  setDraftField('subs', next)
                }}
              />
            ))}
            <button
              onClick={() => setDraftField('subs', [...subs, { id: newSubId(), text: '' }])}
              style={{ background: 'none', border: '1.5px dashed var(--border)',
                borderRadius: 10, padding: '0.5rem', width: '100%', cursor: 'pointer',
                color: 'var(--text-dim)', fontSize: '0.82rem', fontWeight: 600,
                fontFamily: 'inherit', marginBottom: 8 }}>
              + Add Sub Notice
            </button>
          </>
        )}

        {sec.hasLoanCap && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, marginBottom: 4 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)',
              textTransform: 'uppercase', letterSpacing: '0.05em' }}>Loan cap</label>
            <input type="number" min={1} max={20}
              value={draft.loanCap ?? 3}
              onChange={e => setDraftField('loanCap', e.target.value)}
              style={{ width: 64, padding: '0.4rem 0.5rem', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text)', fontSize: '0.85rem', fontFamily: 'inherit' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>items per resident at once</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
          gap: 10, marginTop: sec.hasSubs ? 0 : 8 }}>
          {saved && (
            <span style={{ color: 'var(--green)', fontSize: '0.82rem', fontWeight: 700 }}>✓ Saved</span>
          )}
          <button
            onClick={save}
            disabled={saving}
            style={{ background: sec.colour, color: '#fff', border: 'none', borderRadius: 10,
              padding: '0.55rem 1.25rem', fontWeight: 700, fontSize: '0.85rem',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
