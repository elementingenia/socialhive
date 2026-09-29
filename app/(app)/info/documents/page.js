"use client"
import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import { useOwners } from "@/lib/useOwners"
import { Sheet, CategoryPicker, COLOUR, inputStyle, labelStyle, getToken } from "@/components/ResidentEditPanel"
import { MAX_ATTACHMENT_BYTES, tooLargeMessage } from "@/lib/attachmentLimits"

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
function DocumentCard({ doc, isAdmin, badge, onEdit, onToggleActive, onDelete }) {
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
        <div style={{ marginTop: "0.35rem", fontSize: "0.75rem", display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "baseline" }}>
          <span style={{ color: COLOUR, fontWeight: 600 }}>Open ↗</span>
          {doc.categories?.length > 0 && (
            <span style={{ color: "var(--text-dim)" }}>· {doc.categories.map(c => c.name).join(", ")}</span>
          )}
        </div>
      </a>
      {isAdmin && (
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.6rem", paddingTop: "0.6rem", borderTop: "1px solid var(--border)" }}>
          <button onClick={onEdit} style={{
            fontSize: "0.75rem", padding: "0.25rem 0.6rem", borderRadius: 6, border: "1px solid var(--border)",
            cursor: "pointer", fontFamily: "inherit", background: "var(--surface2)", color: "var(--text)",
          }}>Edit</button>
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

// Categories picker for documents: the shared multi-select used on Contacts,
// with inline create switched off (its create button posts to the CONTACT
// categories endpoint -- document categories are added under Manage
// Categories instead). Options listed A–Z per the dropdown standard.
function DocCategoriesPicker({ categories, value, onChange }) {
  const sorted = [...categories].sort((x, y) => x.name.localeCompare(y.name))
  return <CategoryPicker categories={sorted} selectedIds={value} onChange={onChange} allowCreate={false} />
}

// ── Add Document ───────────────────────────────────────────────────────────────
function AddDocumentForm({ categories, onUploaded, onClose }) {
  const [form, setForm]     = useState({ title: "", description: "", category_ids: [] })
  const [file, setFile]     = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError]   = useState("")

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function pickFile(f) {
    setError("")
    if (f && f.size > MAX_ATTACHMENT_BYTES) { setError(tooLargeMessage(f)); setFile(null); return }
    setFile(f)
  }

  // Reads a JSON error body if there is one; falls back to a readable
  // message when the response isn't JSON at all (a plain-text 413 from
  // Vercel's own request-size limit would otherwise crash res.json() with
  // a cryptic "Unexpected token" parse error instead of telling the person
  // what actually happened -- see app/(app)/committee/page.js for the
  // original diagnosis of this exact failure mode).
  async function readError(res, fallback) {
    const text = await res.text()
    try { return JSON.parse(text).error || fallback } catch {
      if (res.status === 413) return "That file is too large to upload."
      return fallback
    }
  }

  async function handleUpload() {
    setError("")
    if (!form.title.trim()) { setError("Title is required"); return }
    if (!file) { setError("Please select a file"); return }
    if (file.size > MAX_ATTACHMENT_BYTES) { setError(tooLargeMessage(file)); return }
    setUploading(true)
    try {
      const token = await getToken()

      if (!file.type?.startsWith("image/")) {
        // PDF/Word -- signed-upload flow (see app/api/info/documents/
        // route.js's header comment: this is what makes the "max 4MB"
        // text above actually true, instead of a number nobody checked).
        const signRes = await fetch("/api/info/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            action: "sign", file_name: file.name, content_type: file.type,
            file_size: file.size, category_ids: form.category_ids,
          }),
        })
        if (!signRes.ok) throw new Error(await readError(signRes, "Could not prepare the upload"))
        const signData = await signRes.json()

        const { error: upErr } = await supabase.storage
          .from("community-docs")
          .uploadToSignedUrl(signData.path, signData.token, file, { contentType: signData.content_type })
        if (upErr) throw new Error(upErr.message || "Upload failed")

        const completeRes = await fetch("/api/info/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            action: "complete", path: signData.path, file_name: file.name, content_type: signData.content_type,
            title: form.title.trim(), description: form.description.trim(), category_ids: form.category_ids,
            file_size: file.size,
          }),
        })
        if (!completeRes.ok) throw new Error(await readError(completeRes, "Could not save the uploaded document"))
      } else {
        const fd = new FormData()
        fd.append("file", file)
        fd.append("title", form.title.trim())
        fd.append("description", form.description.trim())
        form.category_ids.forEach(id => fd.append("category_ids", id))
        const res = await fetch("/api/info/documents", {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` },
          body: fd,
        })
        if (!res.ok) throw new Error(await readError(res, "Upload failed"))
      }

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
        <label style={labelStyle}>Categories</label>
        <DocCategoriesPicker categories={categories} value={form.category_ids} onChange={v => set("category_ids", v)} />
      </div>
      <div>
        <label style={labelStyle}>File <span style={{ color: "var(--danger)" }}>*</span></label>
        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.3rem" }}>
          PDF, Word, or image — max 4MB
        </div>
        <input id="doc-file-input" type="file"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          onChange={e => pickFile(e.target.files[0] || null)}
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

// ── Edit Document (admin only) — title, description, categories. The file
// itself is not replaceable here; delete and re-upload for that. ──────────────
function EditDocumentForm({ doc, categories, onSaved, onClose }) {
  const [form, setForm] = useState({
    title: doc.title || "",
    description: doc.description || "",
    category_ids: (doc.categories || []).map(c => c.id),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState("")
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    setError("")
    if (!form.title.trim()) { setError("Title is required"); return }
    setSaving(true)
    try {
      const token = await getToken()
      const res = await fetch("/api/info/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: doc.id,
          title: form.title.trim(),
          description: form.description.trim(),
          category_ids: form.category_ids,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Could not save changes")
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
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
        <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={3}
          style={{ ...inputStyle, resize: "vertical" }} />
      </div>
      <div>
        <label style={labelStyle}>Categories</label>
        <DocCategoriesPicker categories={categories} value={form.category_ids} onChange={v => set("category_ids", v)} />
      </div>
      <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
        <FileTypeBadge fileName={doc.file_name} />
        <span style={{ wordBreak: "break-all" }}>{doc.file_name}</span>
        <span>· to replace the file, delete and re-upload</span>
      </div>
      {error && <div style={{ color: "#b91c1c", fontSize: "0.83rem" }}>{error}</div>}
      <button onClick={handleSave} disabled={saving} style={{
        background: COLOUR, color: "#fff", border: "none", borderRadius: 10,
        padding: "0.75rem", fontWeight: 700, fontSize: "0.95rem",
        cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
        opacity: saving ? 0.7 : 1,
      }}>{saving ? "Saving…" : "Save Changes"}</button>
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
  const { isAdmin, member } = useUser()
  // Committee Owners can also upload here, scoped to the Committee Meetings
  // category only (decision 5, Social_Hive_Committee_Notice_Board_Scope_v3_
  // FINAL) -- the API (app/api/info/documents/route.js) is what actually
  // enforces the category restriction; this just decides whether the
  // upload UI shows at all for a non-admin Committee Owner.
  const { owners: committeeOwners } = useOwners("hub", "committee")
  const isCommitteeOwner = !!member?.id && committeeOwners.some(o => o.id === member.id)
  const [categories, setCategories] = useState([])
  const [documents, setDocuments]   = useState([])
  const [activeFilter, setFilter]   = useState("all")
  const [loading, setLoading]       = useState(true)
  const [sheet, setSheet]           = useState(null) // null | "add" | "categories" | "edit"
  const [editingDoc, setEditingDoc] = useState(null)

  const load = useCallback(async () => {
    const [catRes, docRes] = await Promise.all([
      supabase.from("document_categories").select("id, name, display_order").eq("active", true).order("display_order"),
      supabase.from("documents")
        .select("id, title, description, file_url, file_name, file_type, active, links:document_category_links(category:document_categories(id, name))")
        .order("created_at", { ascending: false }),
    ])
    setCategories(catRes.data || [])
    // A document can sit in several categories (migration 115); flatten the
    // join rows to a plain, A–Z list per document.
    setDocuments((docRes.data || []).map(d => ({
      ...d,
      categories: (d.links || []).map(l => l.category).filter(Boolean)
        .sort((x, y) => x.name.localeCompare(y.name)),
    })))
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
  const filtered = activeFilter === "all" ? visible : visible.filter(d => d.categories.some(c => c.id === activeFilter))

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

      {(isAdmin || isCommitteeOwner) && (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button onClick={() => setSheet("add")} style={secondaryButtonStyle}>+ Add Document</button>
          {isAdmin && <button onClick={() => setSheet("categories")} style={secondaryButtonStyle}>Manage Categories</button>}
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
            onEdit={() => { setEditingDoc(doc); setSheet("edit") }}
            onToggleActive={() => toggleActive(doc)}
            onDelete={() => deleteDoc(doc)} />
        ))
      )}

      <Sheet open={sheet === "add"} onClose={() => setSheet(null)} title="Add Document">
        <AddDocumentForm categories={categories} onUploaded={load} onClose={() => setSheet(null)} />
      </Sheet>

      <Sheet open={sheet === "edit" && !!editingDoc} onClose={() => { setSheet(null); setEditingDoc(null) }} title="Edit Document">
        {editingDoc && (
          <EditDocumentForm key={editingDoc.id} doc={editingDoc} categories={categories} onSaved={load}
            onClose={() => { setSheet(null); setEditingDoc(null) }} />
        )}
      </Sheet>

      <Sheet open={sheet === "categories"} onClose={() => setSheet(null)} title="Manage Categories">
        <DocCategoryManager categories={categories} setCategories={setCategories} onSaved={load} />
      </Sheet>
    </div>
  )
}
