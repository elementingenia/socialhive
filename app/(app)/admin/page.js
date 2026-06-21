'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { useRouter } from 'next/navigation'

// ── Constants ────────────────────────────────────────────────────────────────
const HUB_TYPES = [
  { value: 'movie',    label: 'Cinema',    icon: '🎬' },
  { value: 'social',   label: 'Social',    icon: '🎉' },
  { value: 'outings',  label: 'Outings',   icon: '🚌' },
  { value: 'bookclub', label: 'Book Club', icon: '📚' },
]
const HUB_COLOUR = { movie:'var(--teal)', social:'var(--terracotta)', outings:'var(--green)', bookclub:'var(--purple)' }
const TABS = ['Events', 'Notices', 'Members', 'Bar', 'Books', 'Tools']

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
function SlideOver({ title, onClose, children }) {
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:200 }} />
      <div style={{ position:'fixed', bottom:0, left:0, right:0, background:'var(--bg)', borderRadius:'20px 20px 0 0', zIndex:201, maxHeight:'92vh', display:'flex', flexDirection:'column' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1rem 1.25rem 0.75rem', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontWeight:700, fontSize:'1rem' }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'1.3rem', cursor:'pointer', color:'var(--text-dim)', lineHeight:1 }}>✕</button>
        </div>
        <div style={{ overflowY:'auto', padding:'1.25rem', flex:1 }}>{children}</div>
      </div>
    </>
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

// ── EVENT FORM ────────────────────────────────────────────────────────────────
function EventForm({ event, onSave, onDelete, onClose }) {
  const isEdit = !!event?.id
  const [movies, setMovies] = useState([])
  const [form, setForm] = useState({
    title:       event?.title       || '',
    hub_type:    event?.hub_type    || 'movie',
    event_date:  event?.event_date  || '',
    event_time:  event?.event_time  || '',
    location:    event?.location    || '',
    description: event?.description || '',
    max_seats:   event?.max_seats   != null ? String(event.max_seats) : '30',
    cost:        event?.cost        != null ? String(event.cost)      : '0',
    is_public:   event?.is_public   ?? true,
    movie_id:    event?.movie_id    || '',
  })
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirm,  setConfirm]  = useState(false)
  const [err,      setErr]      = useState('')

  useEffect(() => {
    supabase.from('movies').select('id, title').eq('we_own', false).order('title').then(({ data }) => setMovies(data || []))
  }, [])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.title.trim())      return setErr('Title is required')
    if (!form.event_date.trim()) return setErr('Date is required')
    setSaving(true); setErr('')
    const payload = {
      title:       form.title.trim(),
      hub_type:    form.hub_type,
      event_date:  form.event_date,
      event_time:  form.event_time || null,
      location:    form.location   || null,
      description: form.description || null,
      max_seats:   parseInt(form.max_seats) || 30,
      cost:        parseFloat(form.cost)    || 0,
      is_public:   form.is_public,
      movie_id:    form.hub_type === 'movie' && form.movie_id ? form.movie_id : null,
    }
    const { error } = isEdit
      ? await supabase.from('events').update(payload).eq('id', event.id)
      : await supabase.from('events').insert(payload)
    if (error) { setErr(error.message); setSaving(false); return }
    onSave()
  }

  async function del() {
    setDeleting(true)
    await supabase.from('events').update({ archived: true }).eq('id', event.id)
    onDelete()
  }

  const colour = HUB_COLOUR[form.hub_type] || 'var(--teal)'

  return (
    <div>
      <Field label="Hub">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'0.4rem' }}>
          {HUB_TYPES.map(h => (
            <button key={h.value} onClick={() => set('hub_type', h.value)}
              style={{ padding:'0.6rem 0.25rem', borderRadius:'10px', border:'2px solid', borderColor:form.hub_type===h.value ? HUB_COLOUR[h.value] : 'var(--border)', background:form.hub_type===h.value ? HUB_COLOUR[h.value]+'20' : 'var(--surface)', cursor:'pointer', fontSize:'0.75rem', fontWeight:600, color:form.hub_type===h.value ? HUB_COLOUR[h.value] : 'var(--text-dim)' }}>
              {h.icon}<br/>{h.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Title"><input style={inputStyle} value={form.title} onChange={e=>set('title',e.target.value)} placeholder="Event name" /></Field>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
        <Field label="Date"><input type="date" style={inputStyle} value={form.event_date} onChange={e=>set('event_date',e.target.value)} /></Field>
        <Field label="Time"><input type="time" style={inputStyle} value={form.event_time} onChange={e=>set('event_time',e.target.value)} /></Field>
      </div>
      <Field label="Location"><input style={inputStyle} value={form.location} onChange={e=>set('location',e.target.value)} placeholder="Optional" /></Field>
      <Field label="Description"><textarea style={{ ...inputStyle, minHeight:80, resize:'vertical' }} value={form.description} onChange={e=>set('description',e.target.value)} placeholder="Optional" /></Field>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
        <Field label="Max Seats"><input type="number" style={inputStyle} value={form.max_seats} onChange={e=>set('max_seats',e.target.value)} min="1" /></Field>
        <Field label="Cost ($)"><input type="number" style={inputStyle} value={form.cost} onChange={e=>set('cost',e.target.value)} min="0" step="0.50" /></Field>
      </div>
      {form.hub_type === 'movie' && (
        <Field label="Linked Film">
          <select style={inputStyle} value={form.movie_id} onChange={e=>set('movie_id',e.target.value)}>
            <option value="">— No film linked —</option>
            {movies.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </Field>
      )}
      <Field label="">
        <label style={{ display:'flex', alignItems:'center', gap:'0.6rem', fontSize:'0.9rem', cursor:'pointer' }}>
          <input type="checkbox" checked={form.is_public} onChange={e=>set('is_public',e.target.checked)} style={{ width:18, height:18 }} />
          Visible on public calendar
        </label>
      </Field>
      {err && <div style={{ color:'var(--danger)', fontSize:'0.85rem', marginBottom:'0.75rem' }}>{err}</div>}
      <button onClick={save} disabled={saving} style={btnPrimary(colour)}>{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Event'}</button>
      {isEdit && !confirm && (
        <button onClick={()=>setConfirm(true)} style={{ ...btnDanger, background:'none', color:'var(--danger)', border:'1px solid var(--danger)', marginTop:'0.5rem' }}>Archive Event</button>
      )}
      {confirm && (
        <div style={{ marginTop:'0.5rem', background:'var(--danger)10', borderRadius:'10px', padding:'0.75rem', border:'1px solid var(--danger)' }}>
          <div style={{ fontSize:'0.85rem', marginBottom:'0.5rem' }}>Archive this event? Existing bookings are preserved.</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' }}>
            <button onClick={()=>setConfirm(false)} style={{ padding:'0.65rem', borderRadius:'10px', border:'1px solid var(--border)', background:'var(--surface)', cursor:'pointer', fontWeight:600 }}>Cancel</button>
            <button onClick={del} disabled={deleting} style={{ padding:'0.65rem', borderRadius:'10px', background:'var(--danger)', color:'#fff', border:'none', cursor:'pointer', fontWeight:700 }}>{deleting?'Archiving…':'Archive'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── EVENTS TAB ────────────────────────────────────────────────────────────────
function EventsTab() {
  const [events,  setEvents]  = useState([])
  const [loading, setLoading] = useState(true)
  const [hubFilter, setHub]   = useState('all')
  const [selected,  setSelected] = useState(null)  // null=closed, {}=new, event=edit
  const [showPast, setShowPast] = useState(false)

  const load = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0]
    let q = supabase.from('events').select('id, title, event_date, event_time, hub_type, max_seats, cost, is_public, location').eq('archived', false).order('event_date', { ascending: true })
    if (!showPast) q = q.gte('event_date', today)
    const { data } = await q
    setEvents(data || [])
    setLoading(false)
  }, [showPast])

  useEffect(() => { load() }, [load])

  const filtered = hubFilter === 'all' ? events : events.filter(e => e.hub_type === hubFilter)
  const today = new Date(); today.setHours(0,0,0,0)

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
        <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>
          {['all',...HUB_TYPES.map(h=>h.value)].map(v => (
            <button key={v} onClick={()=>setHub(v)}
              style={{ padding:'0.35rem 0.75rem', borderRadius:'20px', border:'1px solid', borderColor:hubFilter===v?'var(--teal)':'var(--border)', background:hubFilter===v?'var(--teal)':'var(--surface)', color:hubFilter===v?'#fff':'var(--text)', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}>
              {v==='all'?'All':HUB_TYPES.find(h=>h.value===v)?.icon + ' ' + HUB_TYPES.find(h=>h.value===v)?.label}
            </button>
          ))}
        </div>
        <button onClick={()=>setSelected({})} style={{ background:'var(--teal)', color:'#fff', border:'none', borderRadius:'10px', padding:'0.5rem 0.9rem', fontSize:'0.82rem', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>+ New</button>
      </div>

      <label style={{ display:'flex', alignItems:'center', gap:'0.5rem', fontSize:'0.82rem', color:'var(--text-dim)', marginBottom:'0.85rem', cursor:'pointer' }}>
        <input type="checkbox" checked={showPast} onChange={e=>setShowPast(e.target.checked)} />
        Include past events
      </label>

      {loading ? <div style={{ color:'var(--text-dim)', textAlign:'center', padding:'2rem' }}>Loading…</div>
       : filtered.length === 0 ? <div style={{ color:'var(--text-dim)', textAlign:'center', padding:'2rem', fontSize:'0.9rem' }}>No events</div>
       : (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          {filtered.map(e => {
            const col = HUB_COLOUR[e.hub_type] || 'var(--teal)'
            const hub = HUB_TYPES.find(h=>h.value===e.hub_type)
            const isPast = new Date(e.event_date+'T00:00:00') < today
            return (
              <div key={e.id} onClick={()=>setSelected(e)}
                style={{ background:'var(--surface)', borderRadius:'12px', border:'1px solid var(--border)', padding:'0.8rem 1rem', cursor:'pointer', borderLeft:'4px solid '+col, opacity:isPast?0.65:1, display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'0.5rem' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:'0.9rem', marginBottom:'0.2rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{e.title}</div>
                  <div style={{ fontSize:'0.78rem', color:'var(--text-dim)' }}>{fmtDate(e.event_date)}{e.event_time?' · '+fmtTime(e.event_time):''}{e.location?' · '+e.location:''}</div>
                </div>
                <div style={{ display:'flex', gap:'0.3rem', flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
                  <Badge label={hub?.icon+' '+hub?.label} colour={col} />
                  {e.cost > 0 && <Badge label={'$'+parseFloat(e.cost).toFixed(2)} colour="var(--amber-dark)" />}
                  {!e.is_public && <Badge label="Private" colour="var(--text-dim)" />}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {selected !== null && (
        <SlideOver title={selected.id ? 'Edit Event' : 'New Event'} onClose={()=>setSelected(null)}>
          <EventForm event={selected.id ? selected : null} onSave={()=>{setSelected(null);load()}} onDelete={()=>{setSelected(null);load()}} onClose={()=>setSelected(null)} />
        </SlideOver>
      )}
    </div>
  )
}

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

// ── MEMBERS TAB ───────────────────────────────────────────────────────────────
function MembersTab() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const { member: me } = useUser()

  useEffect(()=>{
    supabase.from('members').select('id, name, username, status, is_admin, bar_opt_in, joined_date').order('name').then(({data})=>{ setMembers(data||[]); setLoading(false) })
  }, [])

  async function toggle(id, field, val) {
    await supabase.from('members').update({ [field]: val }).eq('id', id)
    setMembers(ms => ms.map(m => m.id===id ? {...m, [field]:val} : m))
  }

  const filtered = members.filter(m =>
    !search || m.name?.toLowerCase().includes(search.toLowerCase()) || m.username?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div style={{ marginBottom:'0.85rem', display:'flex', gap:'0.5rem', alignItems:'center' }}>
        <input style={{ ...inputStyle, flex:1 }} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search members…" />
        <span style={{ fontSize:'0.82rem', color:'var(--text-dim)', whiteSpace:'nowrap' }}>{filtered.length} members</span>
      </div>
      {loading ? <div style={{ textAlign:'center', padding:'2rem', color:'var(--text-dim)' }}>Loading…</div> : (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          {filtered.map(m => (
            <div key={m.id} style={{ background:'var(--surface)', borderRadius:'12px', border:'1px solid var(--border)', padding:'0.85rem 1rem' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'0.5rem' }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:'0.9rem' }}>{m.name} {m.id===me?.id && <span style={{ fontSize:'0.7rem', color:'var(--text-dim)' }}>(you)</span>}</div>
                  <div style={{ fontSize:'0.78rem', color:'var(--text-dim)' }}>@{m.username}</div>
                </div>
                <div style={{ display:'flex', gap:'0.4rem', alignItems:'center' }}>
                  <button
                    onClick={()=> m.id!==me?.id && toggle(m.id,'is_admin',!m.is_admin)}
                    style={{ padding:'0.3rem 0.6rem', borderRadius:'8px', border:'1px solid', borderColor:m.is_admin?'var(--amber)':'var(--border)', background:m.is_admin?'var(--amber)20':'var(--surface)', fontSize:'0.72rem', fontWeight:700, cursor:m.id===me?.id?'default':'pointer', color:m.is_admin?'var(--amber-dark)':'var(--text-dim)', opacity:m.id===me?.id?0.5:1 }}>
                    {m.is_admin ? '⚙️ Admin' : 'Admin'}
                  </button>
                  <button
                    onClick={()=>toggle(m.id,'bar_opt_in',!m.bar_opt_in)}
                    style={{ padding:'0.3rem 0.6rem', borderRadius:'8px', border:'1px solid', borderColor:m.bar_opt_in?'var(--green)':'var(--border)', background:m.bar_opt_in?'var(--green)20':'var(--surface)', fontSize:'0.72rem', fontWeight:700, cursor:'pointer', color:m.bar_opt_in?'var(--green)':'var(--text-dim)' }}>
                    {m.bar_opt_in ? '🍺 Bar' : 'Bar'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
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
              style={{ padding:'0.5rem 0.25rem', borderRadius:'10px', border:'2px solid', borderColor:form.category===c.value?'var(--amber)':'var(--border)', background:form.category===c.value?'var(--amber)20':'var(--surface)', cursor:'pointer', fontSize:'0.72rem', fontWeight:600, color:form.category===c.value?'var(--amber-dark)':'var(--text-dim)', textAlign:'center' }}>
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
      <button onClick={save} disabled={saving} style={btnPrimary('var(--amber)')}>
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
              style={{ padding:'0.3rem 0.65rem', borderRadius:'20px', border:'1px solid', borderColor:catFilter===v?'var(--amber)':'var(--border)', background:catFilter===v?'var(--amber)':'var(--surface)', color:catFilter===v?'#fff':'var(--text)', fontSize:'0.72rem', fontWeight:600, cursor:'pointer' }}>
              {v==='all'?'All':BAR_CATS.find(c=>c.value===v)?.icon+' '+BAR_CATS.find(c=>c.value===v)?.label}
            </button>
          ))}
        </div>
        <button onClick={()=>setSelected({})} style={{ background:'var(--amber)', color:'#fff', border:'none', borderRadius:'10px', padding:'0.5rem 0.9rem', fontSize:'0.82rem', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>+ Add</button>
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
              <div style={{ fontWeight:800, color:'var(--amber-dark)', marginRight:'0.5rem' }}>${parseFloat(p.price).toFixed(2)}</div>
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


// ── BOOKS TAB ─────────────────────────────────────────────────────────────────
function BookForm({ book, onSave, onClose }) {
  const isEdit = !!book?.id
  const [form, setForm] = useState({
    title:     book?.title     || '',
    author:    book?.author    || '',
    cover_url: book?.cover_url || '',
    summary:   book?.summary   || '',
    rating:    book?.rating    || '',
  })
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirm,  setConfirm]  = useState(false)
  const [err,      setErr]      = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.title.trim()) return setErr('Title is required')
    setSaving(true); setErr('')
    const payload = {
      title:     form.title.trim(),
      author:    form.author    || null,
      cover_url: form.cover_url || null,
      summary:   form.summary   || null,
      rating:    form.rating    || null,
    }
    const { error } = isEdit
      ? await supabase.from('books').update(payload).eq('id', book.id)
      : await supabase.from('books').insert(payload)
    if (error) { setErr(error.message); setSaving(false); return }
    onSave()
  }

  async function del() {
    setDeleting(true)
    await supabase.from('books').delete().eq('id', book.id)
    onSave()
  }

  return (
    <div>
      <Field label="Title"><input style={inputStyle} value={form.title} onChange={e=>set('title',e.target.value)} placeholder="Book title" /></Field>
      <Field label="Author"><input style={inputStyle} value={form.author} onChange={e=>set('author',e.target.value)} placeholder="Author name" /></Field>
      <Field label="Cover Image URL"><input style={inputStyle} value={form.cover_url} onChange={e=>set('cover_url',e.target.value)} placeholder="https://…" /></Field>
      <Field label="Rating"><input style={inputStyle} value={form.rating} onChange={e=>set('rating',e.target.value)} placeholder="e.g. 4.2" /></Field>
      <Field label="Summary / Description">
        <textarea style={{ ...inputStyle, minHeight:100, resize:'vertical' }} value={form.summary} onChange={e=>set('summary',e.target.value)} placeholder="Brief description…" />
      </Field>
      {err && <div style={{ color:'var(--danger)', fontSize:'0.85rem', marginBottom:'0.75rem' }}>{err}</div>}
      <button onClick={save} disabled={saving} style={btnPrimary('var(--purple)')}>
        {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Book'}
      </button>
      {isEdit && !confirm && (
        <button onClick={()=>setConfirm(true)} style={{ ...btnDanger, background:'none', color:'var(--danger)', border:'1px solid var(--danger)', marginTop:'0.5rem' }}>Remove Book</button>
      )}
      {confirm && (
        <div style={{ marginTop:'0.5rem', background:'var(--danger)10', borderRadius:'10px', padding:'0.75rem', border:'1px solid var(--danger)' }}>
          <div style={{ fontSize:'0.85rem', marginBottom:'0.5rem' }}>Remove this book from the reading list?</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' }}>
            <button onClick={()=>setConfirm(false)} style={{ padding:'0.65rem', borderRadius:'10px', border:'1px solid var(--border)', background:'var(--surface)', cursor:'pointer', fontWeight:600 }}>Cancel</button>
            <button onClick={del} disabled={deleting} style={{ padding:'0.65rem', borderRadius:'10px', background:'var(--danger)', color:'#fff', border:'none', cursor:'pointer', fontWeight:700 }}>{deleting?'Removing…':'Remove'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function BooksTab() {
  const [books,    setBooks]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)
  const [search,   setSearch]   = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('books').select('*').order('added_at', { ascending: false })
    setBooks(data || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = books.filter(b =>
    !search || b.title?.toLowerCase().includes(search.toLowerCase()) || b.author?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', gap:'0.5rem' }}>
        <input style={{ ...inputStyle, flex:1 }} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search books…" />
        <button onClick={()=>setSelected({})} style={{ background:'var(--purple)', color:'#fff', border:'none', borderRadius:'10px', padding:'0.5rem 0.9rem', fontSize:'0.82rem', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>+ Add</button>
      </div>
      {loading ? <div style={{ textAlign:'center', padding:'2rem', color:'var(--text-dim)' }}>Loading…</div>
       : filtered.length === 0 ? <div style={{ textAlign:'center', padding:'2rem', color:'var(--text-dim)', fontSize:'0.9rem' }}>No books yet</div>
       : (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          {filtered.map(b => (
            <div key={b.id} onClick={()=>setSelected(b)}
              style={{ background:'var(--surface)', borderRadius:'12px', border:'1px solid var(--border)', padding:'0.8rem 1rem', cursor:'pointer', display:'flex', alignItems:'center', gap:'0.85rem' }}>
              {b.cover_url
                ? <img src={b.cover_url} alt={b.title} style={{ width:40, height:56, objectFit:'cover', borderRadius:'5px', flexShrink:0 }} />
                : <div style={{ width:40, height:56, borderRadius:'5px', background:'var(--purple)20', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem', flexShrink:0 }}>📖</div>
              }
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:'0.9rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{b.title}</div>
                {b.author && <div style={{ fontSize:'0.78rem', color:'var(--text-dim)' }}>by {b.author}</div>}
              </div>
              {b.rating && <div style={{ fontSize:'0.82rem', color:'var(--purple)', fontWeight:700, flexShrink:0 }}>★ {b.rating}</div>}
            </div>
          ))}
        </div>
      )}
      {selected !== null && (
        <SlideOver title={selected.id ? 'Edit Book' : 'Add Book'} onClose={()=>setSelected(null)}>
          <BookForm book={selected.id ? selected : null} onSave={()=>{setSelected(null);load()}} onClose={()=>setSelected(null)} />
        </SlideOver>
      )}
    </div>
  )
}



// ── BAR TAB (sub-tabs wrapper) ────────────────────────────────────────────────
function BarTab() {
  const [sub, setSub] = useState('Products')
  return (
    <div>
      <div style={{ display:'flex', gap:'0.4rem', marginBottom:'1rem' }}>
        {['Products', 'Reconcile'].map(s => (
          <button key={s} onClick={() => setSub(s)}
            style={{ padding:'0.35rem 0.85rem', borderRadius:'20px', border:'1px solid',
              borderColor: sub===s ? 'var(--amber)' : 'var(--border)',
              background:  sub===s ? 'var(--amber)' : 'var(--surface)',
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
        <span style={{ color:'var(--amber-dark)' }}>${member.total.toFixed(2)}</span>
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

  const [settleId,     setSettleId]     = useState('')
  const [settlePrev,   setSettlePrev]   = useState(null)
  const [settling,     setSettling]     = useState(false)
  const [settledOk,    setSettledOk]    = useState(false)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session.access_token}` }
  }

  async function loadPreview() {
    const h = await authHeader()
    const data = await fetch('/api/admin/bar-reconcile', { headers: h }).then(r => r.json())
    setPreview(data)
    setLoadingPreview(false)
  }

  useEffect(() => { loadPreview() }, [])

  function selectSettle(mid) {
    setSettleId(mid)
    setSettledOk(false)
    if (!mid || !preview?.members) { setSettlePrev(null); return }
    setSettlePrev(preview.members.find(m => m.member_id === mid) || null)
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
    setSettledOk(true); setSettlePrev(null); setSettleId('')
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
    setRecon(r => ({
      ...r,
      members: r.members.map(m => m.member_id === member.member_id ? { ...m, paid: true, paid_at: data.paid_at } : m)
    }))
  }

  const card = { background:'var(--surface)', borderRadius:'14px', border:'1px solid var(--border)', padding:'1rem', marginBottom:'1rem' }
  const heading = { fontWeight:700, fontSize:'0.95rem', marginBottom:'0.75rem' }

  return (
    <div>
      {/* ── SETTLE SINGLE ACCOUNT ── */}
      <div style={card}>
        <div style={heading}>Settle an Account</div>
        <select value={settleId}
          onChange={e => selectSettle(e.target.value)}
          style={{ ...inputStyle, marginBottom:'0.75rem' }}>
          <option value="">Select a member…</option>
          {(preview?.members || []).map(m => <option key={m.member_id} value={m.member_id}>{m.name}</option>)}
        </select>

        {settleId && !settlePrev && (
          <div style={{ color:'var(--text-dim)', fontSize:'0.85rem' }}>No outstanding tab for this member.</div>
        )}

        {settlePrev && (
          <>
            <MemberBreakdown member={settlePrev} />
            <button onClick={settleAccount} disabled={settling}
              style={{ width:'100%', marginTop:'0.75rem', background:'var(--amber)', color:'#fff', border:'none', borderRadius:'10px', padding:'0.75rem', fontWeight:700, fontSize:'0.9rem', cursor:'pointer', opacity:settling?0.7:1 }}>
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
              <strong style={{ color:'var(--amber-dark)' }}>${(preview.total_amount||0).toFixed(2)}</strong> outstanding
            </div>
            {preview.members.map(m => (
              <div key={m.member_id} style={{ marginBottom:'0.4rem', padding:'0.5rem 0.75rem', background:'var(--surface2)', borderRadius:'10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontWeight:600, fontSize:'0.88rem' }}>{m.name}</span>
                <span style={{ fontWeight:700, color:'var(--amber-dark)', fontSize:'0.88rem' }}>${m.total.toFixed(2)}</span>
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
              <strong style={{ color:'var(--amber-dark)' }}>${recon.total_amount.toFixed(2)}</strong> total
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
                  <div style={{ fontWeight:800, color:'var(--amber-dark)', marginRight:'0.5rem' }}>${m.total.toFixed(2)}</div>
                  {m.paid
                    ? <span style={{ fontSize:'0.8rem', fontWeight:700, color:'var(--green)', background:'var(--green)20', padding:'0.3rem 0.6rem', borderRadius:'8px', whiteSpace:'nowrap' }}>✓ Paid</span>
                    : <button onClick={() => markPaid(recon.reconciliation_id, m)}
                        style={{ background:'var(--amber)', color:'#fff', border:'none', borderRadius:'8px', padding:'0.35rem 0.7rem', fontSize:'0.8rem', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
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

    const { data:{ session } } = await supabase.auth.getSession()
    let runningEnriched = 0
    let runningFailed   = 0
    let runningSkipped  = 0
    let batches = 0
    let allFailures = []

    while (!stopRef.current) {
      try {
        const res  = await fetch('/api/admin/enrich-dvd?limit=50', { headers:{ Authorization:`Bearer ${session.access_token}` } })
        const data = await res.json()
        batches++
        runningEnriched += (data.enriched || 0)
        runningFailed   += (data.failed   || 0)
        runningSkipped  += (data.skipped  || 0)

        // Collect failures (no_match + api_error) from this batch
        const batchFails = (data.details || []).filter(d => d.status !== 'ok')
        allFailures = [...allFailures, ...batchFails]

        setLastBatch(data)
        setTotalEnriched(runningEnriched)
        setTotalFailed(runningFailed)
        setTotalSkipped(runningSkipped)
        setBatchCount(batches)
        setFailures([...allFailures])

        if (!data.error && data.processed === 0) {
          setStatus('done')
          return
        }
        if (data.error) { setStatus('error'); return }

        await new Promise(r => setTimeout(r, 800))
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
    const { data:{ session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/enrich-dvd?catalogue=true', { headers:{ Authorization:`Bearer ${session.access_token}` } })
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

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { member, loading } = useUser()
  const router = useRouter()
  const [tab, setTab] = useState('Events')

  useEffect(()=>{
    if (!loading && member && !member.is_admin) router.replace('/home')
  }, [member, loading, router])

  if (loading || !member) return null
  if (!member.is_admin) return null

  return (
    <div style={{ padding:'1rem 1rem 6rem' }}>
      {/* Tab bar */}
      <div style={{ display:'flex', gap:'0.4rem', marginBottom:'1.25rem', overflowX:'auto', paddingBottom:'0.25rem' }}>
        {TABS.map(t => (
          <button key={t} onClick={()=>setTab(t)}
            style={{ padding:'0.5rem 1rem', borderRadius:'20px', border:'1px solid', borderColor:tab===t?'var(--teal)':'var(--border)', background:tab===t?'var(--teal)':'var(--surface)', color:tab===t?'#fff':'var(--text)', fontWeight:600, fontSize:'0.82rem', cursor:'pointer', whiteSpace:'nowrap' }}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Events'  && <EventsTab />}
      {tab === 'Notices' && <NoticesTab />}
      {tab === 'Members' && <MembersTab />}
      {tab === 'Bar'     && <BarTab />}
      {tab === 'Books'   && <BooksTab />}
      {tab === 'Tools'   && <ToolsTab />}
    </div>
  )
}
