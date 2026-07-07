"use client"
import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import { Sheet, COLOUR, inputStyle, labelStyle, getToken } from "@/components/ResidentEditPanel"

const secondaryButtonStyle = {
  padding: "0.5rem 0.9rem", borderRadius: 10, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--text)", fontWeight: 700,
  fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit",
}

function FileTypeBadge({ fileName }) {
  const ext = fileName?.split(".").pop()?.toUpperCase() || "FILE"
  const colours = {
    PDF:  { bg: "#fee2e2", color: "#991b1b" },
    DOC:  { bg: "#dbeafe", color: "#1e40af" },
    DOCX: { bg: "#dbeafe", color: "#1e40af" },
    PNG:  { bg: "#dcfce7", color: "#166534" },
    JPG:  { bg: "#dcfce7", color: "#166534" },
    JPEG: { bg: "#dcfce7", color: "#166534" },
  }
  const c = colours[ext] || { bg: "var(--surface2)", color: "var(--text-dim)" }
  return (
    <span style={{
      ...c, borderRadius: 6, padding: "0.15rem 0.5rem",
      fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.04em",
    }}>{ext}</span>
  )
}

// ── Document card — primary content (open) always front and centre;         │
// Status/Delete are small, secondary, admin-only actions below a divider ────
function DocumentCard({ doc, isAdmin, badge, onToggleActive, onDelete }) {
  return (
    <div style={{
      background: "var(--surface)", borderRadius: 12,
      border: "1px solid var(--border)", padding: "0.9rem 1rem",
      marginBottom: "0.6rem", boxShadow: "var(--shadow)",
    }}>
      <a href={doc.file_url} target="_blank" rel="noreferrer" style={{ display: "block", textDecoration: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem", flexWrap: "wrap" }}>
          <FileTypeBadge fileName={doc.file_name} />
          <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)" }}>{doc.title}</span>
          {badge && (
            <span style={{
              fontSize: "0.65rem", fontWeight: 700, padding: "0.1rem 0.45rem",
              borderRadius: 10, background: "var(--surface2)", color: "var(--text-dim)",
            }}>{badge}</span>
          )}
        </div>
        {doc.description && (
          <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.45 }}>
            {doc.description}
          </p>
        )}
        <div style={{ marginTop: "0.35rem", fontSize: "0.75rem", color: COLOUR, fontWeight: 600 }}>
          Open ↗
        </div>
      </a>
      {isAdmin && (
        <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.6rem", paddingTop: "0.6rem", borderTop: "1px solid var(--border)" }}>
          <button onClick={onToggleActive} style={{
            fontSize: "0.75rem", padding: "0.25rem 0.6rem", borderRadius: 6, border: "1px solid var(--border)",
            cursor: "pointer", fontFamily: "inherit",
            background: doc.active ? "#dcfce7" : "#fee2e2", color: doc.active ? "#166534" : "#991b1b",
          }}>{doc.active ? "Active" : "Hidden"}</button>
          <button onClick={onDelete} style={{
            fontSize: "0.75rem", padding: "0.25rem 0.6rem", borderRadius: 6, border: "1px solid #fca5a5",
            cursor: "pointer", fontFamily: "inherit", background: "#fee2e2", color: "#991b1b",
          }}>Delete</button>
        </div>
      )}
    </div>
  )
}

// ── Category single-select — existing categories only, no inline create ──────
function CategorySelect({ categories, value, onChange, placeholder = "No category" }) {
  const [open, setOpen] = useState(false)
  const selected = categories.find(c => c.id === value)

  return (
    <div style={{ position: "relative" }}>
      <button type="button"
        onClick={() => setOpen(o => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{
          ...inputStyle, textAlign: "left", display: "flex", justifyContent: "space-between",
          alignItems: "center", cursor: "pointer",
        }}>
        <span style={{ color: selected ? "var(--text)" : "var(--text-dim)" }}>{selected ? selected.name : placeholder}</span>
        <span style={{ color: "var(--text-dim)", fontSize: "0.7rem" }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "var(--shadow)", maxHeight: 220, overflowY: "auto",
        }}>
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onChange(""); setOpen(false) }} style={{
            display: "block", width: "100%", textAlign: "left", padding: "0.6rem 0.85rem",
            background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
            fontSize: "0.88rem", color: "var(--text-dim)",
          }}>{placeholder}</button>
          {categories.map(c => (
            <button key={c.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onChange(c.id); setOpen(false) }} style={{
              display: "block", width: "100%", textAlign: "left", padding: "0.6rem 0.85rem",
              background: "none", border: "none", borderTop: "1px solid var(--border)", cursor: "pointer",
              fontFamily: "inherit", fontSize: "0.88rem", color: "var(--text)",
            }}>{c.name}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Add Document ───────────────────────────────────────────────────────────────
function AddDocumentForm({ categories, onUploaded, onClose }) {
  const [form, setForm]     = useState({ title: "", description: "", category_id: "" })
  const [file, setFile]     = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError]   = useState("")

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleUpload() {
    setError("")
    if (!form.title.trim()) { setError("Title is required"); return }
    if (!file) { setError("Please select a file"); return }
    setUploading(true)
    try {
      const token = await getToken()
      const fd = new FormData()
      fd.append("file", file)
      fd.append("title", form.title.trim())
      fd.append("description", form.description.trim())
      fd.append("category_id", form.category_id)
      const res = await fetch("/api/info/documents", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Upload failed")
      onUploaded()
      onClose()
    } catch (e) {
      setError(e.message)
    }
    setUploading(false)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div>
        <label style={labelStyle}>Title <span style={{ color: "var(--danger)" }}>*</span></label>
        <input value={form.title} onChange={e => set("title", e.target.value)}
          style={{ ...inputStyle, border: `1.5px solid ${form.title.trim() ? "var(--green)" : "var(--danger)"}` }} />
      </div>
      <div>
        <label style={labelStyle}>Description</label>
        <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2}
          style={{ ...inputStyle, resize: "vertical" }} />
      </div>
      <div>
        <label style={labelStyle}>Category</label>
        <CategorySelect categories={categories} value={form.category_id} onChange={v => set("category_id", v)} />
      </div>
      <div>
        <label style={labelStyle}>File <span style={{ color: "var(--danger)" }}>*</span></label>
        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.3rem" }}>
          PDF, Word, or image — max 10MB
        </div>
        <input id="doc-file-input" type="file"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          onChange={e => setFile(e.target.files[0] || null)}
          style={{ fontSize: "0.88rem", color: "var(--text)" }} />
      </div>
      {error && <div style={{ color: "#b91c1c", fontSize: "0.83rem" }}>{error}</div>}
      <button onClick={handleUpload} disabled={uploading} style={{
        background: COLOUR, color: "#fff", border: "none", borderRadius: 10,
        padding: "0.75rem", fontWeight: 700, fontSize: "0.95rem",
        cursor: uploading ? "not-allowed" : "pointer", fontFamily: "inherit",
        opacity: uploading ? 0.7 : 1,
      }}>{uploading ? "Uploading…" : "Upload Document"}</button>
    </div>
  )
}

// ── Category management ───────────────────────────────────────────────────────
function DocCategoryManager({ categories, setCategories, onSaved }) {
  const [catForm, setCatForm]     = useState("")
  const [catSaving, setCatSaving] = useState(false)
  const [catError, setCatError]   = useState("")

  async function addCategory() {
    if (!catForm.trim()) return
    setCatSaving(true); setCatError("")
    const token = await getToken()
    const res = await fetch("/api/info/doc-categories", {
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
    const res = await fetch("/api/info/doc-categories", {
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
            <button onClick={() => deleteCategory(c)} style={{
              background: "none", border: "none", color: "#991b1b", cursor: "pointer",
              fontSize: "0.78rem", fontWeight: 600, fontFamily: "inherit",
            }}>Delete</button>
          </div>
        ))}
      </div>
      {catError && <div style={{ color: "#b91c1c", fontSize: "0.8rem", marginTop: "0.5rem" }}>{catError}</div>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DocumentsPage() {
  const { isAdmin } = useUser()
  const [categories, setCategories] = useState([])
  const [documents, setDocuments]   = useState([])
  const [activeFilter, setFilter]   = useState("all")
  const [loading, setLoading]       = useState(true)
  const [sheet, setSheet]           = useState(null) // null | "add" | "categories"

  const load = useCallback(async () => {
    const [catRes, docRes] = await Promise.all([
      supabase.from("document_categories").select("id, name, display_order").eq("active", true).order("display_order"),
      supabase.from("documents")
        .select("id, title, description, file_url, file_name, file_type, active, category:document_categories(id, name)")
        .order("created_at", { ascending: false }),
    ])
    setCategories(catRes.data || [])
    setDocuments(docRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleActive(doc) {
    const token = await getToken()
    await fetch("/api/info/documents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ id: doc.id, active: !doc.active }),
    })
    load()
  }

  async function deleteDoc(doc) {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return
    const token = await getToken()
    await fetch("/api/info/documents", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ id: doc.id }),
    })
    load()
  }

  // Admins see hidden documents too (flagged), so nothing admin-manageable
  // silently disappears — everyone else only ever sees active ones.
  const visible = documents.filter(d => d.active || isAdmin)
  const filtered = activeFilter === "all" ? visible : visible.filter(d => d.category?.id === activeFilter)

  if (loading) return (
    <div style={{ padding: "1.25rem 1rem" }}>
      {[1,2,3].map(i => <div key={i} style={{ height: 72, borderRadius: 12, background: "var(--surface2)", marginBottom: "0.6rem" }} />)}
    </div>
  )

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
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

      {isAdmin && (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button onClick={() => setSheet("add")} style={secondaryButtonStyle}>+ Add Document</button>
          <button onClick={() => setSheet("categories")} style={secondaryButtonStyle}>Manage Categories</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--text-dim)", fontSize: "0.9rem" }}>
          <div style={{ fontSize: "1.8rem", marginBottom: "0.5rem" }}>📄</div>
          No documents yet
        </div>
      ) : (
        filtered.map(doc => (
          <DocumentCard key={doc.id} doc={doc} isAdmin={isAdmin}
            badge={isAdmin && !doc.active ? "Hidden" : null}
            onToggleActive={() => toggleActive(doc)}
            onDelete={() => deleteDoc(doc)} />
        ))
      )}

      <Sheet open={sheet === "add"} onClose={() => setSheet(null)} title="Add Document">
        <AddDocumentForm categories={categories} onUploaded={load} onClose={() => setSheet(null)} />
      </Sheet>

      <Sheet open={sheet === "categories"} onClose={() => setSheet(null)} title="Manage Categories">
        <DocCategoryManager categories={categories} setCategories={setCategories} onSaved={load} />
      </Sheet>
    </div>
  )
}
