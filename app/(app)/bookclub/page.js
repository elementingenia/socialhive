"use client"
import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"

// ── Helpers ───────────────────────────────────────────────────────────────────
function localDate(str) {
  if (!str) return null
  const [y, m, d] = str.split("-").map(Number)
  return new Date(y, m - 1, d)
}
function fmtDate(str) {
  if (!str) return ""
  return localDate(str).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
}
function fmtYear(str) {
  if (!str) return ""
  return localDate(str).toLocaleDateString("en-AU", { month: "short", year: "numeric" })
}

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

function Toast({ msg }) {
  if (!msg) return null
  return (
    <div style={{ position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 9999,
      background: "#15803d", color: "#fff", padding: "10px 20px", borderRadius: 12, fontSize: 14,
      fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.2)", whiteSpace: "nowrap" }}>{msg}</div>
  )
}

// ── Book Club Event Card ───────────────────────────────────────────────────────
function EventCard({ event, label, booking, onSignUp, onLeave, colour = "var(--purple)" }) {
  const [loading,      setLoading]      = useState(false)
  const [summaryOpen,  setSummaryOpen]  = useState(false)
  const book        = event.books
  const isJoined    = booking?.status === "confirmed"
  const activeEC    = (event.event_coordinators || []).find(ec => !ec.replaced_at)
  const coordinator = activeEC?.members?.name || activeEC?.members?.username || null

  async function handleSignUp() {
    setLoading(true)
    await onSignUp(event)
    setLoading(false)
  }
  async function handleLeave() {
    setLoading(true)
    await onLeave(event)
    setLoading(false)
  }

  return (
    <div style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)",
      overflow: "hidden", boxShadow: "var(--shadow)", marginBottom: 16 }}>
      {/* Card header */}
      <div style={{ background: colour, padding: "0.6rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}>{label}</span>
        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.78rem", fontWeight: 600 }}>{fmtDate(event.event_date)}</span>
      </div>

      {/* Book info */}
      {book && (
        <div style={{ display: "flex", gap: 12, padding: "0.9rem 1rem", borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
          {book.cover_url && (
            <img src={book.cover_url} alt={book.title}
              style={{ width: 56, height: 80, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: "1rem", lineHeight: 1.2, marginBottom: 2 }}>{book.title}</div>
            {book.author && <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginBottom: 4 }}>by {book.author}</div>}
            {book.rating && (
              <span style={{ display: "inline-block", background: "rgba(180,150,0,0.15)", color: "var(--amber-dark)",
                fontWeight: 700, fontSize: "0.68rem", padding: "0.15rem 0.5rem", borderRadius: 20, marginBottom: 4 }}>
                ⭐ {book.rating}
              </span>
            )}
            <GenrePills genres={book.genres} />
            {coordinator && (
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: 6 }}>
                📋 Coordinated by <strong>{coordinator}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: "0.9rem 1rem" }}>
        {/* Participation — above description */}
        <div style={{ marginBottom: 14 }}>
          {isJoined ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#dcfce7",
                color: "#15803d", borderRadius: 20, padding: "5px 14px", fontSize: "0.82rem", fontWeight: 700 }}>
                ✓ Participating
              </div>
              <button onClick={handleLeave} disabled={loading}
                style={{ background: "transparent", border: "1px solid var(--danger)", color: "var(--danger)",
                  borderRadius: 20, padding: "5px 14px", fontSize: "0.82rem", fontWeight: 700,
                  cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, fontFamily: "inherit" }}>
                {loading ? "…" : "Leave"}
              </button>
            </div>
          ) : (
            <button onClick={handleSignUp} disabled={loading}
              style={{ background: "var(--purple)", color: "#fff", border: "none", borderRadius: 20,
                padding: "8px 20px", fontSize: "0.88rem", fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, fontFamily: "inherit" }}>
              {loading ? "…" : "I want to Participate"}
            </button>
          )}
        </div>

        {/* Event notes */}
        {event.description && (
          <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 10 }}>
            {event.description}
          </div>
        )}

        {/* Book summary — 3-line fade with Show More */}
        {book?.summary && (
          <div style={{ marginTop: event.description ? 0 : 0 }}>
            <div style={{ position: "relative" }}>
              <div style={{
                fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.6,
                maxHeight: summaryOpen ? "none" : "4.8em",
                overflow: "hidden",
              }}>
                {book.summary}
              </div>
              {!summaryOpen && (
                <div style={{
                  position: "absolute", bottom: 0, left: 0, right: 0, height: "2.4em",
                  background: "linear-gradient(to bottom, transparent, var(--surface))",
                  pointerEvents: "none",
                }} />
              )}
            </div>
            <button onClick={() => setSummaryOpen(o => !o)}
              style={{ background: "none", border: "none", color: "var(--purple)", fontSize: "0.78rem",
                fontWeight: 700, cursor: "pointer", padding: "4px 0", fontFamily: "inherit" }}>
              {summaryOpen ? "Show less ▲" : "Show more ▼"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Closed Events Accordion ───────────────────────────────────────────────────
function ClosedEventsAccordion({ events, myBookedIds }) {
  const [open, setOpen] = useState(false)
  if (!events.length) return null
  return (
    <div style={{ background: "var(--surface)", borderRadius: 14, border: "1px solid var(--border)", overflow: "hidden" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "1rem", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
        <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>📖 Closed Events ({events.length})</span>
        <span style={{ color: "var(--text-dim)", fontSize: "1rem", display: "inline-block",
          transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
      </button>
      {open && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "0.75rem 1rem",
          display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {events.map(ev => {
            const book       = ev.books
            const participated = myBookedIds.has(ev.id)
            return (
              <div key={ev.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                {book?.cover_url ? (
                  <img src={book.cover_url} alt={book.title}
                    style={{ width: 36, height: 52, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 36, height: 52, borderRadius: 4, background: "var(--purple)20",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "1.1rem" }}>📖</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", lineHeight: 1.2 }}>{book?.title || ev.title}</div>
                  {book?.author && <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>by {book.author}</div>}
                  <div style={{ fontSize: "0.72rem", color: "var(--purple)", marginTop: 2 }}>{fmtYear(ev.event_date)}</div>
                  {participated && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4,
                      background: "#dcfce7", color: "#15803d", borderRadius: 12, padding: "2px 8px",
                      fontSize: "0.72rem", fontWeight: 700 }}>✓ Participated</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Book Search (Google Books) ────────────────────────────────────────────────
// BookPicker — selects from books already in the community suggestions table
function BookPicker({ onSelect, initialBook }) {
  const [allBooks, setAllBooks] = useState([])
  const [query,    setQuery]    = useState("")
  const [chosen,   setChosen]   = useState(initialBook || null)
  const [open,     setOpen]     = useState(!initialBook)

  useEffect(() => {
    supabase.from("books").select("id, title, author, cover_url, genres").order("title")
      .then(({ data }) => setAllBooks(data || []))
  }, [])

  const filtered = allBooks.filter(b =>
    !query || b.title?.toLowerCase().includes(query.toLowerCase()) ||
    b.author?.toLowerCase().includes(query.toLowerCase())
  ).slice(0, query.length >= 2 ? 10 : 5)

  function pick(b) {
    setChosen(b)
    setOpen(false)
    onSelect(b)
  }

  if (!open && chosen) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface2)",
        borderRadius: 10, padding: "0.65rem 0.9rem", marginBottom: 12 }}>
        {chosen.cover_url && <img src={chosen.cover_url} alt="" style={{ width: 36, height: 50, objectFit: "cover", borderRadius: 4 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{chosen.title}</div>
          {chosen.author && <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>by {chosen.author}</div>}
        </div>
        <button onClick={() => { setChosen(null); setQuery(""); setOpen(true); onSelect(null) }}
          style={{ background: "var(--purple)", color: "#fff", border: "none", borderRadius: 8,
            padding: "4px 10px", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
          Change
        </button>
      </div>
    )
  }

  return (
    <div style={{ position: "relative", marginBottom: 12 }}>
      <input
        type="text"
        placeholder="Search community suggestions…"
        value={query}
        autoFocus
        onChange={e => setQuery(e.target.value)}
        style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: 10, border: "1px solid var(--purple)",
          background: "var(--surface)", color: "var(--text)", fontSize: "0.95rem",
          boxSizing: "border-box", fontFamily: "inherit" }}
      />
      {allBooks.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "4px 2px" }}>Loading books…</div>
      )}
      {allBooks.length > 0 && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 12,
          boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 50, marginTop: 4,
          background: "var(--surface)", overflow: "hidden" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "0.9rem 1rem", fontSize: "0.85rem", color: "var(--text-dim)" }}>
              No matching books in suggestions
            </div>
          ) : filtered.map(b => (
            <div key={b.id} onClick={() => pick(b)}
              style={{ display: "flex", gap: 10, padding: "0.7rem 1rem", cursor: "pointer",
                borderBottom: "1px solid var(--border)", alignItems: "center" }}>
              {b.cover_url && <img src={b.cover_url} alt="" style={{ width: 32, height: 44, objectFit: "cover", borderRadius: 3 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "0.85rem", lineHeight: 1.2 }}>{b.title}</div>
                {b.author && <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{b.author}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {allBooks.length > 0 && filtered.length === 0 && query.length === 0 && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 12,
          background: "var(--surface)", overflow: "hidden", marginTop: 4 }}>
          {allBooks.slice(0, 5).map(b => (
            <div key={b.id} onClick={() => pick(b)}
              style={{ display: "flex", gap: 10, padding: "0.7rem 1rem", cursor: "pointer",
                borderBottom: "1px solid var(--border)", alignItems: "center" }}>
              {b.cover_url && <img src={b.cover_url} alt="" style={{ width: 32, height: 44, objectFit: "cover", borderRadius: 3 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>{b.title}</div>
                {b.author && <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{b.author}</div>}
              </div>
            </div>
          ))}
          {allBooks.length > 5 && (
            <div style={{ padding: "0.5rem 1rem", fontSize: "0.75rem", color: "var(--text-dim)" }}>
              Type to search {allBooks.length} books…
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Coordinator Typeahead Picker ─────────────────────────────────────────────
function CoordPicker({ members, value, onChange }) {
  const chosen = members.find(m => m.id === value) || null
  const [query,  setQuery]  = useState("")
  const [open,   setOpen]   = useState(false)
  const containerRef        = useRef(null)

  const filtered = members.filter(m =>
    !query || (m.name || m.username || "").toLowerCase().includes(query.toLowerCase())
  ).slice(0, query.length >= 2 ? 10 : 5)

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div
        onClick={() => { setOpen(o => !o); setQuery("") }}
        style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: 10,
          border: "1px solid var(--border)", background: "var(--surface)",
          color: chosen ? "var(--text)" : "var(--text-dim)", fontSize: "0.95rem",
          boxSizing: "border-box", fontFamily: "inherit", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{chosen ? (chosen.name || chosen.username) : "— Select coordinator —"}</span>
        <span style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>▾</span>
      </div>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
          boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 60, overflow: "hidden" }}>
          <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
            <input
              autoFocus
              type="text"
              placeholder="Search name…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ width: "100%", border: "none", background: "transparent",
                color: "var(--text)", fontSize: "0.9rem", outline: "none", fontFamily: "inherit" }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {value && (
              <div
                onClick={() => { onChange(""); setOpen(false) }}
                style={{ padding: "0.65rem 1rem", cursor: "pointer", fontSize: "0.85rem",
                  color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>
                — Clear selection —
              </div>
            )}
            {filtered.map(m => (
              <div key={m.id}
                onClick={() => { onChange(m.id); setOpen(false) }}
                style={{ padding: "0.65rem 1rem", cursor: "pointer",
                  background: m.id === value ? "var(--purple)12" : "transparent",
                  borderBottom: "1px solid var(--border)",
                  fontWeight: m.id === value ? 700 : 400, fontSize: "0.88rem",
                  color: m.id === value ? "var(--purple)" : "var(--text)" }}>
                {m.name || m.username}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "0.9rem 1rem", fontSize: "0.85rem", color: "var(--text-dim)" }}>
                No match
              </div>
            )}
            {members.length > 5 && !query && (
              <div style={{ padding: "0.5rem 1rem", fontSize: "0.72rem", color: "var(--text-dim)",
                borderTop: "1px solid var(--border)" }}>
                Type to search all {members.length} members
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Admin Inline Event Form ───────────────────────────────────────────────────
function AdminEventForm({ event, members, onSave, onClose }) {
  const inputStyle = { width: "100%", padding: "0.75rem 1rem", borderRadius: 10,
    border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
    fontSize: "0.95rem", boxSizing: "border-box", fontFamily: "inherit" }

  const activeEC = event ? (event.event_coordinators || []).find(ec => !ec.replaced_at) : null
  const [form,   setForm]   = useState({
    event_date:   event?.event_date || "",
    description:  event?.description || "",
    welcome_message: event?.welcome_message || "",
    coordinator_id: activeEC?.member_id || "",
  })
  const [selectedBook, setSelectedBook] = useState(event?.books || null)
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const [saveError, setSaveError] = useState(null)

  async function save() {
    if (!form.event_date || !selectedBook) return
    setSaving(true)
    setSaveError(null)

    // Upsert book record
    let bookId = selectedBook.id || null
    if (!bookId && selectedBook.google_books_id) {
      const { data: existing } = await supabase
        .from("books")
        .select("id")
        .eq("google_books_id", selectedBook.google_books_id)
        .maybeSingle()

      if (existing) {
        bookId = existing.id
      } else {
        const { data: newBook, error: bookErr } = await supabase
          .from("books")
          .insert({
            title:          selectedBook.title,
            author:         selectedBook.author,
            cover_url:      selectedBook.cover_url,
            summary:        selectedBook.summary,
            rating:         selectedBook.rating,
            rating_link:    selectedBook.rating_link,
            google_books_id: selectedBook.google_books_id,
            genres:         selectedBook.genres,
          })
          .select("id")
          .single()
        if (bookErr) { setSaveError("Could not save book: " + bookErr.message); setSaving(false); return }
        bookId = newBook?.id
      }
    }

    const payload = {
      hub_type:        "bookclub",
      event_date:      form.event_date,
      event_time:      "00:00",
      title:           selectedBook?.title || "Book Club Meeting",
      description:     form.description,
      welcome_message: form.welcome_message,
      book_id:         bookId,
      archived:        false,
    }

    let eventId = event?.id
    if (eventId) {
      const { error: evErr } = await supabase.from("events").update(payload).eq("id", eventId)
      if (evErr) { setSaveError("Could not update event: " + evErr.message); setSaving(false); return }
    } else {
      const { data, error: evErr } = await supabase.from("events").insert(payload).select("id").single()
      if (evErr) { setSaveError("Could not create event: " + evErr.message); setSaving(false); return }
      eventId = data?.id
    }

    // Save coordinator (single EC for Book Club)
    if (form.coordinator_id && eventId) {
      // Mark any existing as replaced
      await supabase
        .from("event_coordinators")
        .update({ replaced_at: new Date().toISOString() })
        .eq("event_id", eventId)
        .is("replaced_at", null)

      await supabase.from("event_coordinators").insert({
        event_id:  eventId,
        member_id: form.coordinator_id,
      })
    }

    setSaving(false)
    if (!saveError) onSave()
  }

  const labelStyle = { fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)",
    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, display: "block" }

  return (
    <div style={{ background: "var(--surface)", borderRadius: 16, border: "2px solid var(--purple)",
      padding: "1.25rem", marginBottom: 16 }}>
      <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--purple)", marginBottom: 16 }}>
        {event ? "Edit Book Club Event" : "Add Book Club Event"}
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Meeting Date *</label>
        <input type="date" value={form.event_date} onChange={e => set("event_date", e.target.value)}
          style={inputStyle} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Book *</label>
        <BookPicker onSelect={setSelectedBook} initialBook={event?.books || null} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Event Coordinator</label>
        <CoordPicker
          members={members}
          value={form.coordinator_id}
          onChange={id => set("coordinator_id", id)}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Event Details</label>
        <textarea rows={3} value={form.description} onChange={e => set("description", e.target.value)}
          placeholder="Any extra details about this meeting…"
          style={{ ...inputStyle, resize: "vertical", minHeight: 72 }} />
      </div>


      {saveError && (
        <div style={{ marginBottom: 10, padding: "0.6rem 0.9rem", background: "rgba(220,50,50,0.1)",
          color: "var(--danger)", borderRadius: 10, fontSize: "0.82rem", fontWeight: 600 }}>
          {saveError}
        </div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onClose}
          style={{ flex: 1, padding: "0.75rem", background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: 12, fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", color: "var(--text)", fontFamily: "inherit" }}>
          Cancel
        </button>
        <button onClick={save} disabled={saving || !form.event_date || !selectedBook}
          style={{ flex: 2, padding: "0.75rem", background: "var(--purple)", border: "none",
            borderRadius: 12, fontWeight: 700, fontSize: "0.9rem", color: "#fff",
            cursor: (saving || !form.event_date || !selectedBook) ? "not-allowed" : "pointer",
            opacity: (saving || !form.event_date || !selectedBook) ? 0.6 : 1, fontFamily: "inherit" }}>
          {saving ? "Saving…" : event ? "Save Changes" : "Create Event"}
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BookClubHome() {
  const { member, isAdmin } = useUser()
  const [welcomeText, setWelcomeText] = useState("")
  const [events,      setEvents]      = useState([])  // all non-archived BC events ordered by date asc
  const [myBookings,  setMyBookings]  = useState({})  // eventId → booking
  const [myBookedIds, setMyBookedIds] = useState(new Set())  // past event ids user participated in
  const [members,     setMembers]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [toast,       setToast]       = useState(null)
  const [showForm,    setShowForm]    = useState(false)
  const [editEvent,   setEditEvent]   = useState(null)

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().split("T")[0]

    // Hub welcome text
    const wRes = await fetch("/api/hub-settings")
    const wData = await wRes.json()
    setWelcomeText(wData.bookclub?.text || "")

    // All non-archived BC events
    const { data: evs } = await supabase
      .from("events")
      .select("id, title, event_date, description, welcome_message, books(id, title, author, cover_url, genres, rating, rating_link, summary), event_coordinators(id, member_id, replaced_at, members(name, username))")
      .eq("hub_type", "bookclub")
      .eq("archived", false)
      .order("event_date", { ascending: true })

    setEvents(evs || [])

    // My bookings for all BC events
    if (member?.id && evs?.length) {
      const ids = evs.map(e => e.id)
      const { data: bks } = await supabase
        .from("bookings")
        .select("id, event_id, status")
        .eq("member_id", member.id)
        .in("event_id", ids)

      const byEvent = {}
      for (const b of bks || []) byEvent[b.event_id] = b
      setMyBookings(byEvent)

      // Past participated events
      const past = (evs || []).filter(e => e.event_date < today)
      const participated = new Set(past.filter(e => byEvent[e.id]?.status === "confirmed").map(e => e.id))
      setMyBookedIds(participated)
    }

    // Members for EC picker (admin only)
    if (isAdmin) {
      const { data: mems } = await supabase.from("members").select("id, name, username").order("name")
      setMembers(mems || [])
    }

    setLoading(false)
  }

  useEffect(() => { if (member?.id !== undefined) load() }, [member?.id, isAdmin])

  async function signUp(event) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event_id: event.id, seats: 1 }),
    })
    const d = await res.json()
    if (!res.ok) { showToast("Could not sign up: " + (d.error || "error")); return }
    showToast("You're signed up!")
    await load()
  }

  async function leave(event) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const res = await fetch("/api/bookings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event_id: event.id }),
    })
    if (!res.ok) { showToast("Could not leave event"); return }
    showToast("Booking cancelled")
    await load()
  }

  // Determine current (active) and next events
  const today = new Date().toISOString().split("T")[0]
  const upcoming = events.filter(e => e.event_date >= today)
  const past     = events.filter(e => e.event_date < today)

  // "Active" = first upcoming event (if any), else most recent past event
  const activeEvent = upcoming[0] || past[past.length - 1] || null
  // "Next" = second upcoming event (exists when there are 2+ upcoming)
  const nextEvent   = upcoming.length >= 2 ? upcoming[1] : null
  // Closed = all events except active and next
  const closedEvents = events.filter(e =>
    e.id !== activeEvent?.id && e.id !== nextEvent?.id
  ).sort((a, b) => b.event_date.localeCompare(a.event_date))

  // Can admin add? Only if there's no second upcoming event (no "Next" slot filled)
  const canAdd  = isAdmin && !nextEvent
  const canEdit = isAdmin && activeEvent

  if (loading) return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      {[180, 60, 60].map((h, i) => (
        <div key={i} style={{ height: h, borderRadius: 14, background: "var(--surface2)", marginBottom: 12 }} />
      ))}
    </div>
  )

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      <Toast msg={toast} />

      {/* Welcome tile */}
      {welcomeText && (
        <div style={{ background: "var(--purple)12", border: "1px solid var(--purple)30", borderRadius: 14,
          padding: "1rem", marginBottom: 16, fontSize: "0.9rem", color: "var(--text)", lineHeight: 1.6 }}>
          {/<[a-z][\s\S]*>/i.test(welcomeText)
            ? <span dangerouslySetInnerHTML={{ __html: welcomeText }} />
            : welcomeText}
        </div>
      )}

      {/* Admin add/edit controls */}
      {isAdmin && !showForm && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {canAdd && (
            <button onClick={() => { setEditEvent(null); setShowForm(true) }}
              style={{ background: "var(--purple)", color: "#fff", border: "none", borderRadius: 20,
                padding: "8px 18px", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit" }}>
              + Add Event
            </button>
          )}
          {canEdit && (
            <button onClick={() => { setEditEvent(activeEvent); setShowForm(true) }}
              style={{ background: "transparent", color: "var(--purple)", border: "1px solid var(--purple)",
                borderRadius: 20, padding: "8px 18px", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit" }}>
              Edit Current Event
            </button>
          )}
          {nextEvent && isAdmin && (
            <button onClick={() => { setEditEvent(nextEvent); setShowForm(true) }}
              style={{ background: "transparent", color: "var(--purple)", border: "1px solid var(--purple)",
                borderRadius: 20, padding: "8px 18px", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit" }}>
              Edit Next Event
            </button>
          )}
        </div>
      )}

      {/* Admin event form */}
      {showForm && (
        <AdminEventForm
          event={editEvent}
          members={members}
          onSave={() => { setShowForm(false); setEditEvent(null); load() }}
          onClose={() => { setShowForm(false); setEditEvent(null) }}
        />
      )}

      {/* Active event */}
      {activeEvent ? (
        <EventCard
          event={activeEvent}
          label={upcoming[0] ? "Current Meeting" : "Current Reading"}
          booking={myBookings[activeEvent.id]}
          onSignUp={signUp}
          onLeave={leave}
        />
      ) : (
        <div style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)",
          padding: "1.5rem", textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: "2rem", marginBottom: 8 }}>📚</div>
          <div style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>No meetings scheduled yet</div>
        </div>
      )}

      {/* Next event */}
      {nextEvent && (
        <EventCard
          event={nextEvent}
          label="Next Meeting"
          booking={myBookings[nextEvent.id]}
          onSignUp={signUp}
          onLeave={leave}
          colour="#7c3aed"
        />
      )}

      {/* Closed events */}
      <ClosedEventsAccordion events={closedEvents} myBookedIds={myBookedIds} />
    </div>
  )
}
