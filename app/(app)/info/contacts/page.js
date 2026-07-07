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
function ContactCard({ contact, badge, onEdit }) {
  return (
    <div style={{
      background: "var(--surface)", borderRadius: 12,
      border: "1px solid var(--border)", padding: "0.9rem 1rem",
      marginBottom: "0.6rem", boxShadow: "var(--shadow)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)" }}>
            {contact.name}
            {badge && (
              <span style={{
                marginLeft: "0.5rem", fontSize: "0.65rem", fontWeight: 700, padding: "0.1rem 0.45rem",
                borderRadius: 10, background: "var(--surface2)", color: "var(--text-dim)", verticalAlign: "middle",
              }}>{badge}</span>
            )}
          </div>
          {contact.title && (
            <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginTop: "0.1rem" }}>{contact.title}</div>
          )}
          {contact.house_number && (
            <div style={{ fontSize: "0.82rem", color: "var(--text-dim)" }}>House #{contact.house_number}</div>
          )}
        </div>
        {onEdit && (
          <button onClick={onEdit} style={{
            flexShrink: 0, fontSize: "0.75rem", padding: "0.25rem 0.6rem", borderRadius: 6,
            border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
            cursor: "pointer", fontFamily: "inherit",
          }}>Edit</button>
        )}
      </div>
      <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
        {contact.phone && (
          <a href={`tel:${contact.phone}`} style={{ fontSize: "0.88rem", color: COLOUR, textDecoration: "none", fontWeight: 600 }}>
            📞 {contact.phone}
          </a>
        )}
        {contact.email && (
          <a href={`mailto:${contact.email}`} style={{ fontSize: "0.88rem", color: COLOUR, textDecoration: "none", fontWeight: 600 }}>
            ✉ {contact.email}
          </a>
        )}
      </div>
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ContactsPage() {
  const { isAdmin, member: me }     = useUser()
  const [categories, setCategories] = useState([])
  const [members, setMembers]       = useState([])
  const [contacts, setContacts]     = useState([])
  const [activeFilter, setFilter]   = useState(null)
  const [loading, setLoading]       = useState(true)
  const [sheet, setSheet]           = useState(null) // null | "add" | "categories" | {type,member|contact}

  const load = useCallback(async () => {
    const [catRes, memberRes, contactRes] = await Promise.all([
      supabase.from("contact_categories").select("id, name, display_order").eq("active", true).order("display_order"),
      supabase.from("members").select("id, name, email, house_number, hide_name, is_admin").eq("status", "active"),
      supabase.from("contacts")
        .select("id, name, title, phone, email, house_number, member_id, active, contact_category_members(category_id)")
        .order("display_order"),
    ])
    setCategories(catRes.data || [])
    setMembers(memberRes.data || [])
    setContacts(contactRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const residentsId = categories.find(c => c.name.toLowerCase() === "residents")?.id

  useEffect(() => {
    if (activeFilter === null && residentsId) setFilter(residentsId)
  }, [residentsId, activeFilter])

  const displayMembers  = useMemo(() => isAdmin ? members : members.filter(m => !m.hide_name), [members, isAdmin])
  const displayContacts = useMemo(() => contacts.filter(c => !c.member_id && (c.active || isAdmin)), [contacts, isAdmin])
  const contactByMemberId = useMemo(() => {
    const map = {}
    for (const c of contacts) if (c.member_id) map[c.member_id] = c
    return map
  }, [contacts])

  const entries = useMemo(() => {
    const memberEntries = displayMembers.map(m => {
      const linked = contactByMemberId[m.id]
      return {
        key: `m-${m.id}`, name: m.name, email: m.email, house_number: m.house_number,
        phone: linked?.phone || null, title: linked?.title || null,
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
  }, [displayMembers, displayContacts, contactByMemberId, residentsId, isAdmin])

  const filtered = activeFilter === "all"
    ? entries
    : entries.filter(e => e.categoryIds.includes(activeFilter))

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

      {isAdmin && (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button onClick={() => setSheet("add")} style={secondaryButtonStyle}>+ Add Contact</button>
          <button onClick={() => setSheet("categories")} style={secondaryButtonStyle}>Manage Categories</button>
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
            linkedPhone={contactByMemberId[sheet.member.id]?.phone}
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
