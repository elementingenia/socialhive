'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getAuthToken } from '@/lib/getAuthToken'
import RichEditor from '@/components/RichEditor'
import OwnersManager from '@/components/OwnersManager'
import ClubWatermarkPicker from '@/components/ClubWatermarkPicker'
import { CLUB_COLOURS, nextClubColour } from '@/lib/clubColours'

// Extracted from app/(app)/admin/page.js 2026-08-12 (Owner_SelfService_and_
// Library_Hub_Scope_v1 Part A.3) so the same editor renders both in Admin >
// Groups & Clubs and on the new Owner self-service "Manage this club" screen
// (app/(app)/clubs/[slug]/manage/page.js). Editing an EXISTING club now goes
// through /api/clubs/settings (admin-or-area-owner, service role) instead of
// a direct client write — that's what makes Owner access possible; a direct
// client write can only ever be as permissive as the clubs RLS policy, which
// stays admin-only. Creating a NEW club is unchanged (admin-only, direct
// client insert) — an Owner manages an existing area, not new ones.

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>{label}</label>
      {children}
    </div>
  )
}
const inputStyle = { width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.95rem', boxSizing: 'border-box' }

const CLUB_FLAGS = [
  { key: 'has_book_return', label: 'Book return dates' },
  { key: 'has_kit_return',  label: 'Kit return dates' },
  { key: 'has_theme',       label: 'Theme name on events' },
  { key: 'has_cost',        label: 'Paid events (cost)' },
  { key: 'bring_enabled',   label: 'Attendees bring something' },
  { key: 'single_signup',   label: 'Sign-up only (one seat per person)' },
  { key: 'one_event_at_a_time', label: 'One event at a time (block scheduling ahead)' },
]

function slugify(s) {
  return (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function FlagToggle({ on, label, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
      padding: '0.6rem 0.8rem', borderRadius: 10, border: '1px solid var(--border)',
      background: 'var(--surface)', cursor: 'pointer', fontFamily: 'inherit', marginBottom: '0.4rem',
    }}>
      <span style={{ fontSize: '0.9rem', color: 'var(--text)' }}>{label}</span>
      <span style={{ width: 34, height: 20, borderRadius: 10, background: on ? 'var(--green)' : 'var(--border)', position: 'relative', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
      </span>
    </button>
  )
}

export default function ClubForm({ club, existingColours = [], onSaved, onCancel, showOwners = true }) {
  const isEdit = !!club
  const [form, setForm] = useState({
    name: club?.name || '', slug: club?.slug || '', description: club?.description || '',
    welcome_text: club?.welcome_text || '',
    image_url: club?.image_url || null, image_pos_x: club?.image_pos_x ?? 50, image_pos_y: club?.image_pos_y ?? 50, image_zoom: club?.image_zoom ?? 1,
    colour: club?.colour || nextClubColour(existingColours), catalogue_module: club?.catalogue_module || 'none',
    has_book_return: club?.has_book_return || false, has_kit_return: club?.has_kit_return || false,
    has_theme: club?.has_theme || false, has_cost: club?.has_cost || false, bring_enabled: club?.bring_enabled || false,
    single_signup: club?.single_signup || false,
    one_event_at_a_time: club?.one_event_at_a_time || false,
  })
  const [slugTouched, setSlugTouched] = useState(isEdit)
  const [bringCats, setBringCats] = useState([])
  const [newCat, setNewCat] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!isEdit) return
    supabase.from('club_bring_categories').select('id, label, sort').eq('club_id', club.id).order('sort')
      .then(({ data }) => setBringCats((data || []).map(c => ({ id: c.id, label: c.label }))))
  }, [isEdit, club?.id])

  const effectiveSlug = slugTouched ? form.slug : slugify(form.name)

  async function save() {
    setError('')
    if (!form.name.trim()) { setError('Name is required'); return }
    const slug = slugify(effectiveSlug)
    if (!slug) { setError('Slug is required'); return }
    setSaving(true)
    const payload = {
      name: form.name.trim(), slug, description: form.description.trim() || null, colour: form.colour,
      welcome_text: form.welcome_text || null,
      catalogue_module: form.catalogue_module,
      has_book_return: form.has_book_return, has_kit_return: form.has_kit_return,
      has_theme: form.has_theme, has_cost: form.has_cost, bring_enabled: form.bring_enabled,
      single_signup: form.single_signup,
      one_event_at_a_time: form.one_event_at_a_time,
    }

    if (isEdit) {
      const res = await fetch('/api/clubs/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await getAuthToken()) },
        body: JSON.stringify({ club_id: club.id, ...payload, bring_categories: bringCats }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Save failed'); setSaving(false); return
      }
      setSaving(false)
      onSaved()
      return
    }

    // Create — unchanged, admin-only path (Admin's page-level gate already
    // keeps non-admins out before this component is ever reachable in create mode).
    const { data, error: e } = await supabase.from('clubs').insert(payload).select('id').single()
    if (e) { setError(e.message.includes('duplicate') ? 'That slug is already taken' : e.message); setSaving(false); return }
    const clubId = data.id

    if (form.bring_enabled) {
      const newRows = bringCats.filter(c => !c.id).map((c, i) => ({ club_id: clubId, label: c.label, sort: i }))
      if (newRows.length) await supabase.from('club_bring_categories').insert(newRows)
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <Field label="Group/Club name"><input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Dinner Club" /></Field>
      <Field label="Link (slug)">
        <input style={inputStyle} value={effectiveSlug} onChange={e => { setSlugTouched(true); set('slug', e.target.value) }} placeholder="dinner-club" />
      </Field>
      <Field label="Description"><input style={inputStyle} value={form.description} onChange={e => set('description', e.target.value)} placeholder="One-line description shown in the Groups & Clubs list" /></Field>
      <Field label="Landing page text">
        <RichEditor
          key={club?.id || 'new'}
          initialValue={form.welcome_text}
          hubColour={CLUB_COLOURS.find(c => c.value === form.colour)?.hex || (form.colour?.startsWith('#') ? form.colour : '#7c3aed')}
          bg="tile"
          onChange={html => set('welcome_text', html)}
          placeholder="Shown in the coloured banner at the top of this group/club's page…"
        />
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.35rem' }}>
          Appears on the club&apos;s page in the club colour with white text.
        </div>
      </Field>
      <Field label="Colour">
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {CLUB_COLOURS.map(c => (
            <button key={c.label} type="button" onClick={() => set('colour', c.value)} title={c.label} style={{
              width: 30, height: 30, borderRadius: '50%', background: c.hex, cursor: 'pointer',
              border: form.colour === c.value ? '3px solid var(--text)' : '2px solid var(--border)',
            }} />
          ))}
        </div>
      </Field>

      {isEdit ? (
        <Field label="Watermark image (optional)">
          <ClubWatermarkPicker
            clubId={club.id}
            imageUrl={form.image_url}
            posX={form.image_pos_x}
            posY={form.image_pos_y}
            zoom={form.image_zoom}
            colour={CLUB_COLOURS.find(c => c.value === form.colour)?.hex || (form.colour?.startsWith('#') ? form.colour : '#7c3aed')}
            onUpdated={patch => setForm(f => ({ ...f, ...patch }))}
          />
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.35rem' }}>
            Shows as a faint background across the whole club page, behind everything from the welcome banner down to the last event card. Works with portrait or landscape photos; drag and zoom to fit.
          </div>
        </Field>
      ) : (
        <Field label="Watermark image (optional)">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Save the group/club first, then you can add its watermark image here.</div>
        </Field>
      )}

      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0.75rem 0 0.5rem' }}>Event options</div>
      {CLUB_FLAGS.map(fl => (
        <FlagToggle key={fl.key} on={form[fl.key]} label={fl.label} onClick={() => set(fl.key, !form[fl.key])} />
      ))}

      {form.bring_enabled && (
        <Field label="Bring categories (e.g. Entrée, Main, Dessert, Drink)">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem' }}>
            {bringCats.map((c, i) => (
              <span key={c.id || `new-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'var(--surface2)', borderRadius: 16, padding: '0.2rem 0.6rem', fontSize: '0.82rem', color: 'var(--text)' }}>
                {c.label}
                <button type="button" onClick={() => setBringCats(bringCats.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: '0.9rem', lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <input style={inputStyle} value={newCat} onChange={e => setNewCat(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newCat.trim()) { setBringCats([...bringCats, { id: null, label: newCat.trim() }]); setNewCat('') } }}
              placeholder="Add a category…" />
            <button type="button" onClick={() => { if (newCat.trim()) { setBringCats([...bringCats, { id: null, label: newCat.trim() }]); setNewCat('') } }}
              style={{ padding: '0 1rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit' }}>Add</button>
          </div>
        </Field>
      )}

      <Field label="Catalogue / Suggestions">
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[{ v: 'none', t: 'None' }, { v: 'books', t: 'Books' }].map(o => (
            <button key={o.v} type="button" onClick={() => set('catalogue_module', o.v)} style={{
              flex: 1, padding: '0.6rem', borderRadius: 10, fontFamily: 'inherit', cursor: 'pointer', fontWeight: form.catalogue_module === o.v ? 700 : 500,
              border: `1.5px solid ${form.catalogue_module === o.v ? 'var(--purple)' : 'var(--border)'}`,
              background: form.catalogue_module === o.v ? 'var(--purple)' : 'var(--surface)', color: form.catalogue_module === o.v ? '#fff' : 'var(--text)',
            }}>{o.t}</button>
          ))}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.35rem' }}>Only Book Club uses a catalogue (Books) today. Others: None.</div>
      </Field>

      {showOwners && (
        <>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0.75rem 0 0.5rem' }}>Owners</div>
          {isEdit ? (
            <OwnersManager contextType="club" contextKey={club.id}
              hint="Owners answer questions asked on this group/club's page and appear as its contact. Seeded with the group/club's first event coordinator — edit freely." />
          ) : (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Save the group/club first, then you can add its owners here.</div>
          )}
        </>
      )}

      {error && <div style={{ color: '#b91c1c', fontSize: '0.85rem', margin: '0.5rem 0' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '0.75rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        <button onClick={save} disabled={saving} style={{ flex: 2, padding: '0.75rem', borderRadius: 10, border: 'none', background: 'var(--purple)', color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'inherit' }}>{saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Group/Club')}</button>
      </div>
    </div>
  )
}
