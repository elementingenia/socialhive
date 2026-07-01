"use client"
import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"

const COLOUR = "#4e7aab"

const inputStyle = {
  width: "100%", padding: "0.75rem 1rem", borderRadius: 10,
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box",
  fontFamily: "inherit", appearance: "none", WebkitAppearance: "none",
}

function ContactCard({ contact, categoryNames }) {
  return (
    <div style={{
      background: "var(--surface)", borderRadius: 12,
      border: "1px solid var(--border)", padding: "0.9rem 1rem",
      marginBottom: "0.6rem", boxShadow: "var(--shadow)",
    }}>
      <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)" }}>
        {contact.name}
      </div>
      {contact.title && (
        <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginTop: "0.1rem" }}>
          {contact.title}
        </div>
      )}
      {contact.house_number && (
        <div style={{ fontSize: "0.82rem", color: "var(--text-dim)" }}>
          House #{contact.house_number}
        </div>
      )}
      <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
        {contact.phone && (
          <a href={`tel:${contact.phone}`} style={{
            fontSize: "0.88rem", color: COLOUR, textDecoration: "none", fontWeight: 600,
          }}>📞 {contact.phone}</a>
        )}
        {contact.email && (
          <a href={`mailto:${contact.email}`} style={{
            fontSize: "0.88rem", color: COLOUR, textDecoration: "none", fontWeight: 600,
          }}>✉ {contact.email}</a>
        )}
      </div>
    </div>
  )
}

// ── Admin panel ───────────────────────────────────────────────────────────────
const EMPTY_FORM = { name: "", title: "", phone: "", email: "", house_number: "", category_ids: [] }

function AdminPanel({ categories, onSaved }) {
  const [contacts, setContacts]     = useState([])
  const [form, setForm]             = useState(EMPTY_FORM)
  const [editId, setEditId]         = useState(null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState("")
  const [catForm, setCatForm]       = useState("")
  const [catSaving, setCatSaving]   = useState(false)

  const loadContacts = useCallback(async () => {
    const { data } = await supabase
      .from("contacts")
      .select("id, name, title, phone, email, house_number, active, contact_category_members(category_id)")
      .order("display_order")
    setContacts(data || [])
  }, [])

  useEffect(() => { loadContacts() }, [loadContacts])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function toggleCat(id) {
    setForm(f => ({
      ...f,
      category_ids: f.category_ids.includes(id)
        ? f.category_ids.filter(c => c !== id)
        : [...f.category_ids, id],
    }))
  }

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
  }

  function cancelEdit() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setError("")
  }

  async function addCategory() {
    if (!catForm.trim()) return
    setCatSaving(true)
    await supabase.from("contact_categories").insert({ name: catForm.trim(), display_order: 99 })
    setCatForm("")
    setCatSaving(false)
    onSaved()
  }

  async function save() {
    setError("")
    if (!form.name.trim()) { setError("Name is required"); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        title: form.title.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        house_number: form.house_number.trim() || null,
      }
      let contactId = editId
      if (editId) {
        await supabase.from("contacts").update(payload).eq("id", editId)
      } else {
        const { data } = await supabase.from("contacts").insert(payload).select("id").single()
        contactId = data.id
      }
      // Sync category memberships
      await supabase.from("contact_category_members").delete().eq("contact_id", contactId)
      if (form.category_ids.length > 0) {
        await supabase.from("contact_category_members").insert(
          form.category_ids.map(cid => ({ contact_id: contactId, category_id: cid }))
        )
      }
      cancelEdit()
      loadContacts()
      onSaved()
    } catch (e) {
      setError(e.message || "Save failed")
    }
    setSaving(false)
  }

  async function toggleActive(contact) {
    await supabase.from("contacts").update({ active: !contact.active }).eq("id", contact.id)
    loadContacts()
  }

  async function deleteContact(contact) {
    if (!confirm(`Delete "${contact.name}"?`)) return
    await supabase.from("contacts").delete().eq("id", contact.id)
    loadContacts()
    onSaved()
  }

  return (
    <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--border)", paddingTop: "1.25rem" }}>
      <div style={{ fontWeight: 700, fontSize: "0.9rem", color: COLOUR, marginBottom: "1rem" }}>
        Admin — {editId ? "Edit Contact" : "Add Contact"}
      </div>

      {/* Category management */}
      <div style={{ marginBottom: "1rem" }}>
        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.4rem", fontWeight: 600 }}>
          Add category
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input value={catForm} onChange={e => setCatForm(e.target.value)}
            placeholder="Category name" style={{ ...inputStyle, flex: 1 }} />
          <button onClick={addCategory} disabled={catSaving || !catForm.trim()} style={{
            background: COLOUR, color: "#fff", border: "none", borderRadius: 10,
            padding: "0 1rem", fontWeight: 700, cursor: "pointer", fontSize: "0.88rem", fontFamily: "inherit",
          }}>Add</button>
        </div>
      </div>

      {/* Contact form */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
        <input value={form.name} onChange={e => set("name", e.target.value)}
          placeholder="Name *" style={inputStyle} />
        <input value={form.title} onChange={e => set("title", e.target.value)}
          placeholder="Title / Role" style={inputStyle} />
        <input value={form.phone} onChange={e => set("phone", e.target.value)}
          placeholder="Phone" type="tel" style={inputStyle} />
        <input value={form.email} onChange={e => set("email", e.target.value)}
          placeholder="Email" type="email" style={inputStyle} />
        <input value={form.house_number} onChange={e => set("house_number", e.target.value)}
          placeholder="House #" style={inputStyle} />

        {/* Category checkboxes */}
        {categories.length > 0 && (
          <div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.4rem", fontWeight: 600 }}>
              Categories
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {categories.map(c => (
                <button key={c.id} onClick={() => toggleCat(c.id)} style={{
                  padding: "0.3rem 0.75rem", borderRadius: 20, border: "none",
                  fontFamily: "inherit", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer",
                  background: form.category_ids.includes(c.id) ? COLOUR : "var(--surface2)",
                  color: form.category_ids.includes(c.id) ? "#fff" : "var(--text-dim)",
                }}>{c.name}</button>
              ))}
            </div>
          </div>
        )}

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
            cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
            opacity: saving ? 0.7 : 1,
          }}>{saving ? "Saving…" : (editId ? "Save Changes" : "Add Contact")}</button>
        </div>
      </div>

      {/* Existing contacts */}
      {contacts.length > 0 && (
        <div style={{ marginTop: "1.25rem" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-dim)", marginBottom: "0.5rem" }}>
            All contacts
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
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ContactsPage() {
  const { isAdmin } = useUser()
  const [categories, setCategories] = useState([])
  const [contacts, setContacts]     = useState([])
  const [activeFilter, setFilter]   = useState("all")
  const [loading, setLoading]       = useState(true)

  const load = useCallback(async () => {
    const [catRes, contactRes] = await Promise.all([
      supabase.from("contact_categories").select("id, name, display_order").eq("active", true).order("display_order"),
      supabase.from("contacts")
        .select("id, name, title, phone, email, house_number, contact_category_members(category_id)")
        .eq("active", true).order("display_order"),
    ])
    setCategories(catRes.data || [])
    setContacts(contactRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Group by category for display
  const filtered = activeFilter === "all"
    ? contacts
    : contacts.filter(c => (c.contact_category_members || []).some(m => m.category_id === activeFilter))

  // Group filtered contacts by category
  const grouped = activeFilter === "all" && categories.length > 0
    ? categories.map(cat => ({
        cat,
        members: contacts.filter(c => (c.contact_category_members || []).some(m => m.category_id === cat.id)),
      })).filter(g => g.members.length > 0)
    : null

  if (loading) return (
    <div style={{ padding: "1.25rem 1rem" }}>
      {[1,2,3].map(i => <div key={i} style={{ height: 72, borderRadius: 12, background: "var(--surface2)", marginBottom: "0.6rem" }} />)}
    </div>
  )

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      {/* Category filter chips */}
      {categories.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          {[{ id: "all", name: "All" }, ...categories].map(c => (
            <button key={c.id} onClick={() => setFilter(c.id)} style={{
              padding: "0.35rem 0.9rem", borderRadius: 20, border: "none",
              fontFamily: "inherit", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer",
              background: activeFilter === c.id ? COLOUR : "var(--surface2)",
              color: activeFilter === c.id ? "#fff" : "var(--text-dim)",
            }}>{c.name}</button>
          ))}
        </div>
      )}

      {/* Contact list */}
      {contacts.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "2.5rem 1rem",
          color: "var(--text-dim)", fontSize: "0.9rem",
        }}>
          <div style={{ fontSize: "1.8rem", marginBottom: "0.5rem" }}>👥</div>
          No contacts yet
        </div>
      ) : grouped ? (
        // All view: grouped by category
        grouped.map(({ cat, members }) => (
          <div key={cat.id}>
            <div style={{
              fontSize: "0.75rem", fontWeight: 700, color: COLOUR,
              letterSpacing: "0.06em", textTransform: "uppercase",
              marginBottom: "0.5rem", marginTop: "0.25rem",
            }}>{cat.name}</div>
            {members.map(c => <ContactCard key={c.id} contact={c} />)}
          </div>
        ))
      ) : (
        filtered.map(c => <ContactCard key={c.id} contact={c} />)
      )}

      {isAdmin && <AdminPanel categories={categories} onSaved={load} />}
    </div>
  )
}
