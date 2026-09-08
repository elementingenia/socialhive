"use client"
import { useState, useEffect, useMemo } from "react"
import { supabase } from "@/lib/supabase"

const COLOUR = "var(--committee)"

function fmt(iso) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
}

function FileTypeBadge({ fileName }) {
  const ext = fileName?.split(".").pop()?.toUpperCase() || "FILE"
  const colours = {
    PDF: { bg: "#fee2e2", color: "#991b1b" },
    DOC: { bg: "#dbeafe", color: "#1e40af" }, DOCX: { bg: "#dbeafe", color: "#1e40af" },
    PNG: { bg: "#dcfce7", color: "#166534" }, JPG: { bg: "#dcfce7", color: "#166534" }, JPEG: { bg: "#dcfce7", color: "#166534" },
  }
  const c = colours[ext] || { bg: "var(--surface2)", color: "var(--text-dim)" }
  return <span style={{ ...c, borderRadius: 6, padding: "0.15rem 0.5rem", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.04em" }}>{ext}</span>
}

// Committee > Documents — a dedicated, searchable/filterable tab for
// documents that came out of a Committee Update (Iain, 2026-09-08),
// replacing the old inline "Committee Meeting Minutes" block that used to
// sit at the bottom of Committee Home (that block only ever looked at one
// fixed category; this replaces it with the general case -- any category,
// searchable, filterable -- see 101_committee_documents.sql).
//
// Scope of what shows here, and why it's slightly wider than Iain's own
// wording ("all documents added to updates where a category was
// nominated"): a document only gets `source_committee_post_id` set going
// forward, from this point on -- but "Committee Meetings" documents
// already uploaded directly on the Documents screen (the OLD route into
// this same category, still open to Committee Owners) would otherwise
// silently vanish from this list the day this ships. Included both:
//   - source_committee_post_id IS NOT NULL (the new "also file this" flow)
//   - OR category = "Committee Meetings" (today's existing documents, plus
//     anything still uploaded the old way on the Documents screen)
// Flagged for Iain: if he'd rather this be ONLY documents that came
// through a Committee post (nothing else, even if categorised the same
// way), that's a one-line change -- say the word.
export default function CommitteeDocumentsPage() {
  const [docs, setDocs] = useState(null)
  const [categories, setCategories] = useState([])
  const [categoryFilter, setCategoryFilter] = useState("")
  const [search, setSearch] = useState("")

  useEffect(() => {
    (async () => {
      const { data: meetingsCat } = await supabase
        .from("document_categories").select("id").eq("name", "Committee Meetings").maybeSingle()

      let query = supabase
        .from("documents")
        .select("id, title, file_url, file_name, created_at, category:document_categories(id, name)")
        .eq("active", true)
        .order("created_at", { ascending: false })

      query = meetingsCat?.id
        ? query.or(`source_committee_post_id.not.is.null,category_id.eq.${meetingsCat.id}`)
        : query.not("source_committee_post_id", "is", null)

      const { data, error } = await query
      setDocs(error ? [] : (data || []))
    })()

    supabase.from("document_categories").select("id, name").eq("active", true)
      .order("display_order").then(({ data }) => setCategories(data || []))
  }, [])

  const filtered = useMemo(() => {
    if (!docs) return []
    return docs.filter(d => {
      if (categoryFilter && d.category?.id !== categoryFilter) return false
      if (search.trim() && !d.title.toLowerCase().includes(search.trim().toLowerCase())) return false
      return true
    })
  }, [docs, categoryFilter, search])

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by document name…"
          style={{
            padding: "0.6rem 0.8rem", borderRadius: 10, border: "1px solid var(--border)",
            fontSize: "0.9rem", fontFamily: "inherit", background: "var(--surface)", color: "var(--text)",
          }} />
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{
          padding: "0.55rem 0.7rem", borderRadius: 10, border: "1px solid var(--border)",
          fontSize: "0.85rem", fontFamily: "inherit", background: "var(--surface)", color: "var(--text)",
        }}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {docs === null ? (
        <div style={{ color: "var(--text-dim)" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem 1rem", color: "var(--text-dim)", fontSize: "0.9rem" }}>
          {docs.length === 0 ? "No Committee documents yet" : "No documents match your search"}
        </div>
      ) : (
        filtered.map(d => (
          <a key={d.id} href={d.file_url} target="_blank" rel="noreferrer" style={{
            display: "block", background: "var(--surface)", border: "1px solid var(--border)",
            borderLeft: `4px solid ${COLOUR}`, borderRadius: 10, padding: "0.75rem 0.9rem",
            marginBottom: 8, textDecoration: "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <FileTypeBadge fileName={d.file_name} />
              <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text)" }}>{d.title}</span>
            </div>
            <div style={{ marginTop: 4, fontSize: "0.75rem", color: "var(--text-dim)" }}>
              {d.category?.name ? `${d.category.name} · ` : ""}{fmt(d.created_at)}
            </div>
          </a>
        ))
      )}
    </div>
  )
}
