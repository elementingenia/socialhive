'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { getAuthToken } from '@/lib/getAuthToken'
import { useUser } from '@/lib/UserContext'
import { useRouter } from 'next/navigation'
import { computeFreeCost, normaliseService } from '@/lib/freeCost'
import { PageTextsIcon, MoviesIcon, SocialIcon, BarIcon, ToolsIcon, BookClubIcon, ClubsIcon, InfoIcon, BookingsIcon } from '@/components/NavIcons'
import OwnersManager from '@/components/OwnersManager'
import ResidentEditForm, { Sheet, labelStyle } from '@/components/ResidentEditPanel'
import { CLUB_COLOURS, nextClubColour } from '@/lib/clubColours'
import ClubForm from '@/components/ClubForm'
import HubTextSection from '@/components/HubTextSection'
import { HUB_SECTIONS } from '@/lib/hubSections'
import { BAR_ENABLED } from '@/lib/features'
import { validateClosure, reasonRemaining, REASON_MAX } from '@/lib/spaces'
import { useLocations } from '@/lib/useLocations'
import { authedFetch } from '@/lib/getAuthToken'
import LocationImagePicker from '@/components/LocationImagePicker'

// ── Constants ────────────────────────────────────────────────────────────────
const HUB_TYPES = [
  { value: 'movie',    label: 'Cinema',    icon: '🎬' },
  { value: 'social',   label: 'Social',    icon: '🎉' },
  { value: 'bookclub', label: 'Book Club', icon: '📚' },
]
const HUB_COLOUR = { movie:'var(--teal)', social:'var(--terracotta)', bookclub:'var(--purple)' }
const SECTIONS = [
  { key: 'PageTexts', label: 'Page Texts', Icon: PageTextsIcon },
  { key: 'Movies',    label: 'Show Time', Icon: MoviesIcon },
  { key: 'BookClub',  label: 'Book Club',  Icon: BookClubIcon },
  { key: 'Clubs',     label: 'Groups & Clubs', Icon: ClubsIcon },
  { key: 'Owners',    label: 'Owners',     Icon: InfoIcon },
  // Bar section parked (feature not in scope) — see lib/features.js
  ...(BAR_ENABLED ? [{ key: 'Bar', label: 'Bar', Icon: BarIcon }] : []),
  { key: 'Locations', label: 'Locations',  Icon: InfoIcon },
  { key: 'Tools',     label: 'Tools',      Icon: ToolsIcon },
]

// ── Shared helpers ────────────────────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return ''
  const [y,m,d] = str.split('-').map(Number)
  return new Date(y,m-1,d).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})
}
function fmtTime(str) {
  if (!str) return ''
  const [h,m] = str.split(':').map(Number)
  return `${h%12||12}:${String(m).padStart(2,'0')}${h>=12?'pm':'am'}`
}
function Badge({ label, colour }) {
  return <span style={{ background: colour + '20', color: colour, fontSize:'0.68rem', fontWeight:700, padding:'0.2rem 0.5rem', borderRadius:'20px' }}>{label}</span>
}

// ── Slide-over shell ──────────────────────────────────────────────────────────
// Portals to document.body (Iain, 2026-08-04: "Delete this venue" modal was
// rendering behind BottomNav for any HIDDEN venue). Root cause: a hidden
// venue's row wrapper has `opacity: 0.55` -- any opacity < 1 establishes a
// new CSS stacking context, which trapped this modal's position:fixed
// content inside it even though the modal's own z-index (201) is higher
// than BottomNav's (100). z-index only resolves within a shared stacking
// context, so the whole opacity-reduced subtree composited behind the nav
// regardless. Portaling to document.body -- the same escape hatch
// SpaceBookingForm already uses for exactly this bug class -- makes the
// modal a direct child of <body>, outside any ancestor's stacking context,
// so it can never be trapped like this again no matter what triggered it.
function SlideOver({ title, onClose, children }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:200 }} />
      <div style={{ position:'fixed', bottom:0, left:0, right:0, background:'var(--bg)', borderRadius:'20px 20px 0 0', zIndex:201, maxHeight:'92vh', display:'flex', flexDirection:'column' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1rem 1.25rem 0.75rem', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontWeight:700, fontSize:'1rem' }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'1.3rem', cursor:'pointer', color:'var(--text-dim)', lineHeight:1 }}>✕</button>
        </div>
        <div style={{ overflowY:'auto', padding:'1.25rem', flex:1 }}>{children}</div>
      </div>
    </>,
    document.body
  )
}

// ── Field components ──────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ marginBottom:'1rem' }}>
      <label style={{ display:'block', fontSize:'0.78rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.4rem' }}>{label}</label>
      {children}
    </div>
  )
}
const inputStyle = { width:'100%', padding:'0.75rem 1rem', borderRadius:'10px', border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)', fontSize:'0.95rem', boxSizing:'border-box' }
const btnPrimary = (colour='var(--teal)') => ({ background:colour, color:'#fff', border:'none', borderRadius:'10px', padding:'0.8rem 1.5rem', fontSize:'0.95rem', fontWeight:700, cursor:'pointer', width:'100%', marginTop:'0.5rem' })
const btnDanger  = { background:'var(--danger)', color:'#fff', border:'none', borderRadius:'10px', padding:'0.8rem 1.5rem', fontSize:'0.95rem', fontWeight:700, cursor:'pointer', width:'100%', marginTop:'0.5rem' }

// ── NOTICES TAB ───────────────────────────────────────────────────────────────
function NoticesTab() {
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState({ type:'main', content:'' })
  const [saving, setSaving]   = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('notices').select('*').eq('archived', false).order('created_at',{ascending:false})
    setNotices(data || [])
    setLoading(false)
  }, [])
  useEffect(()=>{ load() },[load])

  async function post() {
    if (!form.content.trim()) return
    setSaving(true)
    await supabase.from('notices').insert({ type: form.type, content: form.content.trim() })
    setForm({ type:'main', content:'' })
    await load()
    setSaving(false)
  }

  async function archive(id) {
    await supabase.from('notices').update({ archived: true }).eq('id', id)
    setNotices(n => n.filter(x => x.id !== id))
  }

  return (
    <div>
      {/* Quick post */}
      <div style={{ background:'var(--surface)', borderRadius:'14px', border:'1px solid var(--border)', padding:'1rem', marginBottom:'1rem' }}>
        <div style={{ display:'flex', gap:'0.5rem', marginBottom:'0.75rem' }}>
          {['main','sub'].map(t => (
            <button key={t} onClick={()=>setForm(f=>({...f,type:t}))}
              style={{ flex:1, padding:'0.5rem', borderRadius:'8px', border:'1px solid', borderColor:form.type===t?'var(--teal)':'var(--border)', background:form.type===t?'var(--teal)20':'var(--surface)', fontWeight:600, fontSize:'0.82rem', cursor:'pointer', color:form.type===t?'var(--teal)':'var(--text-dim)' }}>
              {t === 'main' ? '📢 Main Notice' : '📌 Sub Notice'}
            </button>
          ))}
        </div>
        <textarea
          style={{ ...inputStyle, minHeight:72, resize:'vertical', marginBottom:'0.75rem' }}
          value={form.content}
          onChange={e=>setForm(f=>({...f,content:e.target.value}))}
          placeholder="Type announcement…"
        />
        <button onClick={post} disabled={saving||!form.content.trim()} style={{ background:'var(--teal)', color:'#fff', border:'none', borderRadius:'10px', padding:'0.65rem 1.25rem', fontWeight:700, fontSize:'0.9rem', cursor:'pointer', opacity:!form.content.trim()?0.5:1 }}>
          {saving ? 'Posting…' : 'Post Notice'}
        </button>
      </div>

      {/* Active notices */}
      {loading ? <div style={{ color:'var(--text-dim)', textAlign:'center', padding:'1.5rem' }}>Loading…</div>
       : notices.length === 0 ? <div style={{ color:'var(--text-dim)', textAlign:'center', padding:'1.5rem', fontSize:'0.9rem' }}>No active notices</div>
       : notices.map(n => (
        <div key={n.id} style={{ background:'var(--surface)', borderRadius:'12px', border:'1px solid var(--border)', padding:'0.9rem 1rem', marginBottom:'0.5rem', borderLeft:'4px solid '+(n.type==='main'?'var(--teal)':'var(--border)') }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'0.5rem' }}>
            <div style={{ flex:1 }}>
              <Badge label={n.type==='main'?'Main':'Sub'} colour={n.type==='main'?'var(--teal)':'var(--text-dim)'} />
              <div style={{ fontSize:'0.88rem', marginTop:'0.4rem', lineHeight:1.5 }}>{n.content}</div>
            </div>
            <button onClick={()=>archive(n.id)} style={{ background:'none', border:'1px solid var(--border)', borderRadius:'8px', padding:'0.3rem 0.6rem', fontSize:'0.75rem', cursor:'pointer', color:'var(--text-dim)', whiteSpace:'nowrap' }}>Archive</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── BAR PRODUCTS TAB ──────────────────────────────────────────────────────────
const BAR_CATS = [
  { value:'beer',    label:'Beer',        icon:'🍺' },
  { value:'wine',    label:'Wine',        icon:'🍷' },
  { value:'spirits', label:'Spirits',     icon:'🥃' },
  { value:'soft',    label:'Soft Drinks', icon:'🥤' },
]
const DEFAULT_ICONS = { beer:'🍺', wine:'🍷', spirits:'🥃', soft:'🥤' }

function BarProductForm({ product, onSave, onClose }) {
  const isEdit = !!product?.id
  const [form, setForm] = useState({
    name:        product?.name        || '',
    description: product?.description || '',
    price:       product?.price       != null ? String(product.price) : '',
    category:    product?.category    || 'beer',
    icon:        product?.icon        || '🍺',
    active:      product?.active      ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.name.trim())          return setErr('Name is required')
    if (!form.price || isNaN(parseFloat(form.price))) return setErr('Valid price required')
    setSaving(true); setErr('')
    const payload = {
      name:        form.name.trim(),
      description: form.description || null,
      price:       parseFloat(form.price),
      category:    form.category,
      icon:        form.icon || DEFAULT_ICONS[form.category],
      active:      form.active,
    }
    const { error } = isEdit
      ? await supabase.from('bar_products').update(payload).eq('id', product.id)
      : await supabase.from('bar_products').insert(payload)
    if (error) { setErr(error.message); setSaving(false); return }
    onSave()
  }

  return (
    <div>
      <Field label="Category">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'0.4rem' }}>
          {BAR_CATS.map(c => (
            <button key={c.value} onClick={() => { set('category', c.value); set('icon', DEFAULT_ICONS[c.value]) }}
              style={{ padding:'0.5rem 0.25rem', borderRadius:'10px', border:'2px solid', borderColor:form.category===c.value?'var(--wine)':'var(--border)', background:form.category===c.value?'var(--wine)20':'var(--surface)', cursor:'pointer', fontSize:'0.72rem', fontWeight:600, color:form.category===c.value?'var(--wine-dark)':'var(--text-dim)', textAlign:'center' }}>
              {c.icon}<br/>{c.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Name"><input style={inputStyle} value={form.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. Tooheys New" /></Field>
      <Field label="Description"><input style={inputStyle} value={form.description} onChange={e=>set('description',e.target.value)} placeholder="Optional tagline" /></Field>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
        <Field label="Price ($)"><input type="number" style={inputStyle} value={form.price} onChange={e=>set('price',e.target.value)} min="0" step="0.50" placeholder="3.00" /></Field>
        <Field label="Icon (emoji)"><input style={inputStyle} value={form.icon} onChange={e=>set('icon',e.target.value)} placeholder="🍺" maxLength={4} /></Field>
      </div>
      <Field label="">
        <label style={{ display:'flex', alignItems:'center', gap:'0.6rem', fontSize:'0.9rem', cursor:'pointer' }}>
          <input type="checkbox" checked={form.active} onChange={e=>set('active',e.target.checked)} style={{ width:18, height:18 }} />
          Active (visible on bar menu)
        </label>
      </Field>
      {err && <div style={{ color:'var(--danger)', fontSize:'0.85rem', marginBottom:'0.75rem' }}>{err}</div>}
      <button onClick={save} disabled={saving} style={btnPrimary('var(--wine)')}>
        {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Product'}
      </button>
    </div>
  )
}

function BarProductsTab() {
  const [products,  setProducts]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState(null)
  const [catFilter, setCat]       = useState('all')

  const load = useCallback(async () => {
    const { data } = await supabase.from('bar_products').select('*').order('category').order('name')
    setProducts(data || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function toggleActive(p) {
    await supabase.from('bar_products').update({ active: !p.active }).eq('id', p.id)
    setProducts(ps => ps.map(x => x.id===p.id ? {...x, active:!x.active} : x))
  }

  const filtered = catFilter === 'all' ? products : products.filter(p => p.category === catFilter)

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
        <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>
          {['all',...BAR_CATS.map(c=>c.value)].map(v => (
            <button key={v} onClick={()=>setCat(v)}
              style={{ padding:'0.3rem 0.65rem', borderRadius:'20px', border:'1px solid', borderColor:catFilter===v?'var(--wine)':'var(--border)', background:catFilter===v?'var(--wine)':'var(--surface)', color:catFilter===v?'#fff':'var(--text)', fontSize:'0.72rem', fontWeight:600, cursor:'pointer' }}>
              {v==='all'?'All':BAR_CATS.find(c=>c.value===v)?.icon+' '+BAR_CATS.find(c=>c.value===v)?.label}
            </button>
          ))}
        </div>
        <button onClick={()=>setSelected({})} style={{ background:'var(--wine)', color:'#fff', border:'none', borderRadius:'10px', padding:'0.5rem 0.9rem', fontSize:'0.82rem', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>+ Add</button>
      </div>
      {loading ? <div style={{ textAlign:'center', padding:'2rem', color:'var(--text-dim)' }}>Loading…</div>
       : filtered.length === 0 ? <div style={{ textAlign:'center', padding:'2rem', color:'var(--text-dim)', fontSize:'0.9rem' }}>No products yet</div>
       : (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          {filtered.map(p => (
            <div key={p.id} style={{ background:'var(--surface)', borderRadius:'12px', border:'1px solid var(--border)', padding:'0.8rem 1rem', display:'flex', alignItems:'center', gap:'0.75rem', opacity:p.active?1:0.55 }}
              onClick={() => setSelected(p)}>
              <span style={{ fontSize:'1.5rem' }}>{p.icon}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:'0.9rem' }}>{p.name}</div>
                {p.description && <div style={{ fontSize:'0.75rem', color:'var(--text-dim)' }}>{p.description}</div>}
              </div>
              <div style={{ fontWeight:800, color:'var(--wine-dark)', marginRight:'0.5rem' }}>${parseFloat(p.price).toFixed(2)}</div>
              <button onClick={e=>{e.stopPropagation();toggleActive(p)}}
                style={{ padding:'0.3rem 0.6rem', borderRadius:'8px', border:'1px solid var(--border)', background:p.active?'var(--green)20':'var(--surface2)', fontSize:'0.72rem', fontWeight:700, cursor:'pointer', color:p.active?'var(--green)':'var(--text-dim)', whiteSpace:'nowrap' }}>
                {p.active ? 'Active' : 'Hidden'}
              </button>
            </div>
          ))}
        </div>
      )}
      {selected !== null && (
        <SlideOver title={selected.id ? 'Edit Product' : 'New Product'} onClose={()=>setSelected(null)}>
          <BarProductForm product={selected.id ? selected : null} onSave={()=>{setSelected(null);load()}} onClose={()=>setSelected(null)} />
        </SlideOver>
      )}
    </div>
  )
}


// ── BAR TAB (sub-tabs wrapper) ────────────────────────────────────────────────
// ── BOOK CLUB TAB — Outstanding Books ──────────────────────────────────────────
// Cross-event view of every physical kit copy currently checked out. Independent
// of any single event, since "who has a kit copy out" is a standing question,
// not something tied to one meeting.
function BookClubTab() {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('bookings')
      .select('id, status, has_book, book_given_at, name_hidden, members(name, username, hide_name), events(id, title, book_id, book_return_date, book_snapshot, books(title))')
      .eq('has_book', true)
      .order('book_given_at', { ascending: true })
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function markReturned(id) {
    setClearing(id)
    await supabase.from('bookings').update({ has_book: false }).eq('id', id)
    setClearing(null)
    load()
  }

  function daysOut(givenAt) {
    if (!givenAt) return null
    const days = Math.floor((Date.now() - new Date(givenAt).getTime()) / 86400000)
    if (days <= 0) return 'Given today'
    return `${days} day${days !== 1 ? 's' : ''} out`
  }

  if (loading) return <div style={{ textAlign:'center', padding:'2rem', color:'var(--text-dim)' }}>Loading…</div>

  return (
    <div>
      <div style={{ fontSize:'0.78rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.85rem' }}>
        Outstanding Books {rows.length > 0 && `(${rows.length})`}
      </div>
      {rows.length === 0 ? (
        <div style={{ textAlign:'center', padding:'2rem', color:'var(--text-dim)', fontSize:'0.9rem' }}>No kit copies currently checked out</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          {rows.map(r => {
            const name = (r.members?.hide_name || r.name_hidden) ? 'Resident' : (r.members?.name || r.members?.username || '—')
            const bookTitle = r.events?.books?.title || r.events?.book_snapshot?.title || r.events?.title || 'Unknown book'
            return (
              <div key={r.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'0.75rem',
                background:'var(--surface)', borderRadius:'12px', border:'1px solid var(--border)', padding:'0.7rem 0.9rem' }}>
                <div style={{ minWidth:0, flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:'0.88rem' }}>
                    {name}
                    {r.status === 'cancelled' && <span style={{ color:'var(--danger)', fontWeight:600, fontSize:'0.72rem' }}> · Cancelled</span>}
                  </div>
                  <div style={{ fontSize:'0.78rem', color:'var(--text-dim)', marginTop:'0.15rem' }}>{bookTitle}</div>
                  <div style={{ fontSize:'0.72rem', color:'var(--purple)', fontWeight:600, marginTop:'0.2rem' }}>
                    {daysOut(r.book_given_at)}
                    {r.events?.book_return_date && ` · Due back ${fmtDate(r.events.book_return_date)}`}
                  </div>
                </div>
                <button onClick={() => markReturned(r.id)} disabled={clearing === r.id}
                  style={{ fontSize:'0.78rem', fontWeight:700, padding:'0.4rem 0.8rem', borderRadius:'8px', border:'1px solid var(--purple)',
                    background:'none', color:'var(--purple)', cursor: clearing === r.id ? 'not-allowed' : 'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
                  {clearing === r.id ? 'Saving…' : 'Mark Returned'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BarTab() {
  const [sub, setSub] = useState('Products')
  return (
    <div>
      <div style={{ display:'flex', gap:'0.4rem', marginBottom:'1rem' }}>
        {['Products', 'Reconcile'].map(s => (
          <button key={s} onClick={() => setSub(s)}
            style={{ padding:'0.35rem 0.85rem', borderRadius:'20px', border:'1px solid',
              borderColor: sub===s ? 'var(--wine)' : 'var(--border)',
              background:  sub===s ? 'var(--wine)' : 'var(--surface)',
              color:       sub===s ? '#fff' : 'var(--text)',
              fontWeight:600, fontSize:'0.8rem', cursor:'pointer' }}>
            {s}
          </button>
        ))}
      </div>
      {sub === 'Products'  && <BarProductsTab />}
      {sub === 'Reconcile' && <ReconcileTab />}
    </div>
  )
}

// Helper: item breakdown for a single member
function MemberBreakdown({ member }) {
  return (
    <div style={{ background:'var(--surface2)', borderRadius:'10px', padding:'0.65rem 0.75rem' }}>
      <div style={{ fontWeight:700, fontSize:'0.88rem', marginBottom:'0.4rem' }}>{member.name}</div>
      {member.items.map(i => (
        <div key={i.product_id} style={{ display:'flex', justifyContent:'space-between', fontSize:'0.82rem', color:'var(--text-dim)', padding:'0.15rem 0' }}>
          <span>{i.icon} {i.product_name} ×{i.quantity}</span>
          <span>${i.line_total.toFixed(2)}</span>
        </div>
      ))}
      <div style={{ borderTop:'1px solid var(--border)', marginTop:'0.4rem', paddingTop:'0.4rem', display:'flex', justifyContent:'space-between', fontWeight:700, fontSize:'0.88rem' }}>
        <span>Total</span>
        <span style={{ color:'var(--wine-dark)' }}>${member.total.toFixed(2)}</span>
      </div>
    </div>
  )
}

// ── BAR RECONCILE TAB ─────────────────────────────────────────────────────────
function ReconcileTab() {
  const [preview,        setPreview]        = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [recon,          setRecon]          = useState(null)
  const [running,        setRunning]        = useState(false)

  // Settle single account — live search
  const [memberSearch,   setMemberSearch]   = useState('')
  const [memberResults,  setMemberResults]  = useState([])
  const [settleId,       setSettleId]       = useState('')
  const [settlePrev,     setSettlePrev]     = useState(null)
  const [settling,       setSettling]       = useState(false)
  const [settledOk,      setSettledOk]      = useState(false)

  // Past outstanding (reconciled but unpaid)
  const [outstanding,    setOutstanding]    = useState([])
  const [loadingOut,     setLoadingOut]     = useState(true)

  async function authHeader() {
    return { Authorization: `Bearer ${await getAuthToken()}` }
  }

  async function loadPreview() {
    const h = await authHeader()
    const data = await fetch('/api/admin/bar-reconcile', { headers: h }).then(r => r.json())
    setPreview(data)
    setLoadingPreview(false)
  }

  async function loadOutstanding() {
    const h = await authHeader()
    const data = await fetch('/api/admin/bar-reconcile?type=outstanding', { headers: h }).then(r => r.json())
    setOutstanding(Array.isArray(data) ? data : [])
    setLoadingOut(false)
  }

  useEffect(() => { loadPreview(); loadOutstanding() }, [])

  function doMemberSearch(q) {
    setMemberSearch(q)
    setSettledOk(false)
    if (q.length < 2) { setMemberResults([]); return }
    const norm = q.toLowerCase()
    setMemberResults((preview?.members || []).filter(m => m.name.toLowerCase().includes(norm)))
  }

  function pickMember(m) {
    setMemberSearch(m.name)
    setMemberResults([])
    setSettleId(m.member_id)
    setSettledOk(false)
    setSettlePrev(preview?.members?.find(x => x.member_id === m.member_id) || null)
  }

  function clearMemberPicker() {
    setMemberSearch('')
    setMemberResults([])
    setSettleId('')
    setSettlePrev(null)
  }

  async function settleAccount() {
    setSettling(true)
    const h = await authHeader()
    const data = await fetch('/api/admin/bar-reconcile', {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: settleId }),
    }).then(r => r.json())
    if (data.error) { alert(data.error); setSettling(false); return }
    setSettledOk(true); clearMemberPicker()
    setLoadingPreview(true); loadPreview()
    setSettling(false)
    setTimeout(() => setSettledOk(false), 3000)
  }

  async function runFullRecon() {
    setRunning(true)
    const h = await authHeader()
    const data = await fetch('/api/admin/bar-reconcile', {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).then(r => r.json())
    if (data.error) { alert(data.error); setRunning(false); return }
    setRecon(data)
    setPreview({ members: [], total_amount: 0, item_count: 0 })
    setLoadingOut(true); loadOutstanding()
    setRunning(false)
  }

  async function markPaid(reconId, member) {
    const h = await authHeader()
    const data = await fetch('/api/admin/bar-reconcile', {
      method: 'PATCH',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reconciliation_id: reconId, member_id: member.member_id, total_amount: member.total }),
    }).then(r => r.json())
    if (data.error) { alert(data.error); return }
    setRecon(prev => ({
      ...prev,
      members: prev.members.map(m => m.member_id === member.member_id ? { ...m, paid: true, paid_at: data.paid_at } : m)
    }))
  }

  async function markOutstandingPaid(reconId, member) {
    const h = await authHeader()
    const data = await fetch('/api/admin/bar-reconcile', {
      method: 'PATCH',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reconciliation_id: reconId, member_id: member.member_id, total_amount: member.total }),
    }).then(r => r.json())
    if (data.error) { alert(data.error); return }
    setOutstanding(prev =>
      prev.map(p => p.reconciliation_id === reconId
        ? { ...p, members: p.members.filter(m => m.member_id !== member.member_id) }
        : p
      ).filter(p => p.members.length > 0)
    )
  }

  const card    = { background:'var(--surface)', borderRadius:'14px', border:'1px solid var(--border)', padding:'1rem', marginBottom:'1rem' }
  const heading = { fontWeight:700, fontSize:'0.95rem', marginBottom:'0.75rem' }

  return (
    <div>
      {/* ── PAST OUTSTANDING ── */}
      {!loadingOut && outstanding.length > 0 && (
        <div style={{ ...card, borderColor:'var(--wine)' }}>
          <div style={{ ...heading, color:'var(--wine-dark)' }}>⚠ Outstanding Balances</div>
          {outstanding.map(period => (
            <div key={period.reconciliation_id} style={{ marginBottom:'0.75rem' }}>
              <div style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.35rem' }}>
                {fmtDate(period.period_start)} – {fmtDate(period.period_end)}
              </div>
              {period.members.map(m => (
                <div key={m.member_id} style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.6rem 0.75rem', background:'var(--surface2)', borderRadius:'10px', marginBottom:'0.3rem' }}>
                  <div style={{ flex:1, fontWeight:600, fontSize:'0.88rem' }}>{m.name}</div>
                  <div style={{ fontWeight:800, color:'var(--wine-dark)', fontSize:'0.88rem' }}>${m.total.toFixed(2)}</div>
                  <button onClick={() => markOutstandingPaid(period.reconciliation_id, m)}
                    style={{ background:'var(--wine)', color:'#fff', border:'none', borderRadius:'8px', padding:'0.35rem 0.7rem', fontSize:'0.78rem', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                    Mark Paid
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── SETTLE SINGLE ACCOUNT ── */}
      <div style={card}>
        <div style={heading}>Settle an Account</div>
        <div style={{ position:'relative', marginBottom:'0.75rem' }}>
          <input
            type="text"
            placeholder="Search member (2+ chars)…"
            value={memberSearch}
            onChange={e => doMemberSearch(e.target.value)}
            style={{ ...inputStyle, fontFamily:'inherit' }}
          />
          {memberResults.length > 0 && (
            <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', boxShadow:'0 4px 16px rgba(0,0,0,0.12)', zIndex:50, maxHeight:'200px', overflowY:'auto', marginTop:'2px' }}>
              {memberResults.map(m => (
                <div key={m.member_id} onClick={() => pickMember(m)}
                  style={{ padding:'0.7rem 1rem', cursor:'pointer', borderBottom:'1px solid var(--border)', fontSize:'0.9rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontWeight:600 }}>{m.name}</span>
                  <span style={{ fontSize:'0.78rem', color:'var(--text-dim)' }}>${m.total.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {settleId && !settlePrev && (
          <div style={{ color:'var(--text-dim)', fontSize:'0.85rem' }}>No outstanding tab for this member.</div>
        )}

        {settlePrev && (
          <>
            <MemberBreakdown member={settlePrev} />
            <button onClick={settleAccount} disabled={settling}
              style={{ width:'100%', marginTop:'0.75rem', background:'var(--wine)', color:'#fff', border:'none', borderRadius:'10px', padding:'0.75rem', fontWeight:700, fontSize:'0.9rem', cursor:'pointer', opacity:settling?0.7:1 }}>
              {settling ? 'Settling…' : `Settle & Mark Paid — $${settlePrev.total.toFixed(2)}`}
            </button>
          </>
        )}

        {settledOk && (
          <div style={{ background:'var(--green)20', border:'1px solid var(--green)', borderRadius:'10px', padding:'0.65rem 1rem', color:'var(--green)', fontWeight:700, fontSize:'0.85rem' }}>
            ✓ Account settled and marked paid
          </div>
        )}
      </div>

      {/* ── FULL RECONCILIATION ── */}
      <div style={card}>
        <div style={heading}>Full Reconciliation</div>

        {loadingPreview ? (
          <div style={{ color:'var(--text-dim)', fontSize:'0.85rem' }}>Loading…</div>
        ) : !recon && preview?.members?.length === 0 ? (
          <div style={{ color:'var(--text-dim)', fontSize:'0.85rem', textAlign:'center', padding:'0.75rem' }}>
            No outstanding tabs — all accounts are clear.
          </div>
        ) : !recon ? (
          <div>
            <div style={{ fontSize:'0.88rem', color:'var(--text-dim)', marginBottom:'0.85rem' }}>
              <strong style={{ color:'var(--text)' }}>{preview.members.length}</strong> member{preview.members.length !== 1 ? 's' : ''}{'  ·  '}
              <strong style={{ color:'var(--text)' }}>{preview.item_count}</strong> item{preview.item_count !== 1 ? 's' : ''}{'  ·  '}
              <strong style={{ color:'var(--wine-dark)' }}>${(preview.total_amount||0).toFixed(2)}</strong> outstanding
            </div>
            {preview.members.map(m => (
              <div key={m.member_id} style={{ marginBottom:'0.4rem', padding:'0.5rem 0.75rem', background:'var(--surface2)', borderRadius:'10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontWeight:600, fontSize:'0.88rem' }}>{m.name}</span>
                <span style={{ fontWeight:700, color:'var(--wine-dark)', fontSize:'0.88rem' }}>${m.total.toFixed(2)}</span>
              </div>
            ))}
            <button onClick={runFullRecon} disabled={running}
              style={{ width:'100%', marginTop:'0.85rem', background:'var(--teal)', color:'#fff', border:'none', borderRadius:'10px', padding:'0.75rem', fontWeight:700, fontSize:'0.9rem', cursor:'pointer', opacity:running?0.7:1 }}>
              {running ? 'Running…' : 'Run Reconciliation'}
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize:'0.85rem', color:'var(--text-dim)', marginBottom:'0.75rem' }}>
              Period {recon.period_start} → {recon.period_end}{'  ·  '}
              <strong style={{ color:'var(--wine-dark)' }}>${recon.total_amount.toFixed(2)}</strong> total
            </div>
            {recon.members.map(m => (
              <div key={m.member_id} style={{ marginBottom:'0.6rem', borderRadius:'12px', border:'1px solid var(--border)', overflow:'hidden' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.65rem 0.85rem', background: m.paid ? 'var(--green)10' : 'var(--surface2)' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:'0.9rem' }}>{m.name}</div>
                    <div style={{ fontSize:'0.75rem', color:'var(--text-dim)' }}>
                      {m.items.map(i => `${i.icon} ${i.product_name} ×${i.quantity}`).join(' · ')}
                    </div>
                  </div>
                  <div style={{ fontWeight:800, color:'var(--wine-dark)', marginRight:'0.5rem' }}>${m.total.toFixed(2)}</div>
                  {m.paid
                    ? <span style={{ fontSize:'0.8rem', fontWeight:700, color:'var(--green)', background:'var(--green)20', padding:'0.3rem 0.6rem', borderRadius:'8px', whiteSpace:'nowrap' }}>✓ Paid</span>
                    : <button onClick={() => markPaid(recon.reconciliation_id, m)}
                        style={{ background:'var(--wine)', color:'#fff', border:'none', borderRadius:'8px', padding:'0.35rem 0.7rem', fontSize:'0.8rem', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                        Mark Paid
                      </button>
                  }
                </div>
              </div>
            ))}
            <button onClick={() => { setRecon(null); setLoadingPreview(true); loadPreview() }}
              style={{ marginTop:'0.5rem', background:'none', border:'1px solid var(--border)', borderRadius:'10px', padding:'0.6rem', width:'100%', cursor:'pointer', fontSize:'0.85rem', color:'var(--text-dim)', fontWeight:600 }}>
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  )
}


// ── TOOLS TAB ─────────────────────────────────────────────────────────────────
function ToolsTab() {
  const [status,        setStatus]        = useState('idle')
  const [lastBatch,     setLastBatch]     = useState(null)
  const [totalEnriched, setTotalEnriched] = useState(0)
  const [totalFailed,   setTotalFailed]   = useState(0)
  const [totalSkipped,  setTotalSkipped]  = useState(0)
  const [batchCount,    setBatchCount]    = useState(0)
  const [failures,      setFailures]      = useState([])   // accumulated across batches
  const [catalogue,     setCatalogue]     = useState(null) // loaded from DB
  const [showCatalogue, setShowCatalogue] = useState(false)
  const [loadingCat,    setLoadingCat]    = useState(false)
  const stopRef = useRef(false)

  async function runAll() {
    stopRef.current = false
    setStatus('running')
    setTotalEnriched(0)
    setTotalFailed(0)
    setTotalSkipped(0)
    setBatchCount(0)
    setLastBatch(null)
    setFailures([])

    let runningEnriched = 0
    let runningFailed   = 0
    let runningSkipped  = 0
    let batches = 0
    let allFailures = []

    while (!stopRef.current) {
      try {
        // Server-side writes — route uses service role, no RLS issues
        const res  = await fetch('/api/admin/enrich-dvd?limit=20', { headers:{ Authorization:`Bearer ${await getAuthToken()}` } })
        const data = await res.json()
        if (data.error) { setStatus('error'); return }
        batches++

        if (data.processed === 0) {
          setStatus('done')
          return
        }

        const batchEnriched = data.enriched  || 0
        const batchFailed   = data.failed    || 0
        const batchSkipped  = data.skipped   || 0
        const batchFails    = (data.results  || []).filter(r => r.status !== 'ok')

        runningEnriched += batchEnriched
        runningFailed   += batchFailed
        runningSkipped  += batchSkipped
        allFailures = [...allFailures, ...batchFails]

        setLastBatch({ enriched: batchEnriched, failed: batchFailed, skipped: batchSkipped, processed: data.processed })
        setTotalEnriched(runningEnriched)
        setTotalFailed(runningFailed)
        setTotalSkipped(runningSkipped)
        setBatchCount(batches)
        setFailures([...allFailures])

        await new Promise(r => setTimeout(r, 500))
      } catch(err) {
        setLastBatch({ error: err.message })
        setStatus('error')
        return
      }
    }
    setStatus('stopped')
  }

  async function loadCatalogue() {
    setLoadingCat(true)
    const res = await fetch('/api/admin/enrich-dvd?catalogue=true', { headers:{ Authorization:`Bearer ${await getAuthToken()}` } })
    const data = await res.json()
    setCatalogue(data.failures || [])
    setShowCatalogue(true)
    setLoadingCat(false)
  }

  function stop() { stopRef.current = true }

  const isRunning = status === 'running'
  const catNoMatch = catalogue?.filter(f => f.enrichment_status === 'no_match') || []
  const catApiErr  = catalogue?.filter(f => f.enrichment_status === 'api_error') || []

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>

      {/* ── Enrichment runner ── */}
      <div style={{ background:'var(--surface)', borderRadius:'14px', border:'1px solid var(--border)', padding:'1.25rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'0.5rem' }}>
          <span style={{ fontSize:'1.3rem' }}>🖼️</span>
          <div style={{ fontWeight:700, fontSize:'0.95rem' }}>Enrich DVD Library</div>
        </div>
        <p style={{ fontSize:'0.82rem', color:'var(--text-dim)', marginBottom:'1rem', lineHeight:1.5 }}>
          Auto-runs batches of 50. Skips titles already marked "not found". Keep this tab open.
        </p>

        {(isRunning || status === 'done' || status === 'stopped' || status === 'error') && (
          <div style={{ background:'var(--surface2)', borderRadius:'10px', padding:'0.75rem', marginBottom:'0.85rem', fontSize:'0.8rem', lineHeight:1.9 }}>
            <div style={{ fontWeight:700, color: status==='done' ? '#15803d' : status==='error' ? 'var(--danger)' : 'var(--teal)', marginBottom:'0.35rem' }}>
              {status==='running' && `⏳ Running… batch ${batchCount}`}
              {status==='done'    && '✅ All done!'}
              {status==='stopped' && `⏸ Stopped after ${batchCount} batches`}
              {status==='error'   && '✕ Error — see below'}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0.5rem', marginBottom:'0.25rem' }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontWeight:800, fontSize:'1.1rem', color:'#15803d' }}>{totalEnriched}</div>
                <div style={{ color:'var(--text-dim)', fontSize:'0.72rem' }}>Enriched</div>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontWeight:800, fontSize:'1.1rem', color:'var(--text-dim)' }}>{totalSkipped}</div>
                <div style={{ color:'var(--text-dim)', fontSize:'0.72rem' }}>No match</div>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontWeight:800, fontSize:'1.1rem', color: totalFailed>0 ? 'var(--danger)' : 'var(--text-dim)' }}>{totalFailed}</div>
                <div style={{ color:'var(--text-dim)', fontSize:'0.72rem' }}>API errors</div>
              </div>
            </div>
            {lastBatch?.error && <div style={{ color:'var(--danger)', marginTop:'0.35rem' }}>Error: {lastBatch.error}</div>}
          </div>
        )}

        <div style={{ display:'flex', gap:'0.6rem' }}>
          <button onClick={runAll} disabled={isRunning}
            style={{ flex:1, background:status==='done'?'#15803d':'var(--teal)', color:'#fff', border:'none', borderRadius:'10px', padding:'0.75rem', fontWeight:700, fontSize:'0.88rem', cursor:isRunning?'not-allowed':'pointer', opacity:isRunning?0.6:1 }}>
            {status==='idle'    && 'Run enrichment →'}
            {status==='running' && 'Running…'}
            {status==='done'    && '✓ Done — run again?'}
            {status==='stopped' && 'Resume'}
            {status==='error'   && 'Retry'}
          </button>
          {isRunning && (
            <button onClick={stop}
              style={{ background:'none', border:'1.5px solid var(--danger)', color:'var(--danger)', borderRadius:'10px', padding:'0.75rem 1rem', fontWeight:700, fontSize:'0.88rem', cursor:'pointer' }}>
              Stop
            </button>
          )}
        </div>
      </div>



      {/* ── Persistent catalogue (from DB) ── */}
      <div style={{ background:'var(--surface)', borderRadius:'14px', border:'1px solid var(--border)', padding:'1.25rem' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
          <div style={{ fontWeight:700, fontSize:'0.9rem' }}>Failure Catalogue</div>
          <button onClick={loadCatalogue} disabled={loadingCat}
            style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'8px', padding:'0.35rem 0.75rem', fontSize:'0.78rem', fontWeight:600, cursor:'pointer', color:'var(--text)' }}>
            {loadingCat ? 'Loading…' : showCatalogue ? 'Refresh' : 'Load from DB'}
          </button>
        </div>
        <p style={{ fontSize:'0.8rem', color:'var(--text-dim)', marginBottom: showCatalogue ? '1rem' : 0, lineHeight:1.5 }}>
          All titles marked "not found" or "API error" across all previous runs.
        </p>
        {showCatalogue && catalogue && (
          <>
            {catalogue.length === 0 && (
              <div style={{ fontSize:'0.85rem', color:'#15803d', fontWeight:600 }}>✓ No failures on record</div>
            )}
            {[['no_match','Not found on TMDB / OMDb', catNoMatch],['api_error','API / network errors (will retry)', catApiErr]].map(([key,label,items]) =>
              items.length > 0 && (
                <div key={key} style={{ marginBottom:'1rem' }}>
                  <div style={{ fontSize:'0.75rem', fontWeight:700, color: key==='api_error'?'var(--danger)':'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.5rem' }}>
                    {label} — {items.length} title{items.length!==1?'s':''}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.3rem', maxHeight:240, overflowY:'auto' }}>
                    {items.map(f => (
                      <div key={f.id} style={{ background:'var(--surface2)', borderRadius:'8px', padding:'0.45rem 0.75rem', fontSize:'0.8rem', display:'flex', justifyContent:'space-between', gap:'0.5rem' }}>
                        <span style={{ fontWeight:600 }}>{f.title}</span>
                        <span style={{ color:'var(--text-dim)', fontSize:'0.72rem', flexShrink:0 }}>{f.genre || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </>
        )}
      </div>

    </div>
  )
}

// ── MOVIES TAB ────────────────────────────────────────────────────────────────

// Suggested Movies sub-tab — read-only FREE/COST view
function SuggestedMoviesView() {
  const [movies,         setMovies]         = useState([])
  const [dvdTmdbIds,     setDvdTmdbIds]     = useState(new Set())
  const [dvdImdbIds,     setDvdImdbIds]     = useState(new Set())
  const [streamingSvcs,  setStreamingSvcs]  = useState([])
  const [ownershipRecs,  setOwnershipRecs]  = useState([])
  const [loading,        setLoading]        = useState(true)
  const [search,         setSearch]         = useState('')

  useEffect(() => {
    async function load() {
      const [movRes, dvdRes, settRes, ownRes] = await Promise.all([
        supabase.from('movies').select('id, title, year, poster_url, tmdb_id, imdb_id, streaming_offers, streaming_checked_at, actors').eq('we_own', false).eq('is_viewing_suggestion', true).order('title'),
        supabase.from('movies').select('tmdb_id, imdb_id').eq('we_own', true),
        supabase.from('settings').select('value').eq('key', 'our_streaming_services').single(),
        supabase.from('movie_ownership').select('movie_id, ownership_type, members(name)'),
      ])
      setMovies(movRes.data || [])
      const dvds = dvdRes.data || []
      setDvdTmdbIds(new Set(dvds.map(d => d.tmdb_id).filter(Boolean)))
      setDvdImdbIds(new Set(dvds.map(d => d.imdb_id).filter(Boolean)))
      try { setStreamingSvcs(JSON.parse(settRes.data?.value || '[]')) } catch { setStreamingSvcs([]) }
      setOwnershipRecs((ownRes.data || []).map(o => ({ movie_id: o.movie_id, ownership_type: o.ownership_type, member_name: o.members?.name || 'Resident' })))
      setLoading(false)
    }
    load()
  }, [])

  // Searches title and lead actor -- matches the Info > Contacts search
  // convention (2026-07-29): a plain substring match against the fields
  // actually shown on the card, not a fuzzy/indexed search. This list has
  // no category filter to fall back on like Contacts does, so with no
  // matches we still say so explicitly rather than rendering nothing.
  //
  // MUST stay above the `if (loading) return` below -- hooks can never
  // follow a conditional early return (Rules of Hooks: every render must
  // call the same hooks in the same order). Caught live via an actual
  // Chrome click-through on the deployed preview as a React error #310
  // crash ("Rendered fewer hooks than expected") the moment `loading`
  // flipped from true to false -- build/lint/unit tests all passed clean
  // and none of them would have caught this, only a real render does.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return movies
    return movies.filter(m => {
      const haystack = [m.title, m.year, m.actors].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [movies, search])

  if (loading) return <div style={{ textAlign:'center', padding:'2rem', color:'var(--text-dim)' }}>Loading…</div>

  const pillStyle = (free) => ({
    display:'inline-block', borderRadius:'20px', padding:'0.18rem 0.55rem',
    fontSize:'0.7rem', fontWeight:700,
    background: free ? '#dcfce7' : '#fef3c7',
    color:       free ? '#15803d' : '#d97706',
  })
  const tagStyle = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'6px', padding:'0.15rem 0.45rem', fontSize:'0.68rem', color:'var(--text-dim)', whiteSpace:'nowrap' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
      <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', marginBottom:'0.25rem' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
          style={{ ...inputStyle, flex:1 }} />
        <span style={{ fontSize:'0.78rem', color:'var(--text-dim)', whiteSpace:'nowrap' }}>{filtered.length}</span>
      </div>
      {movies.length === 0 && <div style={{ textAlign:'center', padding:'2rem', color:'var(--text-dim)', fontSize:'0.9rem' }}>No suggested movies yet</div>}
      {movies.length > 0 && filtered.length === 0 && <div style={{ textAlign:'center', padding:'2rem', color:'var(--text-dim)', fontSize:'0.9rem' }}>No movies match "{search}"</div>}
      {filtered.map(m => {
        const { isFree, reasons } = computeFreeCost(m, { streamingServices: streamingSvcs, dvdTmdbIds, dvdImdbIds, ownershipRecords: ownershipRecs })
        return (
          <div key={m.id} style={{ display:'flex', alignItems:'center', gap:'0.75rem', background:'var(--surface)', borderRadius:'12px', border:'1px solid var(--border)', padding:'0.65rem', overflow:'hidden' }}>
            {m.poster_url
              ? <img src={m.poster_url} alt={m.title} style={{ width:40, height:58, objectFit:'cover', borderRadius:5, flexShrink:0 }} />
              : <div style={{ width:40, height:58, background:'var(--surface2)', borderRadius:5, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem' }}>🎬</div>}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, fontSize:'0.88rem', lineHeight:1.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.title}{m.year ? ` (${m.year})` : ''}</div>
              {m.actors && <div style={{ fontSize:'0.72rem', color:'var(--text-dim)', marginTop:'0.1rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.actors.split(',')[0].trim()}</div>}
              {reasons.length > 0 && (
                <div style={{ display:'flex', gap:'0.3rem', flexWrap:'wrap', marginTop:'0.35rem' }}>
                  {reasons.map((r, i) => <span key={i} style={tagStyle}>{r}</span>)}
                </div>
              )}
            </div>
            <span style={pillStyle(isFree)}>{isFree ? 'FREE' : 'COST'}</span>
          </div>
        )
      })}
    </div>
  )
}

// Private Ownership sub-tab
function PrivateOwnershipTab({ addToast }) {
  const [records,   setRecords]   = useState([])
  const [members,   setMembers]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [results,   setResults]   = useState([])
  const [searching, setSearching] = useState(false)
  const [selected,  setSelected]  = useState(null)   // { tmdb_id, title, year, poster_url }
  const [ownerId,       setOwnerId]       = useState('')
  const [ownerSearch,   setOwnerSearch]   = useState('')
  const [ownerResults,  setOwnerResults]  = useState([])
  const [ownerSelected, setOwnerSelected] = useState(null) // { id, name }
  const [ownType,       setOwnType]       = useState('dvd')
  const [adding,        setAdding]        = useState(false)
  const [removing,      setRemoving]      = useState(null)
  const [ownerFilter,   setOwnerFilter]   = useState('')  // '' = all owners
  const [ownerFilterSearch, setOwnerFilterSearch] = useState('')
  const searchRef = useRef(null)

  async function load() {
    const [recRes, memRes] = await Promise.all([
      supabase.from('movie_ownership').select('id, ownership_type, created_at, movies(id, title, year, actors), members(id, name)').order('created_at', { ascending: false }),
      supabase.from('members').select('id, name').order('name'),
    ])
    setRecords(recRes.data || [])
    setMembers(memRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function doSearch(q) {
    setSearch(q); setSelected(null)
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    const res = await fetch('/api/tmdb/search?q=' + encodeURIComponent(q))
    setResults(await res.json())
    setSearching(false)
  }

  function doOwnerSearch(q) {
    setOwnerSearch(q); setOwnerSelected(null); setOwnerId('')
    if (q.length < 2) { setOwnerResults([]); return }
    const norm = q.toLowerCase()
    setOwnerResults(members.filter(m => m.name.toLowerCase().includes(norm)))
  }

  function selectOwner(m) {
    setOwnerSelected(m); setOwnerId(m.id)
    setOwnerSearch(m.name); setOwnerResults([])
  }

  async function handleAdd() {
    if (!selected || !ownerId) return
    setAdding(true)
    // Fetch full TMDB details to get imdb_id etc. (may already exist in DB)
    const detRes = await fetch('/api/tmdb/details?id=' + selected.tmdb_id)
    const details = await detRes.json()
    // Upsert movie if not already in DB (ownership-only entry — we_own stays false unless it's a DVD library item)
    const { data: existingMov } = await supabase.from('movies').select('id').eq('tmdb_id', selected.tmdb_id).maybeSingle()
    let movieId = existingMov?.id
    if (!movieId) {
      const { data: newMov, error: insErr } = await supabase.from('movies').insert({
        tmdb_id: selected.tmdb_id, imdb_id: details.imdb_id || null,
        title: details.title || selected.title, year: details.year || selected.year,
        poster_url: details.poster_url || selected.poster_url,
        genre: details.genre || null, plot: details.plot || null,
        runtime: details.runtime || null, director: details.director || null,
        actors: details.actors || null, rating_imdb: details.rating_imdb || null,
        rating_rt: details.rating_rt || null, rating: details.rating || null,
        we_own: false, is_viewing_suggestion: false,
      }).select('id').single()
      if (insErr) { addToast('Could not add movie: ' + insErr.message, 'error'); setAdding(false); return }
      movieId = newMov.id
    }
    const { error } = await supabase.from('movie_ownership').insert({ movie_id: movieId, member_id: ownerId, ownership_type: ownType })
    setAdding(false)
    if (error) { addToast(error.code === '23505' ? 'That ownership record already exists' : error.message, 'error'); return }
    addToast('Ownership record added')
    setSearch(''); setResults([]); setSelected(null)
    setOwnerId(''); setOwnerSearch(''); setOwnerSelected(null); setOwnerResults([])
    setOwnType('dvd')
    load()
  }

  async function handleRemove(id) {
    setRemoving(id)
    await supabase.from('movie_ownership').delete().eq('id', id)
    setRemoving(null)
    addToast('Record removed')
    load()
  }

  const canAdd = selected && ownerId

  // Distinct owners present in the records, for the filter row.
  const owners = useMemo(() => {
    const seen = new Map()
    for (const r of records) if (r.members?.id) seen.set(r.members.id, r.members.name)
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [records])
  const visibleRecords = ownerFilter ? records.filter(r => r.members?.id === ownerFilter) : records
  const selectedOwnerName = owners.find(o => o.id === ownerFilter)?.name
  // Live-search the owners who actually have records (scales to a large community).
  const ownerFilterResults = useMemo(() => {
    const q = ownerFilterSearch.trim().toLowerCase()
    if (q.length < 2) return []
    return owners.filter(o => (o.name || '').toLowerCase().includes(q)).slice(0, 20)
  }, [ownerFilterSearch, owners])

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
      {/* Add form */}
      <div style={{ background:'var(--surface)', borderRadius:'14px', border:'1px solid var(--border)', padding:'1.1rem' }}>
        <div style={{ fontWeight:700, fontSize:'0.88rem', marginBottom:'0.75rem' }}>Add Ownership Record</div>
        {/* Search */}
        <div style={{ position:'relative', marginBottom:'0.6rem' }}>
          <input ref={searchRef} value={search} onChange={e => doSearch(e.target.value)}
            placeholder="Search by movie title…" style={inputStyle} />
          {searching && <div style={{ position:'absolute', right:'0.75rem', top:'50%', transform:'translateY(-50%)', fontSize:'0.75rem', color:'var(--text-dim)' }}>…</div>}
          {results.length > 0 && !selected && (
            <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', zIndex:50, overflow:'hidden', boxShadow:'0 4px 16px rgba(0,0,0,0.2)', marginTop:'0.25rem' }}>
              {results.map(r => (
                <div key={r.tmdb_id} onClick={() => { setSelected(r); setSearch(r.title + (r.year ? ` (${r.year})` : '')); setResults([]) }}
                  style={{ display:'flex', alignItems:'center', gap:'0.6rem', padding:'0.6rem 0.75rem', cursor:'pointer', borderBottom:'1px solid var(--border)' }}>
                  {r.poster_url ? <img src={r.poster_url} alt={r.title} style={{ width:28, height:40, objectFit:'cover', borderRadius:3 }} /> : <div style={{ width:28, height:40, background:'var(--surface2)', borderRadius:3 }} />}
                  <div style={{ fontSize:'0.85rem', fontWeight:600 }}>{r.title}{r.year ? <span style={{ fontWeight:400, color:'var(--text-dim)' }}> ({r.year})</span> : ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Owner live search */}
        <div style={{ marginBottom:'0.6rem' }}>
          <div style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--text-dim)', marginBottom:'0.3rem' }}>Owner (resident)</div>
          <div style={{ position:'relative' }}>
            <input
              value={ownerSearch}
              onChange={e => doOwnerSearch(e.target.value)}
              placeholder="Type a name (min 2 chars)…"
              style={{ ...inputStyle, borderColor: ownerSelected ? 'var(--teal)' : undefined }}
            />
            {ownerSelected && (
              <span style={{ position:'absolute', right:'0.75rem', top:'50%', transform:'translateY(-50%)', color:'var(--teal)', fontSize:'1rem', pointerEvents:'none' }}>✓</span>
            )}
            {ownerResults.length > 0 && !ownerSelected && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', zIndex:50, overflow:'hidden', boxShadow:'0 4px 16px rgba(0,0,0,0.2)', marginTop:'0.25rem' }}>
                {ownerResults.map(m => (
                  <div key={m.id} onClick={() => selectOwner(m)}
                    style={{ padding:'0.65rem 0.85rem', cursor:'pointer', borderBottom:'1px solid var(--border)', fontSize:'0.88rem', fontWeight:500 }}>
                    {m.name}
                  </div>
                ))}
              </div>
            )}
            {ownerSearch.length >= 2 && ownerResults.length === 0 && !ownerSelected && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', zIndex:50, padding:'0.65rem 0.85rem', fontSize:'0.85rem', color:'var(--text-dim)', marginTop:'0.25rem' }}>
                No residents match
              </div>
            )}
          </div>
        </div>
        {/* Type toggle */}
        <div style={{ marginBottom:'0.75rem' }}>
          <div style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--text-dim)', marginBottom:'0.3rem' }}>Ownership type</div>
          <div style={{ display:'flex', gap:'0.5rem' }}>
            {[['dvd','📀 DVD'],['digital','💾 Digital']].map(([val, label]) => (
              <button key={val} onClick={() => setOwnType(val)}
                style={{ flex:1, padding:'0.65rem', borderRadius:'10px', border:`1.5px solid ${ownType===val ? 'var(--teal)' : 'var(--border)'}`, background: ownType===val ? 'var(--teal)' : 'var(--surface)', color: ownType===val ? '#fff' : 'var(--text)', fontWeight: ownType===val ? 700 : 500, fontSize:'0.88rem', cursor:'pointer', fontFamily:'inherit' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={handleAdd} disabled={!canAdd || adding}
          style={{ ...btnPrimary(), opacity: (!canAdd || adding) ? 0.5 : 1, cursor: (!canAdd || adding) ? 'not-allowed' : 'pointer' }}>
          {adding ? 'Adding…' : '+ Add Record'}
        </button>
      </div>

      {/* Filter by owner (live search — scales to a large community) */}
      {owners.length > 1 && (
        <div>
          <div style={{ fontSize:'0.72rem', fontWeight:600, color:'var(--text-dim)', marginBottom:'0.3rem' }}>Filter by owner</div>
          {ownerFilter ? (
            <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', flexWrap:'wrap' }}>
              <span style={{ display:'inline-flex', alignItems:'center', gap:'0.4rem', padding:'0.35rem 0.5rem 0.35rem 0.75rem', borderRadius:'999px', background:'var(--teal)', color:'#fff', fontSize:'0.82rem', fontWeight:700 }}>
                {selectedOwnerName || 'Owner'}
                <button onClick={() => { setOwnerFilter(''); setOwnerFilterSearch('') }} aria-label="Clear owner filter"
                  style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:'1.15rem', height:'1.15rem', borderRadius:'999px', border:'none', background:'rgba(255,255,255,0.25)', color:'#fff', fontSize:'0.72rem', cursor:'pointer', fontFamily:'inherit', lineHeight:1 }}>✕</button>
              </span>
              <span style={{ fontSize:'0.72rem', color:'var(--text-dim)' }}>{visibleRecords.length} record{visibleRecords.length === 1 ? '' : 's'}</span>
            </div>
          ) : (
            <div style={{ position:'relative' }}>
              <input value={ownerFilterSearch} onChange={e => setOwnerFilterSearch(e.target.value)}
                placeholder="Type a name (min 2 chars)…" style={inputStyle} />
              {ownerFilterResults.length > 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', zIndex:50, overflow:'hidden', boxShadow:'0 4px 16px rgba(0,0,0,0.2)', marginTop:'0.25rem', maxHeight:'14rem', overflowY:'auto' }}>
                  {ownerFilterResults.map(o => (
                    <div key={o.id} onClick={() => { setOwnerFilter(o.id); setOwnerFilterSearch('') }}
                      style={{ padding:'0.65rem 0.85rem', cursor:'pointer', borderBottom:'1px solid var(--border)', fontSize:'0.88rem', fontWeight:500 }}>
                      {o.name}
                    </div>
                  ))}
                </div>
              )}
              {ownerFilterSearch.trim().length >= 2 && ownerFilterResults.length === 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', zIndex:50, padding:'0.65rem 0.85rem', fontSize:'0.85rem', color:'var(--text-dim)', marginTop:'0.25rem' }}>
                  No owners match
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Existing records */}
      {loading ? <div style={{ textAlign:'center', padding:'1.5rem', color:'var(--text-dim)' }}>Loading…</div> : records.length === 0 ? (
        <div style={{ textAlign:'center', padding:'1.5rem', color:'var(--text-dim)', fontSize:'0.9rem' }}>No ownership records yet</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          {visibleRecords.map(r => (
            <div key={r.id} style={{ display:'flex', alignItems:'center', gap:'0.75rem', background:'var(--surface)', borderRadius:'12px', border:'1px solid var(--border)', padding:'0.65rem' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:'0.88rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {r.movies?.title}{r.movies?.year ? ` (${r.movies.year})` : ''}
                </div>
                {r.movies?.actors && <div style={{ fontSize:'0.72rem', color:'var(--text-dim)' }}>{r.movies.actors.split(',')[0].trim()}</div>}
                <div style={{ fontSize:'0.75rem', color:'var(--text-dim)', marginTop:'0.2rem' }}>
                  <span style={{ fontWeight:700, color:'var(--text)' }}>{r.members?.name || 'Resident'}</span> · {r.ownership_type === 'dvd' ? '📀 DVD' : '💾 Digital'}
                </div>
              </div>
              <button onClick={() => handleRemove(r.id)} disabled={removing === r.id}
                style={{ flexShrink:0, background:'none', border:'1px solid var(--danger)', borderRadius:'8px', padding:'0.3rem 0.6rem', fontSize:'0.72rem', fontWeight:700, color:'var(--danger)', cursor:removing===r.id?'not-allowed':'pointer', opacity:removing===r.id?0.5:1 }}>
                {removing === r.id ? '…' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Streaming Services sub-tab
function StreamingServicesTab({ addToast }) {
  const [services, setServices] = useState([])
  const [input,    setInput]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const [loading,  setLoading]  = useState(true)

  // Streaming-refresh runner
  const [refreshing,    setRefreshing]    = useState(false)
  const [refreshTotal,  setRefreshTotal]  = useState(0)
  const [refreshDone,   setRefreshDone]   = useState(0)
  const [refreshFound,  setRefreshFound]  = useState(0)
  const [refreshResults, setRefreshResults] = useState([])
  const refreshStopRef = useRef(false)

  async function loadServices() {
    const { data } = await supabase.from('settings').select('value').eq('key', 'our_streaming_services').single()
    try { setServices(JSON.parse(data?.value || '[]')) } catch { setServices([]) }
    setLoading(false)
  }

  useEffect(() => { loadServices() }, [])

  async function runStreamingRefresh() {
    refreshStopRef.current = false
    setRefreshing(true)
    setRefreshDone(0)
    setRefreshFound(0)
    setRefreshResults([])

    const { count } = await supabase.from('movies').select('id', { count: 'exact', head: true }).eq('we_own', false).eq('is_viewing_suggestion', true)
    setRefreshTotal(count || 0)

    // Match against the actual subscribed-services list, same fuzzy logic
    // freeCost.js uses — "has some streaming service" is not the same claim
    // as "matches one we pay for".
    const ourNorm = services.map(normaliseService)
    function matchesOurServices(flatrate = []) {
      return flatrate.some(svc => {
        const norm = normaliseService(svc)
        return ourNorm.some(o => o === norm || o.includes(norm) || norm.includes(o))
      })
    }

    let done = 0, found = 0
    const allResults = []

    while (!refreshStopRef.current) {
      try {
        const res = await fetch('/api/admin/refresh-streaming?limit=15', { headers: { Authorization: `Bearer ${await getAuthToken()}` } })
        const data = await res.json()
        if (data.error) { addToast(data.error, 'error'); setRefreshing(false); return }
        if (data.processed === 0) break

        done += data.processed
        found += (data.results || []).filter(r => r.status === 'ok' && matchesOurServices(r.flatrate)).length
        allResults.push(...(data.results || []))

        setRefreshDone(done)
        setRefreshFound(found)
        setRefreshResults([...allResults])
      } catch (err) {
        addToast(err.message, 'error')
        setRefreshing(false)
        return
      }
    }
    setRefreshing(false)
    addToast(`Checked ${done} title${done !== 1 ? 's' : ''} — ${found} now match a subscribed service`)
  }

  function stopRefresh() { refreshStopRef.current = true }

  async function saveServices(updated) {
    setSaving(true)
    await supabase.from('settings').update({ value: JSON.stringify(updated), updated_at: new Date().toISOString() }).eq('key', 'our_streaming_services')
    setSaving(false)
  }

  async function handleAdd() {
    const svc = input.trim()
    if (!svc) return
    if (services.some(s => s.toLowerCase() === svc.toLowerCase())) { addToast('Already in the list', 'error'); return }
    const updated = [...services, svc]
    setServices(updated)
    setInput('')
    await saveServices(updated)
    addToast(svc + ' added')
  }

  async function handleRemove(svc) {
    const updated = services.filter(s => s !== svc)
    setServices(updated)
    await saveServices(updated)
    addToast(svc + ' removed')
  }

  const chipStyle = { display:'inline-flex', alignItems:'center', gap:'0.35rem', background:'var(--teal)', color:'#fff', borderRadius:'20px', padding:'0.3rem 0.65rem', fontSize:'0.78rem', fontWeight:600 }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
      <div style={{ background:'var(--surface)', borderRadius:'14px', border:'1px solid var(--border)', padding:'1.1rem' }}>
        <div style={{ fontWeight:700, fontSize:'0.88rem', marginBottom:'0.5rem' }}>Community Streaming Subscriptions</div>
        <div style={{ fontSize:'0.8rem', color:'var(--text-dim)', marginBottom:'0.85rem', lineHeight:1.5 }}>
          Movies available on these services show as FREE in Viewing Suggestions and screening tiles.
        </div>
        {/* Add input */}
        <div style={{ display:'flex', gap:'0.5rem', marginBottom:'0.85rem' }}>
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="e.g. Netflix, Stan, Disney+" style={{ ...inputStyle, flex:1 }} />
          <button onClick={handleAdd} disabled={!input.trim() || saving}
            style={{ ...btnPrimary(), width:'auto', padding:'0 1.1rem', marginTop:0, opacity:(!input.trim()||saving)?0.5:1, cursor:(!input.trim()||saving)?'not-allowed':'pointer' }}>
            Add
          </button>
        </div>
        {/* Chips */}
        {loading ? <div style={{ color:'var(--text-dim)', fontSize:'0.85rem' }}>Loading…</div>
          : services.length === 0
            ? <div style={{ color:'var(--text-dim)', fontSize:'0.85rem' }}>No services added yet</div>
            : (
              <div style={{ display:'flex', flexWrap:'wrap', gap:'0.4rem' }}>
                {services.map(s => (
                  <span key={s} style={chipStyle}>
                    {s}
                    <button onClick={() => handleRemove(s)} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.8)', fontSize:'0.9rem', padding:0, lineHeight:1, display:'flex', alignItems:'center' }}>✕</button>
                  </span>
                ))}
              </div>
            )}
        {saving && <div style={{ fontSize:'0.72rem', color:'var(--text-dim)', marginTop:'0.5rem' }}>Saving…</div>}
      </div>

      {/* Refresh streaming availability */}
      <div style={{ background:'var(--surface)', borderRadius:'14px', border:'1px solid var(--border)', padding:'1.1rem' }}>
        <div style={{ fontWeight:700, fontSize:'0.88rem', marginBottom:'0.5rem' }}>Refresh Streaming Availability</div>
        <div style={{ fontSize:'0.8rem', color:'var(--text-dim)', marginBottom:'0.85rem', lineHeight:1.5 }}>
          Re-checks every suggested movie against JustWatch, and fills in the maturity rating
          (PG/M/MA15+ etc.) for any suggestion that's missing one. Matching against the services
          above already happens live — adding or removing a service here doesn't need a refresh.
          Run this periodically since a title's actual streaming availability can change on
          JustWatch's end over time (added or dropped from a service).
        </div>
        <button onClick={refreshing ? stopRefresh : runStreamingRefresh}
          style={{ ...btnPrimary(refreshing ? 'var(--danger)' : 'var(--teal)'), width:'auto', padding:'0 1.1rem', marginTop:0 }}>
          {refreshing ? 'Stop' : 'Refresh All Suggested Movies'}
        </button>
        {refreshTotal > 0 && (
          <div style={{ marginTop:'0.85rem' }}>
            <div style={{ fontSize:'0.8rem', color:'var(--text-dim)', marginBottom:'0.35rem' }}>
              {refreshDone} / {refreshTotal} checked — {refreshFound} match a subscribed service
            </div>
            <div style={{ height:6, borderRadius:3, background:'var(--surface2)', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${Math.min(100, (refreshDone / refreshTotal) * 100)}%`, background:'var(--teal)', transition:'width 0.3s' }} />
            </div>
          </div>
        )}
        {refreshResults.length > 0 && !refreshing && (
          <div style={{ marginTop:'0.85rem', maxHeight:200, overflowY:'auto', display:'flex', flexDirection:'column', gap:'0.3rem' }}>
            {refreshResults.filter(r => r.status !== 'ok' || r.flatrate?.length > 0).map(r => (
              <div key={r.id} style={{ background:'var(--surface2)', borderRadius:'8px', padding:'0.45rem 0.75rem', fontSize:'0.78rem', display:'flex', justifyContent:'space-between', gap:'0.5rem' }}>
                <span style={{ fontWeight:600 }}>{r.title}</span>
                <span style={{ color: r.status === 'not_found' ? 'var(--text-dim)' : '#15803d', fontSize:'0.72rem', flexShrink:0 }}>
                  {r.status === 'not_found' ? 'Not found on JustWatch' : r.flatrate?.join(', ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Movies tab wrapper
function MoviesTab() {
  const [sub, setSub] = useState('Suggested')
  const [toasts, setToasts] = useState([])

  function addToast(message, type = 'success') {
    const id = Date.now()
    setToasts(p => [...p, { id, message, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000)
  }

  const subBtnStyle = (active) => ({
    padding:'0.35rem 0.85rem', borderRadius:'20px', border:'1px solid',
    borderColor: active ? 'var(--teal)' : 'var(--border)',
    background:  active ? 'var(--teal)' : 'var(--surface)',
    color:       active ? '#fff' : 'var(--text)',
    fontWeight:600, fontSize:'0.78rem', cursor:'pointer', whiteSpace:'nowrap',
  })

  return (
    <div>
      {/* Toast */}
      <div style={{ position:'fixed', top:'1rem', left:'50%', transform:'translateX(-50%)', zIndex:999, display:'flex', flexDirection:'column', gap:'0.5rem', pointerEvents:'none', minWidth:260, maxWidth:'90vw' }}>
        {toasts.map(t => (
          <div key={t.id} style={{ background:t.type==='error'?'var(--danger)':'#15803d', color:'#fff', padding:'0.75rem 1.1rem', borderRadius:'12px', fontSize:'0.88rem', fontWeight:600, boxShadow:'0 4px 20px rgba(0,0,0,0.2)', display:'flex', alignItems:'center', gap:'0.5rem' }}>
            <span>{t.type==='error'?'✕':'✓'}</span>{t.message}
          </div>
        ))}
      </div>
      {/* Sub-tabs */}
      <div style={{ display:'flex', gap:'0.4rem', marginBottom:'1rem', overflowX:'auto' }}>
        {['Suggested', 'Ownership', 'Streaming'].map(s => (
          <button key={s} onClick={() => setSub(s)} style={subBtnStyle(sub === s)}>{s}</button>
        ))}
      </div>
      {sub === 'Suggested'  && <SuggestedMoviesView />}
      {sub === 'Ownership'  && <PrivateOwnershipTab addToast={addToast} />}
      {sub === 'Streaming'  && <StreamingServicesTab addToast={addToast} />}
    </div>
  )
}




// ── PAGE TEXTS TAB ────────────────────────────────────────────────────────────
// Each section is now a self-contained HubTextSection (components/HubTextSection.js,
// config in lib/hubSections.js) — extracted 2026-08-12 so the same editor can be
// reused on an Owner's "Manage this area" screen for just their one section.
function PageTextsTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {HUB_SECTIONS.map(sec => (
        <HubTextSection key={sec.key} sectionKey={sec.key} />
      ))}
    </div>
  )
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { member, loading } = useUser()
  const router = useRouter()
  const [tab, setTab] = useState(null)

  // Reset to main admin page when footer Admin button re-tapped
  useEffect(() => {
    function onReset() { setTab(null) }
    window.addEventListener("admin-reset", onReset)
    return () => window.removeEventListener("admin-reset", onReset)
  }, [])

  useEffect(()=>{
    if (!loading && member && !member.is_admin) router.replace('/home')
  }, [member, loading, router])

  if (loading || !member) return null
  if (!member.is_admin) return null

  // Section view — show selected section with back nav
  if (tab) {
    const section = SECTIONS.find(s => s.key === tab)
    return (
      <div style={{ padding:'0 1rem 6rem' }}>
        <button onClick={() => setTab(null)}
          style={{ display:'flex', alignItems:'center', gap:'0.4rem', background:'none', border:'none', color:'var(--teal)', fontWeight:600, fontSize:'0.88rem', cursor:'pointer', padding:'1rem 0', fontFamily:'inherit' }}>
          ← Admin
        </button>
        {tab === 'PageTexts' && <PageTextsTab />}
        {tab === 'Movies'    && <MoviesTab />}
        {tab === 'BookClub'  && <BookClubTab />}
        {tab === 'Clubs'     && <ClubsTab />}
        {tab === 'Owners'    && <HubOwnersTab />}
        {BAR_ENABLED && tab === 'Bar' && <BarTab />}
        {tab === 'Locations' && <LocationsTab />}
        {tab === 'Tools'     && <ToolsTab />}
      </div>
    )
  }

  // Default: card grid — nothing selected
  return (
    <div style={{ padding:'1rem 1rem 6rem' }}>
      <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-dim)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:'0.75rem' }}>Admin</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.65rem' }}>
        {SECTIONS.map((s, i) => {
          const isLast = i === SECTIONS.length - 1
          const spanFull = isLast && SECTIONS.length % 2 === 1
          return (
            <button key={s.key} onClick={() => setTab(s.key)}
              style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'14px', padding:'1rem 0.75rem', display:'flex', flexDirection:'column', alignItems:'center', gap:'0.35rem', cursor:'pointer', fontFamily:'inherit',
                ...(spanFull ? { gridColumn:'1/-1' } : {}) }}>
              <span style={{ color:'var(--text)', lineHeight:0 }}><s.Icon size={32} /></span>
              <span style={{ fontWeight:700, fontSize:'0.85rem', color:'var(--text)' }}>{s.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}



// ── Clubs tab — Club Manager (Phase 2a) ───────────────────────────────────────
// Create/configure clubs that render in the data-driven /clubs hub. Writes go
// straight through the supabase client (clubs RLS allows admin write), same as
// Book Club edits its events client-side.
function HubOwnersTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
        Owners are the residents who receive questions asked on a hub&apos;s page and are shown as its contact. App admins always receive Home questions as a fallback, so they don&apos;t need listing here.
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, color: 'var(--teal)', marginBottom: '0.5rem' }}>
          <MoviesIcon size={18} /> Show Time
        </div>
        <OwnersManager contextType="hub" contextKey="movie" />
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, color: 'var(--terracotta)', marginBottom: '0.5rem' }}>
          <SocialIcon size={18} /> Social
        </div>
        <OwnersManager contextType="hub" contextKey="social" />
      </div>
      {/* Shed placeholder removed 2026-08-12 -- Shed was never built and is
          out of scope (Owner_SelfService_and_Library_Hub_Scope_v1), dropped
          from Home the same session. Library takes its place here. */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, color: 'var(--purple)', marginBottom: '0.5rem' }}>
          <BookClubIcon size={18} /> Library
        </div>
        <OwnersManager contextType="hub" contextKey="library" />
      </div>
    </div>
  )
}

function ClubsTab() {
  const [clubs, setClubs] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | club object

  const load = useCallback(() => {
    supabase.from('clubs').select('*').eq('archived', false).order('sort_order').order('name')
      .then(({ data }) => setClubs(data || []))
  }, [])
  useEffect(() => { load() }, [load])

  async function archive(club) {
    if (!confirm(`Archive "${club.name}"? It'll be hidden from Groups & Clubs.`)) return
    await supabase.from('clubs').update({ archived: true }).eq('id', club.id)
    load()
  }

  if (editing) {
    return (
      <div>
        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)', marginBottom: '1rem' }}>{editing === 'new' ? 'New Group/Club' : `Edit ${editing.name}`}</div>
        <ClubForm club={editing === 'new' ? null : editing} existingColours={(clubs || []).map(c => c.colour)} onSaved={() => { setEditing(null); load() }} onCancel={() => setEditing(null)} />
      </div>
    )
  }

  return (
    <div>
      <button onClick={() => setEditing('new')} style={{ width: '100%', padding: '0.8rem', borderRadius: 12, border: 'none', background: 'var(--purple)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: '1rem' }}>+ New Group/Club</button>
      {clubs === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
      ) : clubs.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem' }}>No groups or clubs yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {clubs.map(c => (
            <div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `4px solid ${c.colour || 'var(--purple)'}`, borderRadius: 12, padding: '0.85rem 1rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              {/* Accessibility fix (2026-08-31): flexWrap + name ellipsis so
                  Edit/Archive can't be clipped off-screen by app/globals.css's
                  html{overflow-x:hidden} at larger text sizes. */}
              <div style={{ minWidth: 0, flex: '1 1 auto', overflow: 'hidden' }}>
                <div style={{ fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>/clubs/{c.slug}{c.catalogue_module === 'books' ? ' · Books catalogue' : ''}</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', flexShrink: 0 }}>
                <button onClick={() => setEditing(c)} style={{ padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem' }}>Edit</button>
                {c.slug !== 'book-club' && (
                  <button onClick={() => archive(c)} style={{ padding: '0.4rem 0.7rem', borderRadius: 8, border: '1px solid #fca5a5', background: '#fee2e2', color: '#991b1b', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem' }}>Archive</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Locations tab — the shared, admin-managed venue list ─────────────────────
// Migration 050 created the list; migration 072 gave each venue its own
// properties. Scope locked by Iain 2026-07-31:
//   * Capacity — a numeric that SEEDS the default max_seats for events here.
//     It does NOT restrict a larger number, so it warns and never blocks.
//   * Open / Closed for bookings — closed is either "until further notice"
//     (a start date only) or a From/To range, with a reason capped at 100 chars.
//   * Admin only. No approval workflow, no per-space owners.
//
// The old version edited names through a native `prompt()`, which broke the
// no-native-browser-controls standard and had nowhere to put the new fields.
// Each venue is now an accordion row — closed by default, so twelve venues
// still fit on one screen (vertical space is precious).
// Admin > Space Bookings. Scope: Social_Hive_Personal_Space_Booking_Scope.md
// (decisions locked 2026-08-01: "Admin needs an admin view so they can
// overrule, cancel or challenge a booking of any space"). Extended 2026-08-04
// (Iain: "an admin space to see all space bookings, both events and resident
// personal space bookings") to also list every EVENT that has claimed a room
// -- Show Time, Social, Groups & Clubs -- alongside personal bookings, so
// Admin sees total room usage in one place instead of checking each hub
// separately. Event rows are read-only here; editing/cancelling an event's
// room booking stays in that event's own hub -- this view is for visibility,
// not a second place to manage the same booking (which would drift, per the
// project's existing "one source of truth per field" lesson).
const EVENT_HUB_META = {
  movie:    { label: 'Show Time',      colour: 'var(--teal)',       Icon: MoviesIcon },
  social:   { label: 'Social',         colour: 'var(--terracotta)', Icon: SocialIcon },
  bookclub: { label: 'Book Club',      colour: 'var(--purple)',     Icon: BookClubIcon },
  club:     { label: 'Groups & Clubs', colour: 'var(--purple)',     Icon: ClubsIcon },
}

// Personal bookings store starts_at/ends_at as a real timestamptz; events
// store event_date/event_time as plain Sydney-local strings. Converting the
// instant to Sydney-local date/time parts here puts both on the same
// YYYY-MM-DD / HH:MM basis so they can be sorted and displayed together
// without a duplicate DST-aware composer (lib/spaces.js's sydneyOffsetMinutes
// goes local->instant; this is the reverse direction, instant->local, which
// Intl already does correctly without needing that helper's DST table).
function sydneyDateTimeParts(iso) {
  const d = new Date(iso)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

function fmtUsageDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

// Compact form for the 2-line admin room-usage row -- no weekday, year only
// when it isn't the current one (Iain, 2026-08-04: "Using a LOT of vertical
// space in each tile - let's combine the information to make things more
// compact").
function fmtUsageDateShort(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const opts = { day: 'numeric', month: 'short' }
  if (y !== new Date().getFullYear()) opts.year = 'numeric'
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', opts)
}

function fmtUsageTime(hhmm) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, '0')}${period}`
}

// Space filter -- same custom button+popover shape as CalendarView's
// ClubScopeDropdown (components/CalendarView.js), per the app's own
// no-native-<select> standard. useLocations() is already A-Z sorted.
function LocationFilterDropdown({ locations, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const rootRef = useRef(null)
  const btnRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const options = [{ id: '', name: 'All spaces' }, ...locations]
  const current = options.find(o => o.id === value) || options[0]

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setMenuPos({ top: r.bottom + 4, left: r.left })
    }
    setOpen(o => !o)
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '0.55rem 0.9rem',
          borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)',
          cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)',
        }}
      >
        {current.name}
        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>▾</span>
      </button>

      {open && menuPos && (
        <div style={{
          position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 400,
          minWidth: 200, maxHeight: 300, overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', padding: 4,
        }}>
          {options.map(o => (
            <button
              key={o.id || 'all'}
              type="button"
              onClick={() => { onChange(o.id); setOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
                borderRadius: 8, border: 'none',
                background: o.id === value ? 'var(--surface2)' : 'transparent',
                color: o.id === value ? 'var(--teal)' : 'var(--text)',
                fontFamily: 'inherit', fontSize: 13, fontWeight: o.id === value ? 700 : 500, cursor: 'pointer',
              }}
            >{o.name}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// Date/Space sort -- a 2-option styled button group, not a native select
// (matches the app's type-toggle convention, e.g. CalendarView's Week/4
// Weeks/Month row). "Space" is disabled once a single space is already
// selected above -- sorting by the one thing already filtered to is a
// no-op, so only Date sorting applies then (Iain, 2026-08-04).
function SortToggle({ sortBy, setSortBy, disableSpace }) {
  const OPTIONS = [{ key: 'date', label: 'Date' }, { key: 'space', label: 'Space' }]
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {OPTIONS.map(opt => {
        const isDisabled = disableSpace && opt.key === 'space'
        const on = sortBy === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            disabled={isDisabled}
            onClick={() => setSortBy(opt.key)}
            style={{
              padding: '0.5rem 0.9rem', borderRadius: 8, border: 'none',
              background: on ? 'var(--amber)' : 'var(--surface2)',
              color: on ? '#fff' : 'var(--text-dim)',
              fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              opacity: isDisabled ? 0.4 : 1,
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function SpaceBookingsTab() {
  const locations = useLocations()
  const [bookings, setBookings] = useState(null)
  const [events, setEvents] = useState(null)
  const [error, setError] = useState('')
  const [cancellingId, setCancellingId] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null) // booking pending confirmation
  const [cancelNote, setCancelNote] = useState('')
  const [locationFilter, setLocationFilter] = useState('') // '' = all spaces
  const [sortBy, setSortBy] = useState('date') // 'date' | 'space'
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const load = useCallback(async () => {
    const params = new URLSearchParams({ admin: '1' })
    if (locationFilter) params.set('location_id', locationFilter)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    const res = await authedFetch(`/api/spaces?${params.toString()}`)
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Could not load space bookings'); setBookings([]); setEvents([]); return }
    setBookings(data.bookings || [])
    setEvents(data.events || [])
  }, [locationFilter, dateFrom, dateTo])
  useEffect(() => { load() }, [load])

  useEffect(() => { if (locationFilter) setSortBy('date') }, [locationFilter])

  function openCancel(booking) {
    setCancelNote('')
    setCancelTarget(booking)
  }

  async function confirmCancel() {
    const booking = cancelTarget
    if (!booking) return
    setCancelTarget(null)
    setCancellingId(booking.id)
    const res = await authedFetch('/api/spaces', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: booking.id, admin_reason: cancelNote.trim() || undefined }),
    })
    setCancellingId(null)
    if (res.ok) load()
  }

  const rows = useMemo(() => {
    if (bookings === null || events === null) return null

    const fromBookings = bookings
      .filter(b => b.status !== 'cancelled')
      .map(b => {
        const start = sydneyDateTimeParts(b.starts_at)
        const end = sydneyDateTimeParts(b.ends_at)
        return {
          key: `booking:${b.id}`, source: 'personal', raw: b,
          location_name: b.locations?.name || 'Space',
          date: start.date, timeLabel: `${fmtUsageTime(start.time)} – ${fmtUsageTime(end.time)}`,
          sortKey: `${start.date}T${start.time}`,
          title: b.title, subtitle: `Booked by ${b.booked_by_name_at_time || 'a resident'}`,
          colour: 'var(--amber)', Icon: null,
        }
      })

    const fromEvents = events.map(e => {
      const meta = EVENT_HUB_META[e.hub_type] || { label: e.hub_type, colour: 'var(--amber)', Icon: null }
      const time = e.event_time ? e.event_time.slice(0, 5) : null
      const endTime = e.event_end_time ? e.event_end_time.slice(0, 5) : null
      return {
        key: `event:${e.id}`, source: 'event', raw: e,
        location_name: e.locations?.name || 'Space',
        date: e.event_date,
        timeLabel: time ? (endTime ? `${fmtUsageTime(time)} – ${fmtUsageTime(endTime)}` : fmtUsageTime(time)) : 'Time TBC',
        sortKey: `${e.event_date}T${time || '00:00'}`,
        title: e.title, subtitle: meta.label,
        colour: meta.colour, Icon: meta.Icon,
      }
    })

    return [...fromBookings, ...fromEvents]
  }, [bookings, events])

  const sortedRows = useMemo(() => {
    if (!rows) return null
    if (sortBy === 'space') {
      return [...rows].sort((a, b) =>
        a.location_name.localeCompare(b.location_name) || a.sortKey.localeCompare(b.sortKey)
      )
    }
    return [...rows].sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  }, [rows, sortBy])

  // One flat list when sorting by date; a section per space (A-Z, already
  // guaranteed by the sort above) when sorting by space.
  const grouped = useMemo(() => {
    if (!sortedRows) return null
    if (sortBy !== 'space') return [{ heading: null, rows: sortedRows }]
    const groups = []
    let current = null
    for (const row of sortedRows) {
      if (!current || current.heading !== row.location_name) {
        current = { heading: row.location_name, rows: [] }
        groups.push(current)
      }
      current.rows.push(row)
    }
    return groups
  }, [sortedRows, sortBy])

  return (
    <div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>
        Every room booking across the app — Show Time, Social, and Groups &amp; Clubs events, plus
        resident personal space bookings — in one place. Event bookings are managed from their own
        hub; cancelling a personal booking here notifies the resident.
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        <LocationFilterDropdown locations={locations} value={locationFilter} onChange={setLocationFilter} />
        <SortToggle sortBy={sortBy} setSortBy={setSortBy} disableSpace={!!locationFilter} />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div>
          <label style={labelStyle}>From</label>
          <input style={{ ...inputStyle, width: 'auto' }} type="date" value={dateFrom}
            max={dateTo || undefined}
            onClick={e => e.currentTarget.showPicker?.()}
            onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>To</label>
          <input style={{ ...inputStyle, width: 'auto' }} type="date" value={dateTo}
            min={dateFrom || undefined}
            onClick={e => e.currentTarget.showPicker?.()}
            onChange={e => setDateTo(e.target.value)} />
        </div>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo('') }} style={{
            padding: '0.55rem 0.8rem', borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--surface2)', color: 'var(--text-dim)', fontWeight: 600, fontSize: '0.82rem',
            fontFamily: 'inherit', cursor: 'pointer',
          }}>Clear dates</button>
        )}
      </div>

      {error && <div style={{ color: '#b91c1c', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</div>}

      {grouped === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
      ) : sortedRows.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem' }}>No room bookings found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {grouped.map((group, gi) => (
            <div key={group.heading || gi}>
              {group.heading && (
                <div style={{
                  fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.5rem',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  {group.heading}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {group.rows.map(row => (
                  <div key={row.key} style={{
                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
                    padding: '0.55rem 0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Line 1: icon + date/space, time right-aligned and muted */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                          {row.Icon && (
                            <span style={{ display: 'flex', color: row.colour, flexShrink: 0 }}>
                              <row.Icon size={13} />
                            </span>
                          )}
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {sortBy === 'space' ? fmtUsageDateShort(row.date) : `${row.location_name} · ${fmtUsageDateShort(row.date)}`}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)', fontWeight: 600, flexShrink: 0 }}>{row.timeLabel}</span>
                      </div>
                      {/* Line 2: colour-coded hub/booker label + title, combined */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: '0.15rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: row.colour, flexShrink: 0 }}>{row.subtitle}</span>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.title}</span>
                      </div>
                    </div>
                    {row.source === 'personal' && (
                      <button
                        onClick={() => openCancel(row.raw)}
                        disabled={cancellingId === row.raw.id}
                        style={{
                          flexShrink: 0, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
                          padding: '0.35rem 0.65rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--danger)',
                          cursor: cancellingId === row.raw.id ? 'default' : 'pointer', opacity: cancellingId === row.raw.id ? 0.6 : 1,
                        }}
                      >
                        {cancellingId === row.raw.id ? 'Cancelling…' : 'Cancel'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {cancelTarget && (
        <SlideOver title="Cancel this booking?" onClose={() => setCancelTarget(null)}>
          <div style={{ fontSize: '0.88rem', marginBottom: '1rem' }}>
            Cancel the booking of <strong>{cancelTarget.locations?.name || 'this space'}</strong>?
            The resident will be notified.
          </div>
          <div style={labelStyle}>Optional note to include</div>
          <textarea
            value={cancelNote}
            onChange={e => setCancelNote(e.target.value)}
            rows={3}
            placeholder="e.g. Needed for a maintenance job"
            style={{
              width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text)', fontSize: '0.95rem', boxSizing: 'border-box',
              fontFamily: 'inherit', resize: 'vertical', marginBottom: '1rem',
            }}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setCancelTarget(null)}
              style={{
                flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10,
                padding: '0.75rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)', cursor: 'pointer',
              }}
            >
              Keep booking
            </button>
            <button
              onClick={confirmCancel}
              style={{
                flex: 1, background: 'var(--danger)', border: 'none', borderRadius: 10,
                padding: '0.75rem', fontSize: '0.9rem', fontWeight: 600, color: '#fff', cursor: 'pointer',
              }}
            >
              Cancel booking
            </button>
          </div>
        </SlideOver>
      )}
    </div>
  )
}

// Venues and their bookings belong together (Iain, 2026-08-04: "they belong
// together") -- a simple 2-button sub-pill, same visual language as the
// Open/Closed toggle inside each venue's own settings.
function LocationsSubTabs({ view, setView }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
      {[['venues', 'Venues'], ['bookings', 'Bookings']].map(([v, txt]) => (
        <button key={v} type="button" onClick={() => setView(v)} style={{
          flex: 1, padding: '0.6rem', borderRadius: 10, fontFamily: 'inherit', fontSize: '0.88rem',
          fontWeight: 700, cursor: 'pointer', border: '2px solid',
          borderColor: view === v ? 'var(--amber)' : 'var(--border)',
          background: view === v ? 'var(--amber)18' : 'var(--surface)',
          color: view === v ? 'var(--amber-dark)' : 'var(--text-dim)',
        }}>{txt}</button>
      ))}
    </div>
  )
}

function LocationsTab() {
  const [view, setView]           = useState('venues') // 'venues' | 'bookings'
  const [locations, setLocations] = useState(null)
  const [newName, setNewName]     = useState('')
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState('')
  const [openId, setOpenId]       = useState(null)
  // Which venues can safely be deleted -- Iain, 2026-08-04: "possible to
  // delete a location as long as there are no historical bookings using
  // that location". The DB's own FKs would NOT stop this: events.location_id
  // is ON DELETE SET NULL and space_bookings.location_id is ON DELETE CASCADE
  // (migrations 058/072), so an unguarded delete would silently erase a
  // room's booking history rather than fail loudly -- this client-side check
  // is the only thing standing in the way of that. Also blocks deleting a
  // hub's currently-nominated venue (migration 073's hub_settings.location_id,
  // also ON DELETE SET NULL) since that would silently break that hub's
  // default room -- not literally "a booking", but the same silent-breakage
  // shape, so it gets the same guard.
  const [blockers, setBlockers] = useState(null)

  const load = useCallback(() => {
    // A-Z to match the dropdowns — sort_order isn't editable anywhere in the UI
    supabase.from('locations').select('*').order('name')
      .then(({ data }) => setLocations(data || []))
  }, [])
  useEffect(() => { load() }, [load])

  const loadBlockers = useCallback(async () => {
    const [evRes, sbRes, hsRes] = await Promise.all([
      supabase.from('events').select('location_id').not('location_id', 'is', null),
      supabase.from('space_bookings').select('location_id'),
      supabase.from('hub_settings').select('location_id').not('location_id', 'is', null),
    ])
    setBlockers({
      eventIds: new Set((evRes.data || []).map(r => r.location_id)),
      bookingIds: new Set((sbRes.data || []).map(r => r.location_id)),
      nominatedIds: new Set((hsRes.data || []).map(r => r.location_id)),
    })
  }, [])
  useEffect(() => { loadBlockers() }, [loadBlockers])

  function deleteBlockReason(locId) {
    if (!blockers) return 'Checking…'
    if (blockers.nominatedIds.has(locId)) return "This is a hub's nominated venue — change that first."
    if (blockers.eventIds.has(locId) || blockers.bookingIds.has(locId)) return 'Has historical bookings, so it can’t be deleted.'
    return null
  }

  async function add() {
    if (!newName.trim()) return
    setBusy(true); setError('')
    const maxSort = (locations || []).reduce((m, l) => Math.max(m, l.sort_order || 0), -1)
    const { error: e } = await supabase.from('locations').insert({ name: newName.trim(), sort_order: maxSort + 1 })
    setBusy(false)
    if (e) {
      // migration 071 added a unique index on lower(trim(name))
      setError(/duplicate key|locations_name_unique/.test(e.message)
        ? `There is already a venue called "${newName.trim()}".` : e.message)
      return
    }
    setNewName(''); load(); loadBlockers()
  }

  async function toggleArchived(loc) {
    await supabase.from('locations').update({ archived: !loc.archived }).eq('id', loc.id)
    load()
  }

  async function deleteLocation(loc) {
    const { error: e } = await supabase.from('locations').delete().eq('id', loc.id)
    if (e) return e.message
    setOpenId(null); load(); loadBlockers()
    return null
  }

  if (view === 'bookings') {
    return (
      <div>
        <LocationsSubTabs view={view} setView={setView} />
        <SpaceBookingsTab />
      </div>
    )
  }

  return (
    <div>
      <LocationsSubTabs view={view} setView={setView} />
      <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>
        On-site venues offered when creating any event, in any hub or club. Hiding a venue keeps it on
        past events but removes it from the picker.
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input style={inputStyle} value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }} placeholder="Add a venue…" />
        <button onClick={add} disabled={busy || !newName.trim()} style={{
          padding: '0 1.2rem', borderRadius: 10, border: 'none', background: 'var(--amber)', color: '#fff',
          fontWeight: 700, fontFamily: 'inherit', cursor: (busy || !newName.trim()) ? 'not-allowed' : 'pointer',
          opacity: (busy || !newName.trim()) ? 0.6 : 1,
        }}>Add</button>
      </div>
      {error && <div style={{ color: '#b91c1c', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</div>}

      {locations === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
      ) : locations.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem' }}>No venues yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {locations.map(l => (
            <LocationRow
              key={l.id} loc={l}
              expanded={openId === l.id}
              onToggle={() => setOpenId(openId === l.id ? null : l.id)}
              onArchive={() => toggleArchived(l)}
              onSaved={() => { setOpenId(null); load() }}
              deleteBlockReason={deleteBlockReason(l.id)}
              onDelete={() => deleteLocation(l)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// One venue: a summary row that expands into its settings.
function LocationRow({ loc, expanded, onToggle, onArchive, onSaved, deleteBlockReason, onDelete }) {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteErr, setDeleteErr] = useState('')

  // Reset the draft every time the row opens, so an abandoned edit never
  // reappears later looking like saved state.
  useEffect(() => {
    if (!expanded) { setForm(null); setErr(''); return }
    setForm({
      name:           loc.name || '',
      capacity:       loc.capacity ?? '',
      booking_status: loc.booking_status || 'open',
      closure_kind:   loc.closed_to ? 'range' : 'until',
      closed_from:    loc.closed_from || '',
      closed_to:      loc.closed_to || '',
      closed_reason:  loc.closed_reason || '',
      request_only:   !!loc.request_only,
    })
  }, [expanded, loc])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const closed = form?.booking_status === 'closed'

  async function save() {
    setErr('')
    if (!form.name.trim()) { setErr('Name is required'); return }
    if (form.capacity !== '' && (!Number.isFinite(Number(form.capacity)) || Number(form.capacity) < 1)) {
      setErr('Capacity must be a whole number of 1 or more'); return
    }
    // Shared with the server and the database CHECK — one rule, three places.
    const closureError = validateClosure({
      booking_status: form.booking_status,
      closed_from: form.closed_from || null,
      closed_to: form.closure_kind === 'range' ? (form.closed_to || null) : null,
      closed_reason: form.closed_reason || null,
    })
    if (closureError) { setErr(closureError); return }

    setSaving(true)
    const patch = {
      name: form.name.trim(),
      capacity: form.capacity === '' ? null : Number(form.capacity),
      booking_status: form.booking_status,
      // An open venue carries NO closure detail — the DB CHECK enforces this,
      // so clearing the fields here keeps the save from being rejected.
      closed_from:   closed ? form.closed_from : null,
      closed_to:     closed && form.closure_kind === 'range' ? (form.closed_to || null) : null,
      closed_reason: closed ? (form.closed_reason.trim() || null) : null,
      request_only:  !!form.request_only,
    }
    const { error } = await supabase.from('locations').update(patch).eq('id', loc.id)
    setSaving(false)
    if (error) {
      setErr(/duplicate key|locations_name_unique/.test(error.message)
        ? `There is already a venue called "${form.name.trim()}".` : error.message)
      return
    }
    onSaved()
  }

  async function doDelete() {
    setDeleting(true); setDeleteErr('')
    const err = await onDelete()
    setDeleting(false)
    if (err) { setDeleteErr(err); return }
    setConfirmingDelete(false)
  }

  const chip = (text, colour) => (
    <span style={{
      fontSize: '0.68rem', fontWeight: 700, padding: '0.12rem 0.45rem', borderRadius: 6,
      background: colour + '1f', color: colour, whiteSpace: 'nowrap',
    }}>{text}</span>
  )

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
      opacity: loc.archived ? 0.55 : 1, overflow: 'hidden',
    }}>
      <button type="button" onClick={onToggle} style={{
        width: '100%', padding: '0.7rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
        background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
      }}>
        <span style={{ fontWeight: 600, color: 'var(--text)', flex: 1 }}>{loc.name}</span>
        {/* Only render a chip when there is something to say — no empty slots. */}
        {loc.archived && chip('Hidden', 'var(--text-dim)')}
        {!loc.bookable && chip('Not bookable', 'var(--text-dim)')}
        {loc.booking_status === 'closed' && chip('Closed', '#b45309')}
        {loc.request_only && chip('Request Only', 'var(--amber-dark)')}
        {loc.capacity ? chip(`${loc.capacity} seats`, 'var(--teal)') : null}
        <span style={{
          fontSize: '0.7rem', color: 'var(--text-dim)', flexShrink: 0,
          transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s',
        }}>▼</span>
      </button>

      {expanded && form && (
        <div style={{ padding: '0 0.9rem 0.9rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 7rem', gap: '0.5rem', margin: '0.75rem 0' }}>
            <div>
              <label style={labelStyle}>Name</label>
              <input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Capacity</label>
              <input style={inputStyle} type="number" min="1" inputMode="numeric" placeholder="—"
                value={form.capacity} onChange={e => set('capacity', e.target.value)} />
            </div>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '-0.4rem', marginBottom: '0.75rem' }}>
            Capacity sets the default number of seats for events here. It doesn&apos;t stop anyone setting more.
          </div>

          <label style={labelStyle}>Image</label>
          <div style={{ marginBottom: '0.75rem' }}>
            <LocationImagePicker
              locationId={loc.id}
              imageUrl={loc.image_url}
              focalX={loc.image_focal_x}
              focalY={loc.image_focal_y}
              colour="var(--teal)"
              getToken={getAuthToken}
              onUpdated={onSaved}
            />
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '-0.4rem', marginBottom: '0.75rem' }}>
            Shown as a thumbnail wherever residents pick this space to book, both in Book a Space and Book by Location.
          </div>

          <label style={labelStyle}>Request Only</label>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.35rem' }}>
            {[[false, 'Anyone'], [true, 'Request Only']].map(([v, txt]) => (
              <button key={String(v)} type="button" onClick={() => set('request_only', v)} style={{
                flex: 1, padding: '0.5rem', borderRadius: 10, fontFamily: 'inherit', fontSize: '0.85rem',
                fontWeight: 700, cursor: 'pointer', border: '2px solid',
                borderColor: !!form.request_only === v ? 'var(--amber)' : 'var(--border)',
                background: !!form.request_only === v ? 'var(--amber)18' : 'var(--surface)',
                color: !!form.request_only === v ? 'var(--amber-dark)' : 'var(--text-dim)',
              }}>{txt}</button>
            ))}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
            Request Only spaces need Ingenia&apos;s sign-off. Admins can still book them directly here (you&apos;ll
            get a reminder to check with Ingenia); a resident booking one themselves via Book a Space has to
            confirm they already have that sign-off.
          </div>

          <label style={labelStyle}>Bookings</label>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: closed ? '0.75rem' : 0 }}>
            {[['open', 'Open'], ['closed', 'Closed']].map(([v, txt]) => (
              <button key={v} type="button" onClick={() => set('booking_status', v)} style={{
                flex: 1, padding: '0.5rem', borderRadius: 10, fontFamily: 'inherit', fontSize: '0.85rem',
                fontWeight: 700, cursor: 'pointer', border: '2px solid',
                borderColor: form.booking_status === v ? 'var(--amber)' : 'var(--border)',
                background: form.booking_status === v ? 'var(--amber)18' : 'var(--surface)',
                color: form.booking_status === v ? 'var(--amber-dark)' : 'var(--text-dim)',
              }}>{txt}</button>
            ))}
          </div>

          {/* Closure detail only exists when closed — nothing is rendered otherwise. */}
          {closed && (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                {[['until', 'Until further notice'], ['range', 'From / to']].map(([v, txt]) => (
                  <button key={v} type="button" onClick={() => set('closure_kind', v)} style={{
                    flex: 1, padding: '0.45rem', borderRadius: 10, fontFamily: 'inherit', fontSize: '0.8rem',
                    fontWeight: 600, cursor: 'pointer', border: '1.5px solid',
                    borderColor: form.closure_kind === v ? 'var(--amber)' : 'var(--border)',
                    background: form.closure_kind === v ? 'var(--amber)12' : 'var(--surface)',
                    color: form.closure_kind === v ? 'var(--amber-dark)' : 'var(--text-dim)',
                  }}>{txt}</button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: form.closure_kind === 'range' ? '1fr 1fr' : '1fr', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <div>
                  <label style={labelStyle}>From</label>
                  <input style={inputStyle} type="date" value={form.closed_from}
                    onClick={e => e.currentTarget.showPicker?.()}
                    onChange={e => set('closed_from', e.target.value)} />
                </div>
                {form.closure_kind === 'range' && (
                  <div>
                    <label style={labelStyle}>To</label>
                    <input style={inputStyle} type="date" value={form.closed_to}
                      min={form.closed_from || undefined}
                      onClick={e => e.currentTarget.showPicker?.()}
                      onChange={e => set('closed_to', e.target.value)} />
                  </div>
                )}
              </div>

              <label style={labelStyle}>Reason</label>
              <input style={inputStyle} value={form.closed_reason} maxLength={REASON_MAX}
                placeholder="e.g. Floor resurfacing"
                onChange={e => set('closed_reason', e.target.value)} />
              <div style={{
                fontSize: '0.72rem', textAlign: 'right', marginTop: '0.25rem',
                color: reasonRemaining(form.closed_reason) <= 10 ? '#b45309' : 'var(--text-dim)',
              }}>{reasonRemaining(form.closed_reason)} characters left</div>
            </>
          )}

          {err && <div style={{ color: '#b91c1c', fontSize: '0.82rem', marginTop: '0.6rem' }}>{err}</div>}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem' }}>
            <button onClick={save} disabled={saving} style={{
              flex: 1, padding: '0.6rem', borderRadius: 10, border: 'none', background: 'var(--teal)',
              color: '#fff', fontWeight: 700, fontFamily: 'inherit', fontSize: '0.9rem',
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            }}>{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={onToggle} style={{
              padding: '0.6rem 1rem', borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--surface2)', color: 'var(--text)', fontWeight: 600,
              fontFamily: 'inherit', fontSize: '0.9rem', cursor: 'pointer',
            }}>Cancel</button>
            <button onClick={onArchive} style={{
              padding: '0.6rem 1rem', borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--surface2)', color: 'var(--text-dim)', fontWeight: 600,
              fontFamily: 'inherit', fontSize: '0.9rem', cursor: 'pointer',
            }}>{loc.archived ? 'Show' : 'Hide'}</button>
            <button
              onClick={() => setConfirmingDelete(true)}
              disabled={!!deleteBlockReason}
              title={deleteBlockReason || ''}
              style={{
                padding: '0.6rem 1rem', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--surface2)', color: deleteBlockReason ? 'var(--text-dim)' : 'var(--danger)',
                fontWeight: 600, fontFamily: 'inherit', fontSize: '0.9rem',
                cursor: deleteBlockReason ? 'not-allowed' : 'pointer', opacity: deleteBlockReason ? 0.5 : 1,
              }}>Delete</button>
          </div>
          {deleteBlockReason && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>{deleteBlockReason}</div>
          )}
        </div>
      )}

      {confirmingDelete && (
        <SlideOver title="Delete this venue?" onClose={() => setConfirmingDelete(false)}>
          <div style={{ fontSize: '0.88rem', marginBottom: '1.25rem' }}>
            Permanently delete <strong>{loc.name}</strong>? This can’t be undone.
          </div>
          {deleteErr && <div style={{ color: '#b91c1c', fontSize: '0.85rem', marginBottom: '1rem' }}>{deleteErr}</div>}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setConfirmingDelete(false)}
              style={{
                flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10,
                padding: '0.75rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)', cursor: 'pointer',
              }}
            >
              Keep venue
            </button>
            <button
              onClick={doDelete}
              disabled={deleting}
              style={{
                flex: 1, background: 'var(--danger)', border: 'none', borderRadius: 10,
                padding: '0.75rem', fontSize: '0.9rem', fontWeight: 600, color: '#fff',
                cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.6 : 1,
              }}
            >
              {deleting ? 'Deleting…' : 'Delete venue'}
            </button>
          </div>
        </SlideOver>
      )}
    </div>
  )
}
