"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

function BookCard({ book }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{ background: "var(--surface)", borderRadius: "14px", border: "1px solid var(--border)", padding: "0.9rem 1rem", cursor: "pointer" }}
    >
      <div style={{ display: "flex", gap: "0.85rem", alignItems: "flex-start" }}>
        {book.cover_url ? (
          <img src={book.cover_url} alt={book.title} style={{ width: 52, height: 74, objectFit: "cover", borderRadius: "6px", flexShrink: 0 }} />
        ) : (
          <div style={{ width: 52, height: 74, borderRadius: "6px", background: "var(--purple)20", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "1.5rem" }}>📖</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.2, marginBottom: "0.2rem" }}>{book.title}</div>
          {book.author && <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "0.4rem" }}>by {book.author}</div>}
          {book.rating && (
            <div style={{ fontSize: "0.75rem", color: "var(--purple)", fontWeight: 600 }}>★ {book.rating}</div>
          )}
        </div>
        <div style={{ color: "var(--text-dim)", fontSize: "1rem", flexShrink: 0 }}>{expanded ? "▲" : "▼"}</div>
      </div>
      {expanded && book.summary && (
        <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)", fontSize: "0.85rem", color: "var(--text-dim)", lineHeight: 1.6 }}>
          {book.summary}
        </div>
      )}
    </div>
  )
}

export default function BooksPage() {
  const [books,   setBooks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState("")

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("books")
        .select("*")
        .order("added_at", { ascending: false })
      setBooks(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = books.filter(b =>
    !search ||
    b.title?.toLowerCase().includes(search.toLowerCase()) ||
    b.author?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return (
    <div style={{ padding: "1.25rem 1rem" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {[1,2,3].map(i => <div key={i} style={{ height: 90, borderRadius: "14px", background: "var(--surface2)" }} />)}
      </div>
    </div>
  )

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      <input
        type="text"
        placeholder="Search books..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: "100%", padding: "0.75rem 1rem", borderRadius: "12px",
          border: "1px solid var(--border)", background: "var(--surface)",
          color: "var(--text)", fontSize: "0.95rem", marginBottom: "1rem",
          boxSizing: "border-box",
        }}
      />
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--text-dim)", padding: "2rem", fontSize: "0.9rem" }}>
          {books.length === 0 ? "No books added yet" : "No results"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {filtered.map(b => <BookCard key={b.id} book={b} />)}
        </div>
      )}
    </div>
  )
}
