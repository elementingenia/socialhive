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

function FileTypeBadge({ fileType, fileName }) {
  const ext = fileName?.split(".").pop()?.toUpperCase() || "FILE"
  const colours = {
    PDF: { bg: "#fee2e2", color: "#991b1b" },
    DOC: { bg: "#dbeafe", color: "#1e40af" },
    DOCX: { bg: "#dbeafe", color: "#1e40af" },
    PNG:  { bg: "#dcfce7", color: "#166534" },
    JPG:  { bg: "#dcfce7", color: "#166534" },
  }
  const c = colours[ext] || { bg: "var(--surface2)", color: "var(--text-dim)" }
  return (
    <span style={{
      ...c, borderRadius: 6, padding: "0.15rem 0.5rem",
      fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.04em",
    }}>{ext}</span>
  )
}

function DocumentCard({ doc }) {
  return (
    <a href={doc.file_url} target="_blank" rel="noreferrer" style={{
      display: "block", textDecoration: "none",
      background: "var(--surface)", borderRadius: 12,
      border: "1px solid var(--border)", padding: "0.9rem 1rem",
      marginBottom: "0.6rem", boxShadow: "var(--shadow)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
            <FileTypeBadge fileName={doc.file_name} />
            <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)" }}>
              {doc.title}
            </span>
          </div>
          {doc.description && (
            <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.45 }}>
              {doc.description}
            </p>
          )}
          <div style={{ marginTop: "0.35rem", fontSize: "0.75rem", color: COLOUR, fontWeight: 600 }}>
            Open ↗
          </div>
        </div>
      </div>
    </a>
  )
}

// ── Admin upload panel ────────────────────────────────────────────────────────
function AdminPanel({ categories, onUploaded }) {
  const [form, setForm] = useState({ title: "", description: "", category_id: "" })
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [docs, setDocs] = useState([])
  const [catForm, setCatForm] = useState("")
  const [catSaving, setCatSaving] = useState(false)
  const { member } = useUser()

  const loadDocs = useCallback(async () => {
    const { data } = await supabase
      .from("documents")
      .select("id, title, file_name, active, category:document_categories(name)")
      .order("created_at", { ascending: false })
    setDocs(data || [])
  }, [])

  useEffect(() => { loadDocs() }, [loadDocs])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function addCategory() {
    if (!catForm.trim()) return
    setCatSaving(true)
    await supabase.from("document_categories").insert({ name: catForm.trim(), display_order: 99 })
    setCatForm("")
    setCatSaving(false)
    onUploaded()
  }

  async function handleUpload() {
    setError("")
    if (!form.title.trim()) { setError("Title is required"); return }
    if (!file) { setError("Please select a file"); return }
    setUploading(true)
    try {
      const ext = file.name.split(".").pop()
      const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from("community-docs").upload(path, file)
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from("community-docs").getPublicUrl(path)
      // Use signed URL approach — generate a long-lived signed URL
      const { data: signedData } = await supabase.storage
        .from("community-docs").createSignedUrl(path, 60 * 60 * 24 * 365 * 10) // 10 years
      const fileUrl = signedData?.signedUrl || publicUrl
      const { error: dbErr } = await supabase.from("documents").insert({
        title: form.title.trim(),
        description: form.description.trim() || null,
        category_id: form.category_id || null,
        file_url: fileUrl,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: member?.id || null,
      })
      if (dbErr) throw dbErr
      setForm({ title: "", description: "", category_id: "" })
      setFile(null)
      document.getElementById("doc-file-input").value = ""
      loadDocs()
      onUploaded()
    } catch (e) {
      setError(e.message || "Upload failed")
    }
    setUploading(false)
  }

  async function toggleActive(doc) {
    await supabase.from("documents").update({ active: !doc.active }).eq("id", doc.id)
    loadDocs()
  }

  async function deleteDoc(doc) {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return
    await supabase.from("documents").delete().eq("id", doc.id)
    loadDocs()
    onUploaded()
  }

  return (
    <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--border)", paddingTop: "1.25rem" }}>
      <div style={{ fontWeight: 700, fontSize: "0.9rem", color: COLOUR, marginBottom: "1rem" }}>
        Admin — Upload Document
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

      {/* Upload form */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
        <input value={form.title} onChange={e => set("title", e.target.value)}
          placeholder="Document title *" style={inputStyle} />
        <textarea value={form.description} onChange={e => set("description", e.target.value)}
          placeholder="Description (optional)" rows={2}
          style={{ ...inputStyle, resize: "vertical" }} />
        <select value={form.category_id} onChange={e => set("category_id", e.target.value)} style={inputStyle}>
          <option value="">No category</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.3rem" }}>
            Select file (PDF, Word, image — max 10MB)
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

      {/* Existing docs list */}
      {docs.length > 0 && (
        <div style={{ marginTop: "1.25rem" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-dim)", marginBottom: "0.5rem" }}>
            All documents
          </div>
          {docs.map(doc => (
            <div key={doc.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0.6rem 0.75rem", background: "var(--surface2)", borderRadius: 8,
              marginBottom: "0.4rem", gap: "0.5rem",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)", truncate: true }}>
                  {doc.title}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                  {doc.category?.name || "No category"} · {doc.file_name}
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                <button onClick={() => toggleActive(doc)} style={{
                  fontSize: "0.75rem", padding: "0.25rem 0.6rem", borderRadius: 6,
                  border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit",
                  background: doc.active ? "#dcfce7" : "#fee2e2",
                  color: doc.active ? "#166534" : "#991b1b",
                }}>{doc.active ? "Active" : "Hidden"}</button>
                <button onClick={() => deleteDoc(doc)} style={{
                  fontSize: "0.75rem", padding: "0.25rem 0.6rem", borderRadius: 6,
                  border: "1px solid #fca5a5", cursor: "pointer", fontFamily: "inherit",
                  background: "#fee2e2", color: "#991b1b",
                }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
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

  const load = useCallback(async () => {
    const [catRes, docRes] = await Promise.all([
      supabase.from("document_categories").select("id, name, display_order").eq("active", true).order("display_order"),
      supabase.from("documents").select("id, title, description, file_url, file_name, file_type, category:document_categories(id, name)").eq("active", true).order("created_at", { ascending: false }),
    ])
    setCategories(catRes.data || [])
    setDocuments(docRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = activeFilter === "all"
    ? documents
    : documents.filter(d => d.category?.id === activeFilter)

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

      {/* Document list */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "2.5rem 1rem",
          color: "var(--text-dim)", fontSize: "0.9rem",
        }}>
          <div style={{ fontSize: "1.8rem", marginBottom: "0.5rem" }}>📄</div>
          No documents yet
        </div>
      ) : (
        filtered.map(doc => <DocumentCard key={doc.id} doc={doc} />)
      )}

      {isAdmin && <AdminPanel categories={categories} onUploaded={load} />}
    </div>
  )
}
