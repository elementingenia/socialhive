"use client"
import { useEffect, useState, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"

// ── Genre pills ───────────────────────────────────────────────────────────────
function GenrePills({ genres }) {
  if (!genres) return null
  const list = genres.split(",").map(g => g.trim()).filter(Boolean).slice(0, 4)
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

// ── Bulk swiper (unrated books) ────────────────────────────────────────────────
function RatingSwiper({ books, memberId, onDone }) {
  const [idx,       setIdx]   = useState(0)
  const [submitting,setSub]   = useState(false)
  const [rated,     setRated] = useState(0)
  const [done,      setDone]  = useState(false)

  const book  = books[idx] || null
  const total = books.length
  const isLast = idx >= total - 1

  async function submitRating(score) {
    if (!book || submitting) return
    setSub(true)
    await supabase.from("book_votes").upsert(
      { member_id: memberId, book_id: book.id, score },
      { onConflict: "member_id,book_id" }
    )
    setSub(false)
    setRated(r => r + 1)
    if (isLast) { setDone(true); onDone() }
    else setIdx(i => i + 1)
  }

  function skipOne() {
    if (isLast) { setDone(true); onDone() }
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

  const genres = (book.genres || "").split(",").map(g => g.trim()).filter(Boolean)

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>Rate a Book</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{idx + 1} of {total} to rate</div>
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

      <div style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden", boxShadow: "var(--shadow)", marginBottom: 12 }}>
        <div style={{ display: "flex", minHeight: 110 }}>
          {book.cover_url ? (
            <img src={book.cover_url} alt={book.title} style={{ width: 80, objectFit: "cover", flexShrink: 0 }} />
          ) : (
            <div style={{ width: 80, background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", flexShrink: 0 }}>📖</div>
          )}
          <div style={{ flex: 1, padding: "0.9rem 1rem" }}>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", lineHeight: 1.2, marginBottom: 2 }}>{book.title}</div>
            {book.author && <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: 4 }}>by {book.author}</div>}
            {genres.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                {genres.slice(0, 3).map(g => (
                  <span key={g} style={{ background: "var(--surface2)", borderRadius: 20, padding: "0.1rem 0.4rem", fontSize: "0.65rem", color: "var(--text-dim)" }}>{g}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: "0.75rem 0.85rem 0.85rem", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem", textAlign: "center" }}>
            How interested are you in reading this?
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.35rem", marginBottom: "0.5rem" }}>
            {[1,2,3,4,5,6,7,8,9,10].map(score => (
              <button key={score} onClick={() => submitRating(score)} disabled={submitting}
                style={{ padding: "0.5rem 0", borderRadius: 10, border: "1.5px solid var(--border)",
                  background: "var(--surface)", color: "var(--text)", fontSize: "0.9rem", fontWeight: 700,
                  cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.5 : 1, fontFamily: "inherit" }}>
                {score}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: "var(--text-dim)", marginBottom: "0.6rem" }}>
            <span>Not interested</span><span>Can't wait!</span>
          </div>
          <button onClick={skipOne}
            style={{ width: "100%", padding: "0.5rem", background: "none", border: "1px solid var(--border)", borderRadius: 10, fontSize: "0.8rem", fontWeight: 600, color: "var(--text-dim)", cursor: "pointer", fontFamily: "inherit" }}>
            Skip this one
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
          style={{ flex: 1, padding: "0.5rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: "0.8rem", fontWeight: 600, color: idx === 0 ? "var(--text-dim)" : "var(--text)", cursor: idx === 0 ? "not-allowed" : "pointer", opacity: idx === 0 ? 0.4 : 1, fontFamily: "inherit" }}>
          ‹ Prev
        </button>
        <button onClick={() => { if (isLast) { setDone(true); onDone() } else setIdx(i => i + 1) }} disabled={isLast}
          style={{ flex: 1, padding: "0.5rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: "0.8rem", fontWeight: 600, color: isLast ? "var(--text-dim)" : "var(--text)", cursor: isLast ? "not-allowed" : "pointer", opacity: isLast ? 0.4 : 1, fontFamily: "inherit" }}>
          Next ›
        </button>
      </div>
    </div>
  )
}

// ── Book Card (matches movie tile design) ─────────────────────────────────────
function BookCard({ book, myVote, memberId, onVote, isAdmin, onDelete }) {
  const [descOpen,   setDescOpen]   = useState(false)
  const [score,      setScore]      = useState(myVote?.score || 0)
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const communityScore = book.avg_score ? parseFloat(book.avg_score).toFixed(1) : null
  const voteCount      = book.vote_count || 0

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

  return (
    <div style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)",
      overflow: "hidden", boxShadow: "var(--shadow)", marginBottom: 14 }}>

      {/* Delete confirmation banner */}
      {confirmDel && (
        <div style={{ background: "#fee2e2", borderBottom: "1px solid #fca5a5", padding: "0.75rem 1rem",
          display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--danger)" }}>Delete this suggestion?</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => onDelete(book.id)}
              style={{ background: "var(--danger)", border: "none", color: "#fff",
                borderRadius: 8, padding: "4px 14px", fontSize: "0.78rem", fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit" }}>
              Yes, delete
            </button>
            <button onClick={() => setConfirmDel(false)}
              style={{ background: "none", border: "1px solid var(--border)", color: "var(--text)",
                borderRadius: 8, padding: "4px 12px", fontSize: "0.78rem", fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Book info row */}
      <div style={{ display: "flex", minHeight: 100 }}>
        {book.cover_url ? (
          <img src={book.cover_url} alt={book.title} style={{ width: 80, objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <div style={{ width: 80, background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", flexShrink: 0 }}>📖</div>
        )}
        <div style={{ flex: 1, padding: "0.9rem 0.9rem 0.9rem 0.85rem", minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", lineHeight: 1.2 }}>{book.title}</div>
            {isAdmin && !confirmDel && (
              <button onClick={() => setConfirmDel(true)}
                style={{ background: "none", border: "none", color: "var(--danger)", fontSize: "1rem",
                  cursor: "pointer", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>
                🗑
              </button>
            )}
          </div>
          {book.author && <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: 2 }}>by {book.author}</div>}

          {/* Score pills */}
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
            {communityScore && (
              <span style={{ background: "var(--purple)15", color: "var(--purple)", fontWeight: 700,
                fontSize: "0.68rem", padding: "0.15rem 0.5rem", borderRadius: 20 }}>
                Community {communityScore}
              </span>
            )}
            {book.rating && (
              <span style={{ background: "rgba(180,150,0,0.15)", color: "var(--amber-dark)", fontWeight: 700,
                fontSize: "0.68rem", padding: "0.15rem 0.5rem", borderRadius: 20 }}>
                ⭐ {book.rating}
              </span>
            )}
          </div>

          <GenrePills genres={book.genres} />
        </div>
      </div>

      {/* Description with 3-line fade + More */}
      {book.summary && (
        <div style={{ padding: "0 1rem 0" }}>
          <div style={{ position: "relative" }}>
            <div style={{
              fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.6,
              maxHeight: descOpen ? "none" : "4.8em", overflow: "hidden",
            }}>
              {book.summary}
            </div>
            {!descOpen && (
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "2.4em",
                background: "linear-gradient(to bottom, transparent, var(--surface))", pointerEvents: "none" }} />
            )}
          </div>
          <button onClick={() => setDescOpen(o => !o)}
            style={{ background: "none", border: "none", color: "var(--purple)", fontSize: "0.78rem",
              fontWeight: 700, cursor: "pointer", padding: "2px 0 8px", fontFamily: "inherit" }}>
            {descOpen ? "Less ▲" : "More ▼"}
          </button>
        </div>
      )}

      {/* Rate This Book */}
      <div style={{ padding: "0.75rem 0.85rem 0.9rem", borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase",
          letterSpacing: "0.06em", marginBottom: score > 0 ? 4 : "0.5rem" }}>
          {score > 0 ? "Your Rating" : "Rate This Book"}
        </div>
        {score > 0 && (
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.5rem" }}>
            You rated this {score}/10 — tap to change
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.35rem", marginBottom: "0.4rem" }}>
          {[1,2,3,4,5,6,7,8,9,10].map(s => (
            <button key={s} onClick={() => vote(s)} disabled={saving}
              style={{ padding: "0.5rem 0", borderRadius: 10,
                border: score === s ? "2px solid var(--purple)" : "1.5px solid var(--border)",
                background: score === s ? "var(--purple)" : "var(--surface)",
                color: score === s ? "#fff" : "var(--text)",
                fontSize: "0.9rem", fontWeight: 700,
                cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1,
                fontFamily: "inherit" }}>
              {s}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: "var(--text-dim)" }}>
          <span>Not interested</span><span>Can't wait!</span>
        </div>
      </div>
    </div>
  )
}

// ── Add Book Form ─────────────────────────────────────────────────────────────
function AddBookForm({ onAdded, onClose }) {
  const [query,   setQuery]   = useState("")
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const timer = useRef(null)

  function handleInput(val) {
    setQuery(val)
    setError(null)
    clearTimeout(timer.current)
    if (val.length < 3) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/books/search?q=${encodeURIComponent(val)}`)
        const d   = await res.json()
        setResults(d.results || [])
        if ((d.results || []).length === 0) setError("No results — try a different title or spelling")
      } catch {
        setError("Search unavailable — try again")
      }
      setLoading(false)
    }, 400)
  }

  async function suggest(r) {
    setSaving(true)
    let enriched = { ...r }
    try {
      const det = await fetch(`/api/books/details?key=${encodeURIComponent(r.google_books_id)}`)
      if (det.ok) {
        const d = await det.json()
        if (d.summary)     enriched.summary     = d.summary
        if (d.rating)      enriched.rating      = d.rating
        if (d.rating_link) enriched.rating_link = d.rating_link
      }
    } catch {}

    const { data: existing } = await supabase
      .from("books").select("id").eq("google_books_id", enriched.google_books_id).maybeSingle()

    if (!existing) {
      await supabase.from("books").insert({
        title: enriched.title, author: enriched.author, cover_url: enriched.cover_url,
        summary: enriched.summary, rating: enriched.rating, rating_link: enriched.rating_link,
        google_books_id: enriched.google_books_id, genres: enriched.genres,
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
      <input type="text" placeholder="Search by title (3+ characters)…" value={query}
        onChange={e => handleInput(e.target.value)}
        style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: 10, border: "1px solid var(--border)",
          background: "var(--surface)", color: "var(--text)", fontSize: "0.9rem",
          boxSizing: "border-box", fontFamily: "inherit" }} />
      {loading && <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "6px 2px" }}>Searching…</div>}
      {error && <div style={{ fontSize: 12, color: "var(--danger)", padding: "6px 2px" }}>{error}</div>}
      {results.length > 0 && (
        <div style={{ marginTop: 6, border: "1px solid var(--border)", borderRadius: 12,
          background: "var(--surface)", overflow: "hidden" }}>
          {results.map(r => (
            <div key={r.google_books_id} onClick={() => suggest(r)}
              style={{ display: "flex", gap: 10, padding: "0.7rem 1rem",
                cursor: saving ? "not-allowed" : "pointer", borderBottom: "1px solid var(--border)",
                alignItems: "center", opacity: saving ? 0.6 : 1 }}>
              {r.cover_url
                ? <img src={r.cover_url} alt="" style={{ width: 32, height: 44, objectFit: "cover", borderRadius: 3 }} />
                : <div style={{ width: 32, height: 44, background: "var(--surface2)", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>📖</div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>{r.title}</div>
                {r.author && <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{r.author}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
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
  const { member, isAdmin } = useUser()
  const [books,     setBooks]     = useState([])
  const [myVotes,   setMyVotes]   = useState({})
  const [unrated,   setUnrated]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showAdd,   setShowAdd]   = useState(false)
  const [showSwipe, setShowSwipe] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: bks } = await supabase
      .from("books")
      .select("id, title, author, cover_url, genres, summary, rating, rating_link, google_books_id")
      .order("title")

    let votes = {}
    if (member?.id) {
      const { data: v } = await supabase
        .from("book_votes").select("book_id, score").eq("member_id", member.id)
      for (const row of v || []) votes[row.book_id] = row
    }

    const { data: agg } = await supabase.from("book_votes").select("book_id, score")
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

  async function deleteBook(bookId) {
    const { data: evts } = await supabase.from("events").select("id").eq("book_id", bookId).limit(1)
    if (evts?.length) { alert("Cannot delete — this book has been used in a Book Club event."); return }
    await supabase.from("book_votes").delete().eq("book_id", bookId)
    await supabase.from("books").delete().eq("id", bookId)
    await load()
  }

  if (loading) return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      {[120, 90, 90].map((h, i) => (
        <div key={i} style={{ height: h, borderRadius: 16, background: "var(--surface2)", marginBottom: 14 }} />
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
              padding: "8px 16px", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer",
              fontFamily: "inherit", whiteSpace: "nowrap" }}>
            Rate Now
          </button>
        </div>
      )}

      {showSwipe && (
        <RatingSwiper books={unrated} memberId={member?.id} onDone={() => { setShowSwipe(false); load() }} />
      )}

      {/* Suggest button */}
      {!showSwipe && (showAdd ? (
        <AddBookForm onAdded={load} onClose={() => setShowAdd(false)} />
      ) : (
        <button onClick={() => setShowAdd(true)}
          style={{ width: "100%", background: "transparent", border: "2px dashed var(--purple)",
            borderRadius: 14, padding: "0.9rem", fontWeight: 700, fontSize: "0.9rem",
            color: "var(--purple)", cursor: "pointer", marginBottom: 16, fontFamily: "inherit" }}>
          + Suggest a Book
        </button>
      ))}

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
            isAdmin={isAdmin}
            onDelete={deleteBook}
          />
        ))
      )}
    </div>
  )
}
