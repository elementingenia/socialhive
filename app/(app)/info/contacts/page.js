"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import ResidentEditForm, { Sheet, CategoryPicker, COLOUR, inputStyle, labelStyle, getToken } from "@/components/ResidentEditPanel"

const secondaryButtonStyle = {
  padding: "0.5rem 0.9rem", borderRadius: 10, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--text)", fontWeight: 700,
  fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit",
}

// ── Contact card ─────────────────────────────────────────────────────────────
// Compact by design (Iain, 2026-07-12) -- this list is headed toward 200+
// entries as the community scales, so each tile is a single scan-able line
// (name + house #) by default. A "More" toggle appears for EVERYONE
// whenever a contact actually has title/phone/email beyond what's already
// on the compact line -- admins additionally get "Edit" alongside it, since
// viewing details and editing them are different actions (2026-07-12,
// clarified same day: Edit alone isn't a substitute for a quick "More").
function ContactCard({ contact, badge, onEdit }) {
  const [expanded, setExpanded] = useState(false)
  const isAdminView = !!onEdit
  const hasMore = !!(contact.title || contact.phone || contact.email)

  return (
    <div style={{
      background: "var(--surface)", borderRadius: 10,
      border: "1px solid var(--border)", padding: "0.55rem 0.8rem",
      marginBottom: "0.4rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
        <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: "0.4rem", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text)" }}>{contact.name}</span>
          {contact.house_number && (
            <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>· #{contact.house_number}</span>
          )}
          {badge && (
            <span style={{
              fontSize: "0.6rem", fontWeight: 700, padding: "0.05rem 0.4rem",
              borderRadius: 10, background: "var(--surface2)", color: "var(--text-dim)",
            }}>{badge}</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
          {hasMore && (
            <button onClick={() => setExpanded(v => !v)} style={{
              flexShrink: 0, fontSize: "0.7rem", fontWeight: 700, color: COLOUR,
              background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0,
            }}>{expanded ? "Less ▲" : "More ▼"}</button>
          )}
          {isAdminView && (
            <button onClick={onEdit} style={{
              flexShrink: 0, fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.55rem", borderRadius: 6,
              border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
              cursor: "pointer", fontFamily: "inherit",
            }}>Edit</button>
          )}
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          {contact.title && (
            <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>{contact.title}</div>
          )}
          {contact.phone && (
            <a href={`tel:${contact.phone}`} style={{ fontSize: "0.85rem", color: COLOUR, textDecoration: "none", fontWeight: 600 }}>
              📞 {contact.phone}
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} style={{ fontSize: "0.85rem", color: COLOUR, textDecoration: "none", fontWeight: 600 }}>
              ✉ {contact.email}
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ── Add / Edit a standalone (non-resident) contact ────────────────────────────
const EMPTY = { name: "", title: "", phone: "", email: "", house_number: "", category_ids: [] }

function ContactForm({ contact, categories, setCategories, members, onSaved, onClose }) {
  const isEdit = !!contact
  const [form, setForm] = useState(() => contact ? {
    name: contact.name, title: contact.title || "", phone: contact.phone || "",
    email: contact.email || "", house_number: contact.house_number || "",
    category_ids: (contact.contact_category_members || []).map(m => m.category_id),
  } : EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState("")

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const nameMatchesMember = form.name.trim() && !isEdit &&
    members.some(m => m.name.toLowerCase() === form.name.trim().toLowerCase())

  async function save() {
    setError("")
    if (!form.name.trim()) { setError("Name is required"); return }
    if (!form.category_ids.length) { setError("At least one category is required"); return }
    setSaving(true)
    const token = await getToken()
    const payload = {
      name: form.name.trim(),
      title: form.title.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      house_number: form.house_number.trim() || null,
      category_ids: form.category_ids,
    }
    const res = await fetch("/api/info/contacts", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(isEdit ? { id: contact.id, ...payload } : payload),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || "Save failed"); return }
    onSaved()
    onClose()
  }

  async function toggleActive() {
    const token = await getToken()
    await fetch("/api/info/contacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ id: contact.id, active: !contact.active }),
    })
    onSaved()
    onClose()
  }

  async function del() {
    if (!confirm(`Delete "${contact.name}"?`)) return
    const token = await getToken()
    await fetch("/api/info/contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ id: contact.id }),
    })
    onSaved()
    onClose()
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div>
        <label style={labelStyle}>Name <span style={{ color: "var(--danger)" }}>*</span></label>
        <input value={form.name} onChange={e => set("name", e.target.value)}
          style={{ ...inputStyle, border: `1.5px solid ${form.name.trim() ? "var(--green)" : "var(--danger)"}` }} />
        {nameMatchesMember && (
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.3rem" }}>
            This matches an existing resident's name — residents already appear automatically, no need to add them here.
          </div>
        )}
      </div>
      <div>
        <label style={labelStyle}>Category <span style={{ color: "var(--danger)" }}>*</span></label>
        <CategoryPicker categories={categories} selectedIds={form.category_ids}
          onChange={ids => set("category_ids", ids)}
          onCategoryCreated={cat => setCategories(prev => [...prev, cat])}
          required />
      </div>
      <div>
        <label style={labelStyle}>Title / Role</label>
        <input value={form.title} onChange={e => set("title", e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Phone</label>
        <input value={form.phone} onChange={e => set("phone", e.target.value)} type="tel" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Email</label>
        <input value={form.email} onChange={e => set("email", e.target.value)} type="email" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>House #</label>
        <input value={form.house_number} onChange={e => set("house_number", e.target.value)} style={inputStyle} />
      </div>

      {error && <div style={{ color: "#b91c1c", fontSize: "0.83rem" }}>{error}</div>}

      <button onClick={save} disabled={saving} style={{
        background: COLOUR, color: "#fff", border: "none", borderRadius: 10,
        padding: "0.75rem", fontWeight: 700, fontSize: "0.95rem",
        cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1,
      }}>{saving ? "Saving…" : (isEdit ? "Save Changes" : "Add Contact")}</button>

      {isEdit && (
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={toggleActive} style={{
            flex: 1, padding: "0.6rem", borderRadius: 10, border: "1px solid var(--border)",
            background: "var(--surface2)", color: "var(--text)", fontWeight: 600, fontSize: "0.85rem",
            cursor: "pointer", fontFamily: "inherit",
          }}>{contact.active ? "Hide (mark inactive)" : "Reactivate"}</button>
          <button onClick={del} style={{
            flex: 1, padding: "0.6rem", borderRadius: 10, border: "1px solid #fca5a5",
            background: "#fee2e2", color: "#991b1b", fontWeight: 600, fontSize: "0.85rem",
            cursor: "pointer", fontFamily: "inherit",
          }}>Delete</button>
        </div>
      )}
    </div>
  )
}

// ── Category management ───────────────────────────────────────────────────────
function CategoryManager({ categories, setCategories, onSaved }) {
  const [catForm, setCatForm]     = useState("")
  const [catSaving, setCatSaving] = useState(false)
  const [catError, setCatError]   = useState("")

  async function addCategory() {
    if (!catForm.trim()) return
    setCatSaving(true); setCatError("")
    const token = await getToken()
    const res = await fetch("/api/info/contact-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ name: catForm.trim() }),
    })
    const data = await res.json()
    setCatSaving(false)
    if (!res.ok) { setCatError(data.error || "Add failed"); return }
    setCatForm("")
    setCategories(prev => [...prev, data])
    onSaved()
  }

  async function deleteCategory(cat) {
    setCatError("")
    if (!confirm(`Delete category "${cat.name}"?`)) return
    const token = await getToken()
    const res = await fetch("/api/info/contact-categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ id: cat.id }),
    })
    const data = await res.json()
    if (!res.ok) { setCatError(data.error || "Delete failed"); return }
    setCategories(prev => prev.filter(c => c.id !== cat.id))
    onSaved()
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <input value={catForm} onChange={e => setCatForm(e.target.value)}
          placeholder="New category name" style={{ ...inputStyle, flex: 1 }} />
        <button onClick={addCategory} disabled={catSaving || !catForm.trim()} style={{
          background: COLOUR, color: "#fff", border: "none", borderRadius: 10,
          padding: "0 1rem", fontWeight: 700, cursor: "pointer", fontSize: "0.88rem", fontFamily: "inherit",
        }}>Add</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {categories.map(c => (
          <div key={c.id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0.5rem 0.7rem", background: "var(--surface2)", borderRadius: 8,
          }}>
            <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text)" }}>{c.name}</span>
            {c.name.toLowerCase() !== "residents" && (
              <button onClick={() => deleteCategory(c)} style={{
                background: "none", border: "none", color: "#991b1b", cursor: "pointer",
                fontSize: "0.78rem", fontWeight: 600, fontFamily: "inherit",
              }}>Delete</button>
            )}
          </div>
        ))}
      </div>
      {catError && <div style={{ color: "#b91c1c", fontSize: "0.8rem", marginTop: "0.5rem" }}>{catError}</div>}
    </div>
  )
}

// ── Invite Code control ───────────────────────────────────────────────────────
// Moved here from Admin > Members (2026-07-12) as part of folding that section
// into Contacts -- new residents need this code to register. Stored in the
// settings table (key 'invite_token'); RLS restricts writes to admins.
function InviteCodeControl({ code, onSaved }) {
  const controlLabelStyle = { fontSize:'0.78rem', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4, display:'block' }
  const [revealed, setRevealed] = useState(false)
  const [editing,  setEditing]  = useState(false)
  const [draft,    setDraft]    = useState(code)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => { setDraft(code) }, [code])

  async function save() {
    const trimmed = draft.trim()
    if (!trimmed) { setError('Invite code cannot be empty'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('settings')
      .update({ value: trimmed, updated_at: new Date().toISOString() })
      .eq('key', 'invite_token')
    setSaving(false)
    if (err) { setError('Could not save — try again'); return }
    onSaved(trimmed)
    setEditing(false)
    setRevealed(true)
  }

  return (
    <div>
      <div style={{ fontSize:'0.85rem', color:'var(--text-dim)', lineHeight:1.5, marginBottom:'1rem' }}>
        New residents enter this code to register. Change it any time — existing members are unaffected.
      </div>

      {editing ? (
        <div>
          <label style={controlLabelStyle}>New Invite Code</label>
          <input style={inputStyle} value={draft} onChange={e => setDraft(e.target.value)} autoFocus />
          {error && <div style={{ color:'var(--danger)', fontSize:'0.8rem', marginTop:'0.4rem' }}>{error}</div>}
          <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.85rem' }}>
            <button onClick={() => { setEditing(false); setDraft(code); setError('') }}
              style={{ flex:1, padding:'0.7rem', borderRadius:'10px', border:'1px solid var(--border)', background:'var(--surface2)', cursor:'pointer', fontSize:'0.85rem', fontWeight:600 }}>
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              style={{ flex:1, padding:'0.7rem', borderRadius:'10px', border:'none', background:COLOUR, color:'#fff', cursor: saving ? 'wait' : 'pointer', fontSize:'0.85rem', fontWeight:700 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'0.6rem',
            background:'var(--surface2)', borderRadius:'10px', border:'1px solid var(--border)', padding:'0.85rem 1rem', marginBottom:'0.85rem' }}>
            <span style={{ fontFamily:'monospace', fontSize:'1.1rem', fontWeight:700, letterSpacing: revealed ? '0.03em' : '0.2em' }}>
              {revealed ? code : '•'.repeat(Math.max(code.length, 6))}
            </span>
            <button onClick={() => setRevealed(r => !r)}
              style={{ background:'none', border:'none', cursor:'pointer', fontSize:'0.78rem', fontWeight:700, color:COLOUR, whiteSpace:'nowrap' }}>
              {revealed ? 'Hide' : 'Show'}
            </button>
          </div>
          <button onClick={() => { setEditing(true); setDraft(code) }}
            style={{ width:'100%', padding:'0.7rem', borderRadius:'10px', border:`1px solid ${COLOUR}`, background:'none', color:COLOUR, cursor:'pointer', fontSize:'0.85rem', fontWeight:700 }}>
            Change Code
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ContactsPage() {
  const { isAdmin, member: me }     = useUser()
  const [categories, setCategories] = useState([])
  const [members, setMembers]       = useState([])
  const [contacts, setContacts]     = useState([])
  const [activeFilter, setFilter]   = useState(null)
  const [loading, setLoading]       = useState(true)
  const [sheet, setSheet]           = useState(null) // null | "add" | "categories" | "invite" | {type,member|contact}
  const [search, setSearch]         = useState("")
  const [inviteCode, setInviteCode] = useState("")

  const load = useCallback(async () => {
    const [catRes, memberRes, contactRes, inviteRes] = await Promise.all([
      supabase.from("contact_categories").select("id, name, display_order").eq("active", true).order("display_order"),
      supabase.from("members").select("id, name, email, house_number, phone, hide_name, is_admin").eq("status", "active"),
      supabase.from("contacts")
        .select("id, name, title, phone, email, house_number, member_id, active, contact_category_members(category_id)")
        .order("display_order"),
      supabase.from("settings").select("value").eq("key", "invite_token").single(),
    ])
    setCategories(catRes.data || [])
    setMembers(memberRes.data || [])
    setContacts(contactRes.data || [])
    setInviteCode(inviteRes.data?.value || "")
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const residentsId = categories.find(c => c.name.toLowerCase() === "residents")?.id

  useEffect(() => {
    if (activeFilter === null && residentsId) setFilter(residentsId)
  }, [residentsId, activeFilter])

  const displayContacts = useMemo(() => contacts.filter(c => !c.member_id && (c.active || isAdmin)), [contacts, isAdmin])
  const contactByMemberId = useMemo(() => {
    const map = {}
    for (const c of contacts) if (c.member_id) map[c.member_id] = c
    return map
  }, [contacts])

  // Every active resident appears in the list for everyone — Private (hide_name)
  // residents are never excluded, but non-admins see "Resident" with no
  // contact details instead of their real name/email/house#/phone/title.
  // Admins always see the real name and details regardless of Private, and
  // every viewer always sees their OWN name regardless of their own Private
  // flag -- Private only hides you from other (non-admin) residents, not
  // from yourself (Iain, 2026-07-12).
  const entries = useMemo(() => {
    const memberEntries = members.map(m => {
      const linked = contactByMemberId[m.id]
      const isSelf = m.id === me?.id
      const maskedForViewer = m.hide_name && !isAdmin && !isSelf
      return {
        key: `m-${m.id}`,
        name: maskedForViewer ? "Resident" : m.name,
        email: maskedForViewer ? null : m.email,
        house_number: maskedForViewer ? null : m.house_number,
        phone: maskedForViewer ? null : (m.phone || null),
        title: maskedForViewer ? null : (linked?.title || null),
        categoryIds: [residentsId, ...((linked?.contact_category_members) || []).map(x => x.category_id)].filter(Boolean),
        isMember: true, member: m,
        badge: isAdmin && m.hide_name ? "Private" : null,
      }
    })
    const contactEntries = displayContacts.map(c => ({
      key: `c-${c.id}`, name: c.name, email: c.email, house_number: c.house_number,
      phone: c.phone, title: c.title,
      categoryIds: (c.contact_category_members || []).map(x => x.category_id),
      isMember: false, contact: c,
      badge: isAdmin && !c.active ? "Hidden" : null,
    }))
    return [...memberEntries, ...contactEntries].sort((a, b) => a.name.localeCompare(b.name))
  }, [members, displayContacts, contactByMemberId, residentsId, isAdmin])

  const categoryFiltered = activeFilter === "all"
    ? entries
    : entries.filter(e => e.categoryIds.includes(activeFilter))
  const filtered = search.trim()
    ? categoryFiltered.filter(e => e.name?.toLowerCase().includes(search.trim().toLowerCase()))
    : categoryFiltered

  const initializing = loading || activeFilter === null

  if (initializing) return (
    <div style={{ padding: "1.25rem 1rem" }}>
      {[1,2,3].map(i => <div key={i} style={{ height: 72, borderRadius: 12, background: "var(--surface2)", marginBottom: "0.6rem" }} />)}
    </div>
  )

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      {categories.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          {[...categories, { id: "all", name: "All" }].map(c => (
            <button key={c.id} onClick={() => setFilter(c.id)} style={{
              padding: "0.35rem 0.9rem", borderRadius: 20, border: "none",
              fontFamily: "inherit", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer",
              background: activeFilter === c.id ? COLOUR : "var(--surface2)",
              color: activeFilter === c.id ? "#fff" : "var(--text-dim)",
            }}>{c.name}</button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name…"
          style={{ ...inputStyle, flex: 1 }} />
        <span style={{ fontSize: "0.78rem", color: "var(--text-dim)", whiteSpace: "nowrap" }}>{filtered.length}</span>
      </div>

      {isAdmin && (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
          <button onClick={() => setSheet("add")} style={secondaryButtonStyle}>+ Add Contact</button>
          <button onClick={() => setSheet("categories")} style={secondaryButtonStyle}>Manage Categories</button>
          <button onClick={() => setSheet("invite")} style={secondaryButtonStyle}>Invite Code</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--text-dim)", fontSize: "0.9rem" }}>
          <div style={{ fontSize: "1.8rem", marginBottom: "0.5rem" }}>👥</div>
          No contacts in this category
        </div>
      ) : (
        filtered.map(e => (
          <ContactCard key={e.key} contact={e} badge={e.badge}
            onEdit={isAdmin ? () => setSheet(e.isMember ? { type: "resident", member: e.member } : { type: "contact", contact: e.contact }) : null} />
        ))
      )}

      <Sheet open={sheet === "add"} onClose={() => setSheet(null)} title="Add Contact">
        <ContactForm categories={categories} setCategories={setCategories} members={members} onSaved={load} onClose={() => setSheet(null)} />
      </Sheet>

      <Sheet open={sheet === "categories"} onClose={() => setSheet(null)} title="Manage Categories">
        <CategoryManager categories={categories} setCategories={setCategories} onSaved={load} />
      </Sheet>

      <Sheet open={sheet === "invite"} onClose={() => setSheet(null)} title="Invite Code">
        <InviteCodeControl code={inviteCode} onSaved={code => setInviteCode(code)} />
      </Sheet>

      <Sheet open={sheet?.type === "contact"} onClose={() => setSheet(null)} title="Edit Contact">
        {sheet?.type === "contact" && (
          <ContactForm contact={sheet.contact} categories={categories} setCategories={setCategories} members={members} onSaved={load} onClose={() => setSheet(null)} />
        )}
      </Sheet>

      <Sheet open={sheet?.type === "resident"} onClose={() => setSheet(null)} title="Edit Resident">
        {sheet?.type === "resident" && (
          <ResidentEditForm
            member={sheet.member}
            linkedCategoryIds={(contactByMemberId[sheet.member.id]?.contact_category_members || []).map(x => x.category_id)}
            linkedTitle={contactByMemberId[sheet.member.id]?.title}
            categories={categories}
            residentsId={residentsId}
            isSelf={sheet.member.id === me?.id}
            onSaved={load}
            onClose={() => setSheet(null)}
          />
        )}
      </Sheet>
    </div>
  )
}
