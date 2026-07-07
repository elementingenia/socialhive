"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"

const COLOUR = "#4e7aab"

const inputStyle = {
  width: "100%", padding: "0.75rem 1rem", borderRadius: 10,
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box",
  fontFamily: "inherit", appearance: "none", WebkitAppearance: "none",
}

const labelStyle = {
  fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)",
  textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, display: "block",
}

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token
}

function ContactCard({ contact }) {
  return (
    <div style={{
      background: "var(--surface)", borderRadius: 12,
      border: "1px solid var(--border)", padding: "0.9rem 1rem",
      marginBottom: "0.6rem", boxShadow: "var(--shadow)",
    }}>
      <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)" }}>{contact.name}</div>
      {contact.title && (
        <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginTop: "0.1rem" }}>{contact.title}</div>
      )}
      {contact.house_number && (
        <div style={{ fontSize: "0.82rem", color: "var(--text-dim)" }}>House #{contact.house_number}</div>
      )}
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

// ── Category multi-select combobox — search existing, or create inline ────────
function CategoryPicker({ categories, selectedIds, onChange, onCategoryCreated, allowCreate = true, required = false }) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const selected = categories.filter(c => selectedIds.includes(c.id))
  const q = query.trim().toLowerCase()
  const matches = categories.filter(c => !selectedIds.includes(c.id) && (!q || c.name.toLowerCase().includes(q)))
  const exactMatch = categories.some(c => c.name.toLowerCase() === q)

  function addCategory(id) {
    onChange([...selectedIds, id])
    setQuery("")
  }
  function removeCategory(id) {
    onChange(selectedIds.filter(x => x !== id))
  }

  async function createAndAdd() {
    if (!query.trim() || creating) return
    setCreating(true)
    const token = await getToken()
    const res = await fetch("/api/info/contact-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ name: query.trim() }),
    })
    const data = await res.json()
    setCreating(false)
    if (res.ok) {
      onCategoryCreated(data)
      onChange([...selectedIds, data.id])
      setQuery("")
    }
  }

  return (
    <div>
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.5rem" }}>
          {selected.map(c => (
            <span key={c.id} style={{
              display: "inline-flex", alignItems: "center", gap: "0.35rem",
              background: COLOUR, color: "#fff", borderRadius: 20,
              padding: "0.25rem 0.5rem 0.25rem 0.75rem", fontSize: "0.8rem", fontWeight: 600,
            }}>
              {c.name}
              <button type="button" onClick={() => removeCategory(c.id)} style={{
                background: "none", border: "none", color: "#fff", cursor: "pointer",
                fontSize: "0.9rem", lineHeight: 1, padding: 0, opacity: 0.8, fontFamily: "inherit",
              }}>×</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: "relative" }}>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={selected.length ? "Add another category…" : "Search or add a category…"}
          style={{ ...inputStyle, border: `1.5px solid ${required && selected.length === 0 ? "var(--danger)" : "var(--border)"}` }}
        />
        {open && (matches.length > 0 || (allowCreate && q && !exactMatch)) && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
            boxShadow: "var(--shadow)", maxHeight: 200, overflowY: "auto",
          }}>
            {matches.map(c => (
              <button key={c.id} type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => addCategory(c.id)}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "0.6rem 0.85rem",
                  background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                  fontSize: "0.88rem", color: "var(--text)",
                }}>{c.name}</button>
            ))}
            {allowCreate && q && !exactMatch && (
              <button type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={createAndAdd} disabled={creating}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "0.6rem 0.85rem",
                  background: "none", border: "none", borderTop: matches.length ? "1px solid var(--border)" : "none",
                  cursor: creating ? "not-allowed" : "pointer", fontFamily: "inherit",
                  fontSize: "0.88rem", color: COLOUR, fontWeight: 600,
                }}>{creating ? "Adding…" : `+ Create "${query.trim()}"`}</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Resident category assignment row (Residents tag is implicit, never stored) ─
function ResidentCategoryRow({ member, allCategories, residentsId, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [ids, setIds]         = useState((member.member_categories || []).map(m => m.category_id))
  const [saving, setSaving]   = useState(false)

  const assignable = allCategories.filter(c => c.id !== residentsId)
  const extraNames = assignable.filter(c => ids.includes(c.id)).map(c => c.name)

  async function save() {
    setSaving(true)
    const token = await getToken()
    await fetch("/api/info/member-categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ member_id: member.id, category_ids: ids }),
    })
    setSaving(false)
    setEditing(false)
    onSaved()
  }

  return (
    <div style={{ padding: "0.6rem 0.75rem", background: "var(--surface2)", borderRadius: 8, marginBottom: "0.4rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>{member.name}</div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
            Residents{extraNames.length ? ` + ${extraNames.join(", ")}` : ""}
          </div>
        </div>
        <button onClick={() => setEditing(o => !o)} style={{
          fontSize: "0.75rem", padding: "0.25rem 0.6rem", borderRadius: 6, flexShrink: 0,
          border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
          cursor: "pointer", fontFamily: "inherit",
        }}>{editing ? "Close" : "Edit"}</button>
      </div>
      {editing && (
        <div style={{ marginTop: "0.6rem" }}>
          <CategoryPicker categories={assignable} selectedIds={ids} onChange={setIds}
            onCategoryCreated={() => {}} allowCreate={false} />
          <button onClick={save} disabled={saving} style={{
            marginTop: "0.5rem", background: COLOUR, color: "#fff", border: "none", borderRadius: 8,
            padding: "0.5rem 1rem", fontWeight: 700, fontSize: "0.85rem",
            cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1,
          }}>{saving ? "Saving…" : "Save"}</button>
        </div>
      )}
    </div>
  )
}

// ── Admin panel ───────────────────────────────────────────────────────────────
const EMPTY = { name: "", title: "", phone: "", email: "", house_number: "", category_ids: [] }

function AdminPanel({ categories, setCategories, members, contacts, residentsId, onSaved }) {
  const [form, setForm]           = useState(EMPTY)
  const [editId, setEditId]       = useState(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState("")
  const [catForm, setCatForm]     = useState("")
  const [catSaving, setCatSaving] = useState(false)
  const [catError, setCatError]   = useState("")

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const nameMatchesMember = form.name.trim() &&
    members.some(m => m.name.toLowerCase() === form.name.trim().toLowerCase())

  function startEdit(contact) {
    setEditId(contact.id)
    setForm({
      name: contact.name,
      title: contact.title || "",
      phone: contact.phone || "",
      email: contact.email || "",
      house_number: contact.house_number || "",
      category_ids: (contact.contact_category_members || []).map(m => m.category_id),
    })
    setError("")
  }

  function cancelEdit() { setEditId(null); setForm(EMPTY); setError("") }

  async function addCategory() {
    if (!catForm.trim()) return
    setCatSaving(true)
    setCatError("")
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

  async function save() {
    setError("")
    if (!form.name.trim()) { setError("Name is required"); return }
    if (!form.category_ids.length) { setError("At least one category is required"); return }
    setSaving(true)
    try {
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
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(editId ? { id: editId, ...payload } : payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Save failed")
      cancelEdit()
      onSaved()
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  async function toggleActive(contact) {
    const token = await getToken()
    await fetch("/api/info/contacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ id: contact.id, active: !contact.active }),
    })
    onSaved()
  }

  async function deleteContact(contact) {
    if (!confirm(`Delete "${contact.name}"?`)) return
    const token = await getToken()
    await fetch("/api/info/contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ id: contact.id }),
    })
    onSaved()
  }

  return (
    <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--border)", paddingTop: "1.25rem" }}>
      <div style={{ fontWeight: 700, fontSize: "0.9rem", color: COLOUR, marginBottom: "1rem" }}>
        Admin — {editId ? "Edit Contact" : "Add Contact"}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div>
          <label style={labelStyle}>Name <span style={{ color: "var(--danger)" }}>*</span></label>
          <input value={form.name} onChange={e => set("name", e.target.value)}
            style={{ ...inputStyle, border: `1.5px solid ${form.name.trim() ? "var(--green)" : "var(--danger)"}` }} />
          {nameMatchesMember && !editId && (
            <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.3rem" }}>
              This matches an existing resident's name — residents already appear automatically as contacts, no need to add them here.
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

        <div style={{ display: "flex", gap: "0.5rem" }}>
          {editId && (
            <button onClick={cancelEdit} style={{
              flex: 1, padding: "0.75rem", borderRadius: 10, border: "1px solid var(--border)",
              background: "var(--surface2)", color: "var(--text)", fontWeight: 700,
              fontSize: "0.95rem", cursor: "pointer", fontFamily: "inherit",
            }}>Cancel</button>
          )}
          <button onClick={save} disabled={saving} style={{
            flex: 2, background: COLOUR, color: "#fff", border: "none", borderRadius: 10,
            padding: "0.75rem", fontWeight: 700, fontSize: "0.95rem",
            cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1,
          }}>{saving ? "Saving…" : (editId ? "Save Changes" : "Add Contact")}</button>
        </div>
      </div>

      {contacts.length > 0 && (
        <div style={{ marginTop: "1.25rem" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-dim)", marginBottom: "0.5rem" }}>
            Standalone contacts (non-resident)
          </div>
          {contacts.map(c => (
            <div key={c.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0.6rem 0.75rem", background: "var(--surface2)", borderRadius: 8,
              marginBottom: "0.4rem", gap: "0.5rem",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>{c.name}</div>
                {c.title && <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{c.title}</div>}
              </div>
              <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                <button onClick={() => startEdit(c)} style={{
                  fontSize: "0.75rem", padding: "0.25rem 0.6rem", borderRadius: 6,
                  border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit",
                  background: "var(--surface)", color: "var(--text)",
                }}>Edit</button>
                <button onClick={() => toggleActive(c)} style={{
                  fontSize: "0.75rem", padding: "0.25rem 0.6rem", borderRadius: 6,
                  border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit",
                  background: c.active ? "#dcfce7" : "#fee2e2",
                  color: c.active ? "#166534" : "#991b1b",
                }}>{c.active ? "Active" : "Hidden"}</button>
                <button onClick={() => deleteContact(c)} style={{
                  fontSize: "0.75rem", padding: "0.25rem 0.6rem", borderRadius: 6,
                  border: "1px solid #fca5a5", cursor: "pointer", fontFamily: "inherit",
                  background: "#fee2e2", color: "#991b1b",
                }}>Del</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {members.length > 0 && (
        <div style={{ marginTop: "1.25rem" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-dim)", marginBottom: "0.5rem" }}>
            Resident categories — everyone is Residents by default; assign extra categories here
          </div>
          {members.map(m => (
            <ResidentCategoryRow key={m.id} member={m} allCategories={categories} residentsId={residentsId} onSaved={onSaved} />
          ))}
        </div>
      )}

      <div style={{ marginTop: "1.25rem" }}>
        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.4rem", fontWeight: 600 }}>Manage categories</div>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.6rem" }}>
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
              padding: "0.4rem 0.6rem", background: "var(--surface2)", borderRadius: 8,
            }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>{c.name}</span>
              {c.name.toLowerCase() !== "residents" && (
                <button onClick={() => deleteCategory(c)} style={{
                  background: "none", border: "none", color: "#991b1b", cursor: "pointer",
                  fontSize: "0.75rem", fontWeight: 600, fontFamily: "inherit",
                }}>Delete</button>
              )}
            </div>
          ))}
        </div>
        {catError && <div style={{ color: "#b91c1c", fontSize: "0.8rem", marginTop: "0.5rem" }}>{catError}</div>}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ContactsPage() {
  const { isAdmin } = useUser()
  const [categories, setCategories]       = useState([])
  const [members, setMembers]             = useState([])
  const [contacts, setContacts]           = useState([])
  const [adminContacts, setAdminContacts] = useState([])
  const [activeFilter, setFilter]         = useState(null)
  const [loading, setLoading]             = useState(true)

  const load = useCallback(async () => {
    const [catRes, memberRes, contactRes] = await Promise.all([
      supabase.from("contact_categories").select("id, name, display_order").eq("active", true).order("display_order"),
      supabase.from("members").select("id, name, email, house_number, hide_name, member_categories(category_id)").eq("status", "active"),
      supabase.from("contacts")
        .select("id, name, title, phone, email, house_number, active, contact_category_members(category_id)")
        .eq("active", true).order("display_order"),
    ])
    setCategories(catRes.data || [])
    setMembers(memberRes.data || [])
    setContacts(contactRes.data || [])
    setLoading(false)
  }, [])

  // Admin's contact-management list needs unfiltered contacts (incl. hidden/inactive ones)
  const loadAdmin = useCallback(async () => {
    const { data } = await supabase.from("contacts")
      .select("id, name, title, phone, email, house_number, active, contact_category_members(category_id)")
      .order("display_order")
    setAdminContacts(data || [])
  }, [])

  const reloadAll = useCallback(() => { load(); if (isAdmin) loadAdmin() }, [load, loadAdmin, isAdmin])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (isAdmin) loadAdmin() }, [isAdmin, loadAdmin])

  const residentsId = categories.find(c => c.name.toLowerCase() === "residents")?.id

  useEffect(() => {
    if (activeFilter === null && residentsId) setFilter(residentsId)
  }, [residentsId, activeFilter])

  const visibleMembers = useMemo(() => members.filter(m => !m.hide_name), [members])

  const entries = useMemo(() => {
    const memberEntries = visibleMembers.map(m => ({
      key: `m-${m.id}`, name: m.name, email: m.email, house_number: m.house_number,
      phone: null, title: null,
      categoryIds: [residentsId, ...(m.member_categories || []).map(x => x.category_id)].filter(Boolean),
    }))
    const contactEntries = contacts.map(c => ({
      key: `c-${c.id}`, name: c.name, email: c.email, house_number: c.house_number,
      phone: c.phone, title: c.title,
      categoryIds: (c.contact_category_members || []).map(x => x.category_id),
    }))
    return [...memberEntries, ...contactEntries].sort((a, b) => a.name.localeCompare(b.name))
  }, [visibleMembers, contacts, residentsId])

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

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--text-dim)", fontSize: "0.9rem" }}>
          <div style={{ fontSize: "1.8rem", marginBottom: "0.5rem" }}>👥</div>
          No contacts in this category
        </div>
      ) : (
        filtered.map(c => <ContactCard key={c.key} contact={c} />)
      )}

      {isAdmin && (
        <AdminPanel
          categories={categories}
          setCategories={setCategories}
          members={members}
          contacts={adminContacts}
          residentsId={residentsId}
          onSaved={reloadAll}
        />
      )}
    </div>
  )
}
