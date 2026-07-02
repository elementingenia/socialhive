'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import { useRouter } from 'next/navigation'
import { computeFreeCost } from '@/lib/freeCost'
import { PageTextsIcon, MembersIcon, MoviesIcon, BarIcon, ToolsIcon } from '@/components/NavIcons'
import RichEditor, { bbToHtml } from '@/components/RichEditor'

// ── Constants ────────────────────────────────────────────────────────────────
const HUB_TYPES = [
  { value: 'movie',    label: 'Cinema',    icon: '🎬' },
  { value: 'social',   label: 'Social',    icon: '🎉' },
  { value: 'bookclub', label: 'Book Club', icon: '📚' },
]
const HUB_COLOUR = { movie:'var(--teal)', social:'var(--terracotta)', bookclub:'var(--purple)' }
const SECTIONS = [
  { key: 'PageTexts', label: 'Page Texts', Icon: PageTextsIcon },
  { key: 'Members',   label: 'Members',    Icon: MembersIcon },
  { key: 'Movies',    label: 'Movies',     Icon: MoviesIcon },
  { key: 'Bar',       label: 'Bar',        Icon: BarIcon },
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
    supabase.from('members').select('id, name, username, status, is_admin, hide_name, joined_date').order('name').then(({data})=>{ setMembers(data||[]); setLoading(false) })
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
                <div style={{ display:'flex', gap:'0.4rem', alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end' }}>
                  <button
                    onClick={()=> m.id!==me?.id && toggle(m.id,'is_admin',!m.is_admin)}
                    style={{ padding:'0.3rem 0.6rem', borderRadius:'8px', border:'1px solid', borderColor:m.is_admin?'var(--amber)':'var(--border)', background:m.is_admin?'var(--amber)20':'var(--surface)', fontSize:'0.72rem', fontWeight:700, cursor:m.id===me?.id?'default':'pointer', color:m.is_admin?'var(--amber-dark)':'var(--text-dim)', opacity:m.id===me?.id?0.5:1 }}>
                    {m.is_admin ? '⚙️ Admin' : 'Admin'}
                  </button>
                  <button
                    onClick={()=> toggle(m.id,'hide_name',!m.hide_name)}
                    title="Hidden members are not shown in attendee lists"
                    style={{ padding:'0.3rem 0.6rem', borderRadius:'8px', border:'1px solid', borderColor:m.hide_name?'var(--purple)':'var(--border)', background:m.hide_name?'var(--purple)20':'var(--surface)', fontSize:'0.72rem', fontWeight:700, cursor:'pointer', color:m.hide_name?'var(--purple)':'var(--text-dim)' }}>
                    {m.hide_name ? '🔒 Private' : 'Private'}
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
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session.access_token}` }
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
        <div style={{ ...card, borderColor:'var(--amber)' }}>
          <div style={{ ...heading, color:'var(--amber-dark)' }}>⚠ Outstanding Balances</div>
          {outstanding.map(period => (
            <div key={period.reconciliation_id} style={{ marginBottom:'0.75rem' }}>
              <div style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.35rem' }}>
                {fmtDate(period.period_start)} – {fmtDate(period.period_end)}
              </div>
              {period.members.map(m => (
                <div key={m.member_id} style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.6rem 0.75rem', background:'var(--surface2)', borderRadius:'10px', marginBottom:'0.3rem' }}>
                  <div style={{ flex:1, fontWeight:600, fontSize:'0.88rem' }}>{m.name}</div>
                  <div style={{ fontWeight:800, color:'var(--amber-dark)', fontSize:'0.88rem' }}>${m.total.toFixed(2)}</div>
                  <button onClick={() => markOutstandingPaid(period.reconciliation_id, m)}
                    style={{ background:'var(--amber)', color:'#fff', border:'none', borderRadius:'8px', padding:'0.35rem 0.7rem', fontSize:'0.78rem', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
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

    let runningEnriched = 0
    let runningFailed   = 0
    let runningSkipped  = 0
    let batches = 0
    let allFailures = []

    while (!stopRef.current) {
      try {
        // Server-side writes — route uses service role, no RLS issues
        const { data:{ session } } = await supabase.auth.getSession()
        const res  = await fetch('/api/admin/enrich-dvd?limit=20', { headers:{ Authorization:`Bearer ${session.access_token}` } })
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

// ── MOVIES TAB ────────────────────────────────────────────────────────────────

// Suggested Movies sub-tab — read-only FREE/COST view
function SuggestedMoviesView() {
  const [movies,         setMovies]         = useState([])
  const [dvdTmdbIds,     setDvdTmdbIds]     = useState(new Set())
  const [dvdImdbIds,     setDvdImdbIds]     = useState(new Set())
  const [streamingSvcs,  setStreamingSvcs]  = useState([])
  const [ownershipRecs,  setOwnershipRecs]  = useState([])
  const [loading,        setLoading]        = useState(true)

  useEffect(() => {
    async function load() {
      const [movRes, dvdRes, settRes, ownRes] = await Promise.all([
        supabase.from('movies').select('id, title, year, poster_url, tmdb_id, imdb_id, streaming_au, actors').eq('we_own', false).order('title'),
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
      {movies.length === 0 && <div style={{ textAlign:'center', padding:'2rem', color:'var(--text-dim)', fontSize:'0.9rem' }}>No suggested movies yet</div>}
      {movies.map(m => {
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
        we_own: false,
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

      {/* Existing records */}
      {loading ? <div style={{ textAlign:'center', padding:'1.5rem', color:'var(--text-dim)' }}>Loading…</div> : records.length === 0 ? (
        <div style={{ textAlign:'center', padding:'1.5rem', color:'var(--text-dim)', fontSize:'0.9rem' }}>No ownership records yet</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          {records.map(r => (
            <div key={r.id} style={{ display:'flex', alignItems:'center', gap:'0.75rem', background:'var(--surface)', borderRadius:'12px', border:'1px solid var(--border)', padding:'0.65rem' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:'0.88rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {r.movies?.title}{r.movies?.year ? ` (${r.movies.year})` : ''}
                </div>
                {r.movies?.actors && <div style={{ fontSize:'0.72rem', color:'var(--text-dim)' }}>{r.movies.actors.split(',')[0].trim()}</div>}
                <div style={{ fontSize:'0.72rem', color:'var(--text-dim)', marginTop:'0.2rem' }}>
                  {r.members?.name} · {r.ownership_type === 'dvd' ? '📀 DVD' : '💾 Digital'}
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

  async function loadServices() {
    const { data } = await supabase.from('settings').select('value').eq('key', 'our_streaming_services').single()
    try { setServices(JSON.parse(data?.value || '[]')) } catch { setServices([]) }
    setLoading(false)
  }

  useEffect(() => { loadServices() }, [])

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
// ── Sub notice editor row ────────────────────────────────────────────────────
function SubRow({ item, hubColour, onChange, onDelete }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        <RichEditor
          key={item.id}
          initialValue={item.text}
          hubColour={hubColour}
          subOnly
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

function PageTextsTab() {
  const { member } = useUser()
  const [data,    setData]    = useState({})
  const [draft,   setDraft]   = useState({})
  const [saving,  setSaving]  = useState(null)
  const [saved,   setSaved]   = useState(null)
  const [loading, setLoading] = useState(true)
  // Sub-message id counter for stable keys
  const subCounter = useRef(0)
  function newSubId() { subCounter.current += 1; return 'sub_' + subCounter.current }

  const HUB_SECTIONS = [
    {
      key: 'home', label: 'Hive Home', colour: 'var(--amber)', hex: '#f59e0b',
      hasSubs: true, subsLabel: 'Sub Notices',
      hint: 'Main announcement and sub-notices shown on the home screen.',
    },
    {
      key: 'movies', label: 'Movies Home', colour: 'var(--teal)', hex: '#0d9488',
      hasSubs: false, hint: 'Welcome message on the Movies landing page.',
    },
    {
      key: 'movies_suggestions', label: 'Movies — Suggestions', colour: 'var(--teal)', hex: '#0d9488',
      hasSubs: false, hint: 'Text shown at the top of the Suggestions page.',
    },
    {
      key: 'movies_dvd', label: 'Movies — DVD Library', colour: 'var(--teal)', hex: '#0d9488',
      hasSubs: false, hint: 'Text shown at the top of the DVD Library.',
    },
    {
      key: 'bookclub', label: 'Book Club Home', colour: 'var(--purple)', hex: '#7c3aed',
      hasSubs: false, hint: 'Welcome message on the Book Club home page.',
    },
    {
      key: 'social', label: 'Social Events', colour: 'var(--terracotta)', hex: '#c2410c',
      hasSubs: false, hint: 'Welcome message on the Social Events page.',
    },
  ]

  useEffect(() => {
    fetch('/api/hub-settings')
      .then(r => r.json())
      .then(d => {
        setData(d)
        const init = {}
        for (const s of HUB_SECTIONS) {
          init[s.key + '__text'] = d[s.key]?.text || ''
          // Subs stored as {id, text} for stable React keys
          init[s.key + '__subs'] = (d[s.key]?.subs || []).map(text => ({ id: newSubId(), text }))
        }
        setDraft(init)
        setLoading(false)
      })
  }, [])

  function setDraftField(key, val) { setDraft(d => ({ ...d, [key]: val })) }

  async function save(hubKey) {
    setSaving(hubKey)
    const body = {
      hub_type: hubKey,
      welcome_text: draft[hubKey + '__text'] || '',
      user_id: member?.id,
    }
    const sec = HUB_SECTIONS.find(s => s.key === hubKey)
    if (sec?.hasSubs) {
      body.sub_messages = (draft[hubKey + '__subs'] || []).map(s => s.text).filter(t => t && t !== '<br>' && t !== '<div><br></div>')
    }

    await fetch('/api/hub-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setData(d => ({
      ...d,
      [hubKey]: {
        text: body.welcome_text,
        subs: body.sub_messages || d[hubKey]?.subs || [],
      },
    }))
    setSaved(hubKey); setSaving(null)
    setTimeout(() => setSaved(null), 2500)
  }

  function isDirty(hubKey) {
    const sec = HUB_SECTIONS.find(s => s.key === hubKey)
    const textChanged = (draft[hubKey + '__text'] || '') !== (data[hubKey]?.text || '')
    if (!sec?.hasSubs) return textChanged
    const origSubs = JSON.stringify(data[hubKey]?.subs || [])
    const newSubs  = JSON.stringify((draft[hubKey + '__subs'] || []).map(s => s.text).filter(Boolean))
    return textChanged || origSubs !== newSubs
  }

  if (loading) return <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '2rem' }}>Loading…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {HUB_SECTIONS.map(sec => {
        const dirty = isDirty(sec.key)
        const subs  = draft[sec.key + '__subs'] || []
        return (
          <div key={sec.key} style={{ background: 'var(--surface)', borderRadius: 14,
            border: '1px solid var(--border)', overflow: 'hidden' }}>
            {/* Section header */}
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

              {/* Main message */}
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)',
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                {sec.hasSubs ? 'Main Message' : 'Message'}
              </div>
              <div style={{ marginBottom: sec.hasSubs ? 16 : 0 }}>
                <RichEditor
                  key={sec.key}
                  initialValue={draft[sec.key + '__text'] || ''}
                  hubColour={sec.hex}
                  subOnly={false}
                  onChange={html => setDraftField(sec.key + '__text', html)}
                />
              </div>

              {/* Sub messages (Hive Home only) */}
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
                        setDraftField(sec.key + '__subs', next)
                      }}
                      onDelete={id => {
                        const next = subs.filter(s => s.id !== id)
                        setDraftField(sec.key + '__subs', next)
                      }}
                    />
                  ))}
                  <button
                    onClick={() => setDraftField(sec.key + '__subs', [...subs, { id: newSubId(), text: '' }])}
                    style={{ background: 'none', border: '1.5px dashed var(--border)',
                      borderRadius: 10, padding: '0.5rem', width: '100%', cursor: 'pointer',
                      color: 'var(--text-dim)', fontSize: '0.82rem', fontWeight: 600,
                      fontFamily: 'inherit', marginBottom: 8 }}>
                    + Add Sub Notice
                  </button>
                </>
              )}

              {/* Save */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
                gap: 10, marginTop: sec.hasSubs ? 0 : 8 }}>
                {saved === sec.key && (
                  <span style={{ color: 'var(--green)', fontSize: '0.82rem', fontWeight: 700 }}>✓ Saved</span>
                )}
                <button
                  onClick={() => save(sec.key)}
                  disabled={saving === sec.key}
                  style={{ background: sec.colour, color: '#fff', border: 'none', borderRadius: 10,
                    padding: '0.55rem 1.25rem', fontWeight: 700, fontSize: '0.85rem',
                    cursor: saving === sec.key ? 'not-allowed' : 'pointer',
                    opacity: saving === sec.key ? 0.5 : 1 }}>
                  {saving === sec.key ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )
      })}
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
        {tab === 'Members'   && <MembersTab />}
        {tab === 'Movies'    && <MoviesTab />}
        {tab === 'Bar'       && <BarTab />}
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


