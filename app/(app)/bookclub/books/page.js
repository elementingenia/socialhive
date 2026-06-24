"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"

function GenrePills({ genres }) {
  if (!genres) return null
  const list = genres.split(",").map(g => g.trim()).filter(Boolean)
  if (!list.length) return null
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
      {list.map(g => (
        <span key={g} style={{ fontSize: 10, color: "var(--purple)", background: "var(--purple)15",
          padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>{g}</span>
      ))}
    </div>
  )
}

function fmtDate(str) {
  if (!str) return ""
  const [y, m, d] = str.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
}

function BookCard({ book }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div onClick={() => setExpanded(e => !e)}
      style={{ background: "var(--surface)", borderRadius: "14px", border: "1px solid var(--border)", padding: "0.9rem 1rem", cursor: "pointer" }}>
      <div style={{ display: "flex", gap: "0.85rem", alignItems: "flex-start" }}>
        {book.cover_url ? (
          <img src={book.cover_url} alt={book.title} style={{ width: 52, height: 74, objectFit: "cover", borderRadius: "6px", flexShrink: 0 }} />
        ) : (
          <div style={{ width: 52, height: 74, borderRadius: "6px", background: "var(--purple)20",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "1.5rem" }}>📖</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.2, marginBottom: "0.2rem" }}>{book.title}</div>
          {book.author && <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "0.25rem" }}>by {book.author}</div>}
          <GenrePills genres={book.genres} />
          {book.rating && (
            <div style={{ fontSize: "0.75rem", color: "var(--purple)", fontWeight: 600, marginTop: "0.25rem" }}>★ {book.rating}</div>
          )}
        </div>
        <div style={{ color: "var(--text-dim)", fontSize: "1rem", flexShrink: 0 }}>{expanded ? "▲" : "▼"}</div>
      </div>
      {expanded && book.summary && (
        <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)",
          fontSize: "0.85rem", color: "var(--text-dim)", lineHeight: 1.6 }}>
          {book.summary}
        </div>
      )}
    </div>
  )
}

function AttendanceCard({ event }) {
  const book = event.books
  return (
    <div style={{ background: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)", padding: "0.8rem 1rem",
      display: "flex", gap: "0.65rem", alignItems: "flex-start" }}>
      {book?.cover_url ? (
        <img src={book.cover_url} alt={book.title} style={{ width: 40, height: 56, objectFit: "cover", borderRadius: "5px", flexShrink: 0 }} />
      ) : (
        <div style={{ width: 40, height: 56, borderRadius: "5px", background: "var(--purple)20",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "1.2rem" }}>📖</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "0.88rem", lineHeight: 1.2 }}>{book?.title || event.title}</div>
        {book?.author && <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>by {book.author}</div>}
        <div style={{ fontSize: "0.72rem", color: "var(--purple)", marginTop: "0.2rem" }}>{fmtDate(event.event_date)}</div>
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", background: "#dcfce7",
        color: "#15803d", borderRadius: "12px", padding: "0.2rem 0.55rem", fontSize: "0.7rem", fontWeight: 700, flexShrink: 0 }}>
        ✓ Attended
      </div>
    </div>
  )
}

export default function BooksPage() {
  const { member }   = useUser()
  const [books,      setBooks]      = useState([])
  const [myHistory,  setMyHistory]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState("")
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    async function load() {
      const [booksRes, historyRes] = await Promise.all([
        supabase.from("books").select("*").order("added_at", { ascending: false }),
        member?.id
          ? supabase
              .from("bookings")
              .select("id, event_id, events(id, title, event_date, books(id, title, author, cover_url))")
              .eq("member_id", member.id)
              .eq("status", "confirmed")
              .not("events.hub_type", "is", null)
              .then(({ data }) => {
                // Filter to bookclub events only and sort by date
                const bcBookings = (data || [])
                  .filter(b => b.events?.books)
                  .sort((a, b) => (b.events?.event_date || "").localeCompare(a.events?.event_date || ""))
                return bcBookings
              })
          : Promise.resolve([]),
      ])
      setBooks(booksRes.data || [])
      setMyHistory(historyRes)
      setLoading(false)
    }
    load()
  }, [member?.id])

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
      {/* My attendance history */}
      {myHistory.length > 0 && (
        <div style={{ marginBottom: "1.25rem" }}>
          <button onClick={() => setShowHistory(o => !o)}
            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "0.85rem 1rem", background: "var(--purple)15", border: "1px solid var(--purple)40",
              borderRadius: "14px", cursor: "pointer", marginBottom: showHistory ? "0.6rem" : 0 }}>
            <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--purple)" }}>
              📚 My Book Club History ({myHistory.length})
            </span>
            <span style={{ color: "var(--purple)", fontSize: "1rem", transition: "transform 0.2s",
              transform: showHistory ? "rotate(180deg)" : "none", display: "inline-block" }}>▼</span>
          </button>
          {showHistory && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {myHistory.map(b => <AttendanceCard key={b.id} event={b.events} />)}
            </div>
          )}
        </div>
      )}

      {/* Book search */}
      <input type="text" placeholder="Search books..."
        value={search} onChange={e => setSearch(e.target.value)}
        style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: "12px",
          border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
          fontSize: "0.95rem", marginBottom: "1rem", boxSizing: "border-box", fontFamily: "inherit" }} />

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
