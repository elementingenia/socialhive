"use client"
import { useEffect, useState, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"

// ── Helpers ───────────────────────────────────────────────────────────────────
function GenrePills({ genres }) {
  if (!genres) return null
  const list = genres.split(",").map(g => g.trim()).filter(Boolean)
  if (!list.length) return null
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
      {list.map(g => (
        <span key={g} style={{ fontSize: 11, color: "var(--purple)", background: "var(--purple)15",
          padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>{g}</span>
      ))}
    </div>
  )
}

// ── Rate / vote on a book ─────────────────────────────────────────────────────
function RatingSwiper({ books, memberId, onDone }) {
  const [idx,       setIdx]       = useState(0)
  const [submitting,setSub]       = useState(false)
  const [rated,     setRated]     = useState(0)
  const [done,      setDone]      = useState(false)

  const book  = books[idx] || null
  const total = books.length

  async function vote(score) {
    if (!book || submitting) return
    setSub(true)
    await supabase.from("book_votes").upsert(
      { member_id: memberId, book_id: book.id, score },
      { onConflict: "member_id,book_id" }
    )
    setSub(false)
    setRated(r => r + 1)
    if (idx >= total - 1) { setDone(true); onDone() }
    else setIdx(i => i + 1)
  }

  if (done || total === 0) {
    return (
      <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
        <div style={{ fontSize: "2rem", marginBottom: 4 }}>🎉</div>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>
          {rated > 0 ? `${rated} book${rated !== 1 ? "s" : ""} rated!` : "All caught up"}
        </div>
        <div style={{ fontSize: "0.82rem", color: "var(--text-dim)" }}>Browse the full list below</div>
      </div>
    )
  }

  const scoreLabels = [
    { score: 5, label: "Love it", emoji: "❤️", bg: "#dcfce7", colour: "#15803d" },
    { score: 4, label: "Sounds good", emoji: "👍", bg: "#dbeafe", colour: "#1d4ed8" },
    { score: 3, label: "Maybe", emoji: "🤔", bg: "#fef9c3", colour: "#854d0e" },
    { score: 2, label: "Not keen", emoji: "👎", bg: "#fee2e2", colour: "#b91c1c" },
  ]

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>Rate a Book</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{idx + 1} of {total} unrated</div>
        </div>
        <button onClick={() => { setDone(true); onDone() }}
          style={{ background: "none", border: "1px solid var(--border)", color: "var(--text-dim)",
            borderRadius: 20, padding: "4px 12px", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer" }}>
          Skip all
        </button>
      </div>

      <div style={{ height: 3, background: "var(--surface2)", borderRadius: 2, marginBottom: 12, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${(idx / total) * 100}%`, background: "var(--purple)", borderRadius: 2, transition: "width 0.3s ease" }} />
      </div>

      <div style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 12, padding: "0.9rem 1rem", borderBottom: "1px solid var(--border)" }}>
          {book.cover_url && (
            <img src={book.cover_url} alt={book.title} style={{ width: 48, height: 68, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.2 }}>{book.title}</div>
            {book.author && <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: 2 }}>by {book.author}</div>}
            <GenrePills genres={book.genres} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--border)" }}>
          {scoreLabels.map(({ score, label, emoji, bg, colour }) => (
            <button key={score} onClick={() => vote(score)} disabled={submitting}
              style={{ background: bg, border: "none", padding: "1rem 0.5rem", cursor: submitting ? "not-allowed" : "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
              <span style={{ fontSize: "1.5rem" }}>{emoji}</span>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: colour }}>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Book Card ─────────────────────────────────────────────────────────────────
function BookCard({ book, myVote, memberId, onVote }) {
  const [expanded, setExpanded] = useState(false)
  const [score,    setScore]    = useState(myVote?.score || 0)
  const [saving,   setSaving]   = useState(false)

  async function vote(s) {
    setSaving(true)
    await supabase.from("book_votes").upsert(
      { member_id: memberId, book_id: book.id, score: s },
      { onConflict: "member_id,book_id" }
    )
    setScore(s)
    setSaving(false)
    onVote()
  }

  const communityScore = book.avg_score ? parseFloat(book.avg_score).toFixed(1) : null
  const voteCount      = book.vote_count || 0

  const scoreEmoji = { 5: "❤️", 4: "👍", 3: "🤔", 2: "👎", 1: "✗", 0: null }

  return (
    <div style={{ background: "var(--surface)", borderRadius: 14, border: "1px solid var(--border)",
      overflow: "hidden", marginBottom: 10 }}>
      <div onClick={() => setExpanded(e => !e)}
        style={{ display: "flex", gap: 12, padding: "0.9rem 1rem", cursor: "pointer", alignItems: "flex-start" }}>
        {book.cover_url && (
          <img src={book.cover_url} alt={book.title} style={{ width: 44, height: 62, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "0.9rem", lineHeight: 1.2 }}>{book.title}</div>
          {book.author && <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: 2 }}>by {book.author}</div>}
          <GenrePills genres={book.genres} />
          <div style={{ display: "flex", gap: 10, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
            {communityScore && (
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--purple)" }}>
                ⭐ {communityScore} community ({voteCount})
              </span>
            )}
            {book.rating && (
              <a href={book.rating_link || "#"} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ fontSize: "0.75rem", color: "#4285f4", fontWeight: 600, textDecoration: "none" }}>
                {book.rating} Google Books ↗
              </a>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {score > 0 && <span style={{ fontSize: "1.1rem" }}>{scoreEmoji[score]}</span>}
          <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "0.9rem 1rem" }}>
          {book.summary && (
            <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 12 }}>
              {book.summary}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[{ s: 5, e: "❤️", l: "Love it" }, { s: 4, e: "👍", l: "Good" }, { s: 3, e: "🤔", l: "Maybe" }, { s: 2, e: "👎", l: "Not for me" }].map(({ s, e, l }) => (
              <button key={s} onClick={() => vote(s)} disabled={saving}
                style={{ display: "flex", alignItems: "center", gap: 5, background: score === s ? "var(--purple)15" : "var(--surface2)",
                  border: score === s ? "1.5px solid var(--purple)" : "1px solid var(--border)",
                  borderRadius: 10, padding: "6px 12px", cursor: saving ? "not-allowed" : "pointer",
                  fontSize: "0.78rem", fontWeight: 700, color: score === s ? "var(--purple)" : "var(--text)",
                  fontFamily: "inherit" }}>
                <span>{e}</span>{l}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add Book Form ─────────────────────────────────────────────────────────────
function AddBookForm({ onAdded, onClose }) {
  const [query,   setQuery]   = useState("")
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const timer = useRef(null)

  function handleInput(val) {
    setQuery(val)
    clearTimeout(timer.current)
    if (val.length < 3) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      const res = await fetch(`/api/books/search?q=${encodeURIComponent(val)}`)
      const d   = await res.json()
      setResults(d.results || [])
      setLoading(false)
    }, 350)
  }

  async function suggest(r) {
    setSaving(true)
    // Check for existing
    const { data: existing } = await supabase
      .from("books")
      .select("id")
      .eq("google_books_id", r.google_books_id)
      .maybeSingle()

    if (!existing) {
      await supabase.from("books").insert({
        title:           r.title,
        author:          r.author,
        cover_url:       r.cover_url,
        summary:         r.summary,
        rating:          r.rating,
        rating_link:     r.rating_link,
        google_books_id: r.google_books_id,
        genres:          r.genres,
      })
    }
    setSaving(false)
    setQuery("")
    setResults([])
    onAdded()
    onClose()
  }

  return (
    <div style={{ background: "var(--surface)", borderRadius: 14, border: "2px solid var(--purple)",
      padding: "1rem", marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--purple)", marginBottom: 10 }}>
        Suggest a Book
      </div>
      <div style={{ position: "relative" }}>
        <input type="text" placeholder="Search Google Books (3+ chars)…" value={query}
          onChange={e => handleInput(e.target.value)}
          style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: 10,
            border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
            fontSize: "0.9rem", boxSizing: "border-box", fontFamily: "inherit" }} />
        {loading && <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "4px 2px" }}>Searching…</div>}
        {results.length > 0 && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)",
            border: "1px solid var(--border)", borderRadius: 12,
            boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 50, maxHeight: 280, overflowY: "auto", marginTop: 2 }}>
            {results.map(r => (
              <div key={r.google_books_id} onClick={() => suggest(r)}
                style={{ display: "flex", gap: 10, padding: "0.7rem 1rem", cursor: saving ? "not-allowed" : "pointer",
                  borderBottom: "1px solid var(--border)", alignItems: "center", opacity: saving ? 0.6 : 1 }}>
                {r.cover_url && <img src={r.cover_url} alt="" style={{ width: 32, height: 44, objectFit: "cover", borderRadius: 3 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>{r.title}</div>
                  {r.author && <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{r.author}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <button onClick={onClose}
        style={{ marginTop: 10, background: "none", border: "none", color: "var(--text-dim)",
          fontSize: "0.82rem", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
        Cancel
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BookSuggestionsPage() {
  const { member } = useUser()
  const [books,     setBooks]     = useState([])
  const [myVotes,   setMyVotes]   = useState({})
  const [unrated,   setUnrated]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showAdd,   setShowAdd]   = useState(false)
  const [showSwipe, setShowSwipe] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)

    // Books with aggregate community scores
    const { data: bks } = await supabase
      .from("books")
      .select("id, title, author, cover_url, genres, summary, rating, rating_link, google_books_id")
      .order("title")

    // My votes
    let votes = {}
    if (member?.id) {
      const { data: v } = await supabase
        .from("book_votes")
        .select("book_id, score")
        .eq("member_id", member.id)
      for (const row of v || []) votes[row.book_id] = row
    }

    // Aggregate scores
    const { data: agg } = await supabase
      .from("book_votes")
      .select("book_id, score")

    const scoreSums = {}; const scoreCounts = {}
    for (const v of agg || []) {
      scoreSums[v.book_id]   = (scoreSums[v.book_id]   || 0) + v.score
      scoreCounts[v.book_id] = (scoreCounts[v.book_id] || 0) + 1
    }

    const enriched = (bks || []).map(b => ({
      ...b,
      avg_score:  scoreCounts[b.id] ? (scoreSums[b.id] / scoreCounts[b.id]).toFixed(1) : null,
      vote_count: scoreCounts[b.id] || 0,
    })).sort((a, b) => (parseFloat(b.avg_score) || 0) - (parseFloat(a.avg_score) || 0))

    setBooks(enriched)
    setMyVotes(votes)
    setUnrated(enriched.filter(b => !votes[b.id]))
    setLoading(false)
  }, [member?.id])

  useEffect(() => { if (member?.id) load() }, [member?.id, load])

  if (loading) return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      {[100, 80, 80, 80].map((h, i) => (
        <div key={i} style={{ height: h, borderRadius: 12, background: "var(--surface2)", marginBottom: 10 }} />
      ))}
    </div>
  )

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>

      {/* Rate prompt */}
      {!showSwipe && unrated.length > 0 && (
        <div style={{ background: "var(--purple)12", border: "1px solid var(--purple)30", borderRadius: 14,
          padding: "1rem", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--purple)" }}>
              {unrated.length} book{unrated.length !== 1 ? "s" : ""} to rate
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: 2 }}>
              Help the community choose the next read
            </div>
          </div>
          <button onClick={() => setShowSwipe(true)}
            style={{ background: "var(--purple)", color: "#fff", border: "none", borderRadius: 20,
              padding: "8px 16px", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            Rate Now
          </button>
        </div>
      )}

      {/* Rating swiper */}
      {showSwipe && (
        <RatingSwiper
          books={unrated}
          memberId={member?.id}
          onDone={() => { setShowSwipe(false); load() }}
        />
      )}

      {/* Suggest a book */}
      {showAdd ? (
        <AddBookForm onAdded={load} onClose={() => setShowAdd(false)} />
      ) : (
        <button onClick={() => setShowAdd(true)}
          style={{ width: "100%", background: "transparent", border: "2px dashed var(--purple)",
            borderRadius: 14, padding: "0.9rem", fontWeight: 700, fontSize: "0.9rem",
            color: "var(--purple)", cursor: "pointer", marginBottom: 16, fontFamily: "inherit" }}>
          + Suggest a Book
        </button>
      )}

      {/* Books list */}
      {books.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--text-dim)", padding: "2rem 0", fontSize: "0.9rem" }}>
          No books suggested yet — be the first!
        </div>
      ) : (
        books.map(b => (
          <BookCard
            key={b.id}
            book={b}
            myVote={myVotes[b.id]}
            memberId={member?.id}
            onVote={load}
          />
        ))
      )}
    </div>
  )
}
