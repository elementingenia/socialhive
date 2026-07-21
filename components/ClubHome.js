"use client"
import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import EventSlideOut from "@/components/EventSlideOut"
import RichEditor, { bbToHtml } from "@/components/RichEditor"
import { ContactBar } from "@/components/OwnersManager"
import ExpandableText from "@/components/ExpandableText"
import { getToken } from "@/components/ResidentEditPanel"
import { clubCaps, clubColour } from "@/lib/clubs"
import EventImagePicker from "@/components/EventImagePicker"
import { useLocations } from "@/lib/useLocations"
import { cutoffToDateValue, cutoffFromDateValue } from "@/lib/booking"

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


function Toast({ msg }) {
  if (!msg) return null
  return (
    <div style={{ position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 9999,
      background: "#15803d", color: "#fff", padding: "10px 20px", borderRadius: 12, fontSize: 14,
      fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.2)", whiteSpace: "nowrap" }}>{msg}</div>
  )
}

// ── Booking Strip ────────────────────────────────────────────────────────────
function BookingStrip({ isJoined, seats = 1, hasBook, bookReturnDate, colour = "var(--purple)" }) {
  const base = { display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0.55rem 1rem", fontSize: "0.82rem", fontWeight: 600, gap: "0.5rem" }
  if (isJoined) {
    return (
      <div style={{ background: "#f0fdf4", borderTop: "1px solid #bbf7d0" }}>
        <div style={base}>
          <span style={{ color: "#15803d" }}>✓ Booked {seats} place{seats !== 1 ? "s" : ""}</span>
          <span style={{ color: "#15803d", fontSize: "0.75rem" }}>Tap to manage →</span>
        </div>
        {hasBook && bookReturnDate && (
          <div style={{ padding: "0 1rem 0.55rem", fontSize: "0.78rem", fontWeight: 600, color: "#15803d" }}>
            Return Book By - {fmtDate(bookReturnDate)}
          </div>
        )}
      </div>
    )
  }
  return (
    <div style={{ ...base, background: colour + "0f", borderTop: `1px solid ${colour}26` }}>
      <span style={{ color: colour, fontSize: "0.75rem" }}>Tap to sign up →</span>
    </div>
  )
}

// ── Book Club Event Card ─────────────────────────────────────────────────────
function EventCard({ event, label, booking, onOpen, colour = "var(--purple)", showToast, club }) {
  const { member, isAdmin } = useUser()
  const caps = clubCaps(club)
  const [summaryOpen,     setSummaryOpen]     = useState(false)
  const [attendeesOpen,   setAttendeesOpen]   = useState(false)
  const [attendees,       setAttendees]       = useState(null)
  const [attendeesLoading,setAttendeesLoading]= useState(false)
  const [togglingId,      setTogglingId]      = useState(null)
  const [remindingId,     setRemindingId]     = useState(null)
  const [remindedId,      setRemindedId]      = useState(null)
  const book          = event.books || event.book_snapshot
  const bookLink      = book?.rating_link || null
  const communityScore = book?.avg_score ? parseFloat(book.avg_score).toFixed(1) : null
  const voteCount      = book?.vote_count || 0

  const activeECs = (event.event_coordinators || []).filter(ec => !ec.replaced_at)
  const coordinator = activeECs.map(ec => ec.members?.name || ec.members?.username).filter(Boolean).join(", ") || null
  const isEC = !!(member && activeECs.some(ec => ec.member_id === member.id))
  const canManageBooks = isAdmin || isEC

  async function loadAttendees() {
    const { data } = await supabase
      .from("bookings")
      .select("id, seats, has_book, book_given_at, name_hidden, bring_note, members(id, name, username, hide_name), bring:club_bring_categories!bring_category_id(label)")
      .eq("event_id", event.id)
      .eq("status", "confirmed")
    // Named additional attendees (the party), grouped by the booker.
    const { data: partyRows } = await supabase
      .from("booking_attendees")
      .select("owner_id, member_id, guest_name, bring_note, member:members!member_id(name, hide_name), bring:club_bring_categories!bring_category_id(label)")
      .eq("event_id", event.id)
    const partyByOwner = {}
    for (const p of partyRows || []) (partyByOwner[p.owner_id] = partyByOwner[p.owner_id] || []).push(p)
    // Own row always pinned to the top — consistent with every other attendee
    // list (Movies/Social inline lists, EventSlideOut's Coordinator View).
    setAttendees((data || []).map(b => {
      const isOwn     = b.members?.id === member?.id
      const isPrivate = !!(b.members?.hide_name || b.name_hidden)
      return {
        id: b.id,
        name: isOwn ? "You" : (isPrivate && !canManageBooks) ? "Resident" : (b.members?.name || b.members?.username || "Member"),
        isOwn,
        isPrivate,
        seats: b.seats || 1,
        hasBook: !!b.has_book,
        bring: b.bring?.label || null,
        bringNote: b.bring_note || null,
        bookGivenAt: b.book_given_at,
        party: (partyByOwner[b.members?.id] || []).map(p => {
          const gPriv = !!p.member?.hide_name
          const gOwn  = p.member_id && p.member_id === member?.id
          return {
            name: gOwn ? "You" : p.guest_name ? p.guest_name : (gPriv && !canManageBooks) ? "Resident" : (p.member?.name || "Resident"),
            guest: !!p.guest_name,
            bring: p.bring?.label || null,
            bringNote: p.bring_note || null,
          }
        }),
      }
    }).sort((a, b) => (b.isOwn === true) - (a.isOwn === true)))
  }

  async function toggleAttendees() {
    if (attendeesOpen) { setAttendeesOpen(false); return }
    setAttendeesLoading(true)
    await loadAttendees()
    setAttendeesLoading(false)
    setAttendeesOpen(true)
  }

  async function toggleHasBook(bookingId, current) {
    setTogglingId(bookingId)
    const token = await getToken()
    await fetch("/api/coordinator", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event_id: event.id, action: "set_has_book", booking_id: bookingId, has_book: !current }),
    })
    await loadAttendees()
    setTogglingId(null)
  }

  // Manual "remind to return" nudge (2026-07-15) -- catch-all auto reminder
  // lives in the daily cron (app/api/cron/book-return-check/route.js), this
  // is the proactive one-tap version an EC/admin can send anytime someone
  // still has_book. Kept local to this card (no toast plumbing) -- the bell
  // itself flips to a brief "Sent ✓" confirmation, same lightweight pattern
  // as the Has Book/Returned toggle already uses.
  async function remindBookReturn(bookingId, name) {
    if (remindingId) return
    setRemindingId(bookingId)
    const token = await getToken()
    const res = await fetch("/api/coordinator", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event_id: event.id, action: "remind_book_return", booking_id: bookingId }),
    })
    setRemindingId(null)
    if (res.ok) {
      setRemindedId(bookingId)
      setTimeout(() => setRemindedId(null), 2500)
      showToast?.(`Reminder sent to ${name}`)
    } else {
      const data = await res.json().catch(() => ({}))
      showToast?.(data.error || "Could not send reminder")
    }
  }

  const isJoined = booking?.status === "confirmed"

  return (
    <div onClick={onOpen}
      style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)",
        overflow: "hidden", boxShadow: "var(--shadow)", marginBottom: 16, cursor: "pointer" }}>
      {/* Card header */}
      <div style={{ background: colour, padding: "0.6rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}>{label}</span>
        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.78rem", fontWeight: 600 }}>{fmtDate(event.event_date)}</span>
      </div>

      {/* Event image — the theme cue; same focal-point treatment as Social */}
      {event.image_url && (
        <img src={event.image_url} alt={event.title}
          style={{ width: "100%", height: 140, objectFit: "cover", display: "block",
            objectPosition: `${event.image_focal_x ?? 50}% ${event.image_focal_y ?? 50}%` }} />
      )}

      {/* Book info */}
      {book && (
        <div style={{ display: "flex", gap: 12, padding: "0.9rem 1rem", borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
          {book.cover_url && (
            bookLink
              ? <a href={bookLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                  <img src={book.cover_url} alt={book.title}
                    style={{ width: 56, height: 80, objectFit: "cover", borderRadius: 6, flexShrink: 0, display: "block" }} />
                </a>
              : <img src={book.cover_url} alt={book.title}
                  style={{ width: 56, height: 80, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {bookLink
              ? <a href={bookLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  style={{ fontWeight: 800, fontSize: "1rem", lineHeight: 1.2, marginBottom: 2, color: "var(--text)", textDecoration: "none", display: "block" }}>
                  {book.title}
                </a>
              : <div style={{ fontWeight: 800, fontSize: "1rem", lineHeight: 1.2, marginBottom: 2 }}>{book.title}</div>
            }
            <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginBottom: 4 }}>{book.author && `by ${book.author}`}{book.published_year ? ` (${book.published_year})` : ""}</div>
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: 4, alignItems: "center" }}>
              <span style={{ background: "rgba(180,150,0,0.15)", color: "var(--amber-dark)", fontWeight: 700,
                fontSize: "0.68rem", padding: "0.15rem 0.5rem", borderRadius: 20, whiteSpace: "nowrap" }}>
                ⭐ {book.rating ?? "—"}
              </span>
              <span style={{ background: colour + "1f", color: colour, fontWeight: 700,
                fontSize: "0.68rem", padding: "0.15rem 0.55rem", borderRadius: 20, whiteSpace: "nowrap" }}>
                {communityScore ?? "—"} ({voteCount})
              </span>
            </div>
            {coordinator && (
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: 6 }}>
                📋 Coordinated by <strong>{coordinator}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: "0.9rem 1rem 0.6rem" }}>
        {/* Event name (themed events) — book clubs already show the book title above */}
        {!book && event.title && (
          <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--text)", marginBottom: 6 }}>{event.title}</div>
        )}
        {/* Event notes */}
        {event.description && (
          <div style={{ marginBottom: 10 }}>
            <ExpandableText
              text={bbToHtml(event.description, colour)}
              html
              fontSize={13.6}
              lineHeight={1.5}
              maxLines={2}
              colour={colour}
            />
          </div>
        )}

        {/* Book summary */}
        {book?.summary && (
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
        )}

        {/* Show more / Show attendees row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4, paddingBottom: 2 }}>
          {book?.summary ? (
            <button onClick={e => { e.stopPropagation(); setSummaryOpen(o => !o) }}
              style={{ background: "none", border: "none", color: colour, fontSize: "0.78rem",
                fontWeight: 700, cursor: "pointer", padding: "2px 0", fontFamily: "inherit" }}>
              {summaryOpen ? "Show less ▲" : "Show more ▼"}
            </button>
          ) : <span />}
          <button onClick={e => { e.stopPropagation(); toggleAttendees() }} disabled={attendeesLoading}
            style={{ background: "none", border: "none", color: colour, fontSize: "0.78rem",
              fontWeight: 700, cursor: attendeesLoading ? "wait" : "pointer", padding: "2px 0", fontFamily: "inherit" }}>
            {attendeesLoading ? "Loading…" : attendeesOpen ? "Hide attendees ▲" : "Show attendees ▼"}
          </button>
        </div>

        {/* EC-only dish breakdown, grouped by category (Iain 2026-07-18) */}
        {attendeesOpen && canManageBooks && caps.bringEnabled && attendees && (() => {
          const groups = {}
          for (const a of attendees) {
            if (a.bring) (groups[a.bring] = groups[a.bring] || []).push({ name: a.name === "You" ? "You" : a.name, note: a.bringNote })
            for (const p of (a.party || [])) if (p.bring) (groups[p.bring] = groups[p.bring] || []).push({ name: p.name, note: p.bringNote })
          }
          const cats = Object.keys(groups)
          if (!cats.length) return null
          return (
            <div style={{ marginTop: 6, background: colour + "12", borderRadius: 10, padding: "0.5rem 0.8rem 0.6rem" }}>
              <div style={{ fontSize: "0.68rem", fontWeight: 700, color: colour, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>What&apos;s coming</div>
              {cats.map(cat => (
                <div key={cat} style={{ fontSize: "0.78rem", color: "var(--text)", marginBottom: 2, lineHeight: 1.45 }}>
                  <strong>{cat}</strong> ({groups[cat].length}): <span style={{ color: "var(--text-dim)" }}>{groups[cat].map(g => g.note ? `${g.note} (${g.name})` : g.name).join(", ")}</span>
                </div>
              ))}
            </div>
          )
        })()}

        {/* Attendees list */}
        {attendeesOpen && (
          <div style={{ marginTop: 6, background: "var(--surface2)", borderRadius: 10, padding: "0.4rem 0.8rem 0.5rem" }}>
            {attendees && attendees.length > 0 ? (
              attendees.map((a, i) => (
                <div key={a.id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", padding: "0.3rem 0",
                  borderBottom: i < attendees.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    {/* One person per line; dish in the club colour; fades if it
                        doesn't fit (Iain 2026-07-18 — colour is the lead, no icon). */}
                    <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: a.isOwn ? 700 : 400, color: a.isOwn ? colour : "var(--text)" }}>
                      {a.name}
                      {a.isPrivate && canManageBooks && !a.isOwn && <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-dim)", marginLeft: 4 }}>(P)</span>}
                      {a.bring && <span style={{ fontWeight: 600, color: colour }}> · {a.bring}{a.bringNote ? ` — ${a.bringNote}` : ""}</span>}
                    </span>
                    {(a.party || []).map((p, j) => (
                      <span key={j} style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: "0.75rem", color: "var(--text-dim)" }}>
                        {p.name}{p.guest ? " (guest)" : ""}
                        {p.bring && <span style={{ color: colour, fontWeight: 600 }}> · {p.bring}{p.bringNote ? ` — ${p.bringNote}` : ""}</span>}
                      </span>
                    ))}
                  </span>
                  {canManageBooks && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {a.hasBook && (
                        <button
                          onClick={e => { e.stopPropagation(); remindBookReturn(a.id, a.name) }}
                          disabled={remindingId === a.id}
                          title="Remind to return book"
                          aria-label={`Remind ${a.name} to return their book`}
                          style={{ display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "none",
                            padding: "0.1rem 0.15rem", cursor: remindingId === a.id ? "default" : "pointer", fontFamily: "inherit",
                            flexShrink: 0, opacity: remindingId === a.id ? 0.35 : 1, fontSize: "0.85rem", lineHeight: 1 }}>
                          {remindedId === a.id ? "✅" : "🔔"}
                        </button>
                      )}
                      {caps.hasBookReturn && (
                      <div onClick={e => { e.stopPropagation(); toggleHasBook(a.id, a.hasBook) }} role="switch" aria-checked={a.hasBook}
                        title={a.hasBook ? "Mark as returned" : "Mark book as given out"}
                        style={{ display: "flex", alignItems: "center", gap: 6, cursor: togglingId === a.id ? "wait" : "pointer", opacity: togglingId === a.id ? 0.6 : 1 }}>
                        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: a.hasBook ? colour : "var(--text-dim)" }}>{a.hasBook ? "Has Book" : a.bookGivenAt ? "Returned" : "No Book"}</span>
                        <div style={{ position: "relative", width: 36, height: 20, borderRadius: 10,
                          background: a.hasBook ? colour : "var(--border)", transition: "background 0.2s", flexShrink: 0 }}>
                          <span style={{ position: "absolute", top: 2, left: a.hasBook ? 18 : 2, width: 16, height: 16,
                            borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }} />
                        </div>
                      </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", fontStyle: "italic" }}>No attendees yet</div>
            )}
          </div>
        )}
      </div>

      {/* Booking status strip */}
      <BookingStrip isJoined={isJoined} seats={booking?.seats || 1} hasBook={!!booking?.has_book} bookReturnDate={event?.book_return_date} colour={colour} />
    </div>
  )
}

// ── Closed Events Accordion ───────────────────────────────────────────────────
function ClosedEventsAccordion({ events, myBookedIds, colour = "var(--purple)" }) {
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
                  <div style={{ width: 36, height: 52, borderRadius: 4, background: colour + "20",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "1.1rem" }}>📖</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", lineHeight: 1.2 }}>{book?.title || ev.title}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{book?.author && `by ${book.author}`}{book?.published_year ? ` (${book.published_year})` : ""}</div>
                  <div style={{ fontSize: "0.72rem", color: colour, marginTop: 2 }}>{fmtYear(ev.event_date)}</div>
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
function BookPicker({ onSelect, initialBook, colour = "var(--purple)" }) {
  const [allBooks, setAllBooks] = useState([])
  const [query,    setQuery]    = useState("")
  const [chosen,   setChosen]   = useState(initialBook || null)
  const [open,     setOpen]     = useState(!initialBook)

  useEffect(() => {
    async function loadBooks() {
      const { data: books } = await supabase.from("books").select("id, title, author, cover_url, published_year").order("title")
      const ids = (books || []).map(b => b.id)
      const sums = {}, counts = {}
      if (ids.length) {
        const { data: votes } = await supabase.from("book_votes").select("book_id, score").in("book_id", ids)
        for (const v of votes || []) {
          sums[v.book_id]   = (sums[v.book_id]   || 0) + v.score
          counts[v.book_id] = (counts[v.book_id] || 0) + 1
        }
      }
      // Sort by community score (descending) so the organiser can see what's
      // actually winning without leaving this screen — was previously
      // alphabetical with no score shown at all. Unscored books sort last.
      const withScores = (books || []).map(b => ({
        ...b,
        avg_score:  counts[b.id] ? (sums[b.id] / counts[b.id]).toFixed(1) : null,
        vote_count: counts[b.id] || 0,
      })).sort((a, b) => {
        if (a.avg_score == null && b.avg_score == null) return a.title.localeCompare(b.title)
        if (a.avg_score == null) return 1
        if (b.avg_score == null) return -1
        return parseFloat(b.avg_score) - parseFloat(a.avg_score)
      })
      setAllBooks(withScores)
    }
    loadBooks()
  }, [])

  const filtered = allBooks.filter(b =>
    !query || b.title?.toLowerCase().includes(query.toLowerCase()) ||
    b.author?.toLowerCase().includes(query.toLowerCase())
  )

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
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>{chosen.author && `by ${chosen.author}`}{chosen.published_year ? ` (${chosen.published_year})` : ""}</div>
        </div>
        <button onClick={() => { setChosen(null); setQuery(""); setOpen(true); onSelect(null) }}
          style={{ background: colour, color: "#fff", border: "none", borderRadius: 8,
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
        onChange={e => setQuery(e.target.value)}
        style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: 10, border: `1px solid ${colour}`,
          background: "var(--surface)", color: "var(--text)", fontSize: "1rem",
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
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{b.author}{b.published_year ? ` (${b.published_year})` : ""}</div>
              </div>
              {b.avg_score != null && (
                <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--amber-dark)", background: "rgba(180,150,0,0.15)", padding: "0.15rem 0.5rem", borderRadius: 20, whiteSpace: "nowrap", flexShrink: 0 }}>
                  ⭐ {b.avg_score}
                </span>
              )}
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
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{b.author}{b.published_year ? ` (${b.published_year})` : ""}</div>
              </div>
              {b.avg_score != null && (
                <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--amber-dark)", background: "rgba(180,150,0,0.15)", padding: "0.15rem 0.5rem", borderRadius: 20, whiteSpace: "nowrap", flexShrink: 0 }}>
                  ⭐ {b.avg_score}
                </span>
              )}
            </div>
          ))}
          {allBooks.length > 5 && (
            <div style={{ padding: "0.5rem 1rem", fontSize: "0.75rem", color: "var(--text-dim)" }}>
              Type to search {allBooks.length} books… (sorted by community score)
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Coordinator Typeahead Picker ─────────────────────────────────────────────
function CoordPicker({ members, value, onChange, valid = false, colour = "var(--purple)" }) {
  const chosen = members.find(m => m.id === value) || null
  const [query,  setQuery]  = useState("")
  const [open,   setOpen]   = useState(false)
  const containerRef        = useRef(null)

  const filtered = members.filter(m =>
    !query || (m.name || m.username || "").toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const borderCol = open ? colour : valid ? "var(--green)" : "var(--danger)"
  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div
        onClick={() => { setOpen(o => !o); setQuery("") }}
        role="button" tabIndex={0} aria-haspopup="listbox" aria-expanded={open}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(o => !o); setQuery("") } }}
        style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: 10,
          border: `1.5px solid ${borderCol}`, background: "var(--surface)",
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
                color: "var(--text)", fontSize: "1rem", outline: "none", fontFamily: "inherit" }}
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
                  background: m.id === value ? colour + "12" : "transparent",
                  borderBottom: "1px solid var(--border)",
                  fontWeight: m.id === value ? 700 : 400, fontSize: "0.88rem",
                  color: m.id === value ? colour : "var(--text)" }}>
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

// ── Hour picker — hour + AM/PM only (no minutes; Iain 2026-07-17) ────────────
function HourPicker({ value, onChange, colour, inputStyle }) {
  const [hhRaw, mmRaw] = (value || "09:00").split(":")
  const h24  = parseInt(hhRaw, 10) || 0
  const mins = parseInt(mmRaw, 10) >= 30 ? 30 : 0
  const isPM = h24 >= 12
  const h12  = h24 % 12 === 0 ? 12 : h24 % 12
  const emit = (newH12, pm, m = mins) => {
    let h = newH12 % 12
    if (pm) h += 12
    onChange(String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"))
  }
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select value={h12} onChange={e => emit(parseInt(e.target.value, 10), isPM)}
        style={{ ...inputStyle, flex: 1, cursor: "pointer" }}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <select value={mins} onChange={e => emit(h12, isPM, parseInt(e.target.value, 10))}
        style={{ ...inputStyle, flex: 1, cursor: "pointer" }}>
        <option value={0}>00</option>
        <option value={30}>30</option>
      </select>
      <div style={{ display: "flex", gap: 6 }}>
        {["AM", "PM"].map(l => {
          const on = (l === "PM") === isPM
          return (
            <button key={l} type="button" onClick={() => emit(h12, l === "PM")}
              style={{ padding: "0 1rem", borderRadius: 10, fontFamily: "inherit", cursor: "pointer",
                fontWeight: on ? 700 : 500,
                border: `1.5px solid ${on ? colour : "var(--border)"}`,
                background: on ? colour : "var(--surface)", color: on ? "#fff" : "var(--text)" }}>{l}</button>
          )
        })}
      </div>
    </div>
  )
}

// ── Bring-a-dish: pick which of the club's categories apply to THIS event ────
// The club defines the full list; each event chooses which are allowed, and an
// attendee booking only sees the allowed ones (Iain 2026-07-18).
// value === null means "all of them".
function BringCategoryPicker({ clubId, colour, value, onChange }) {
  const [cats, setCats] = useState([])
  useEffect(() => {
    if (!clubId) return
    supabase.from("club_bring_categories").select("id, label, sort").eq("club_id", clubId).order("sort")
      .then(({ data }) => setCats(data || []))
  }, [clubId])

  if (!cats.length) {
    return <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>No categories set yet — add them in Admin &rsaquo; Clubs.</div>
  }
  const selected = value === null || value === undefined ? cats.map(c => c.id) : value
  const toggle = (id) => {
    const next = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]
    onChange(next.length === cats.length ? null : next)
  }
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
        {cats.map(c => {
          const on = selected.includes(c.id)
          return (
            <button key={c.id} type="button" onClick={() => toggle(c.id)}
              style={{ borderRadius: 14, padding: "0.2rem 0.7rem", fontSize: "0.8rem", fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                border: `1px solid ${on ? colour : "var(--border)"}`,
                background: on ? colour : "var(--surface)", color: on ? "#fff" : "var(--text-dim)" }}>
              {c.label}
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>Tap to choose which apply to this event — attendees pick one of these when they book.</div>
    </div>
  )
}

// ── Admin Inline Event Form ───────────────────────────────────────────────────
function CoordMultiPicker({ members, value = [], onChange, colour = "var(--purple)", max = 3 }) {
  const chosen = value.map(id => members.find(m => m.id === id)).filter(Boolean)
  const available = members.filter(m => !value.includes(m.id))
  return (
    <div>
      {chosen.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {chosen.map(m => (
            <span key={m.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--surface2)", border: `1px solid ${colour}`, borderRadius: 999, padding: "0.3rem 0.35rem 0.3rem 0.75rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>
              {m.name || m.username}
              <button type="button" onClick={() => onChange(value.filter(id => id !== m.id))} aria-label={`Remove ${m.name || m.username}`}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "1.15rem", height: "1.15rem", borderRadius: 999, border: "none", background: "var(--border)", color: "var(--text)", fontSize: "0.72rem", cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}
      {value.length < max ? (
        <CoordPicker members={available} value="" valid={value.length > 0} colour={colour}
          onChange={id => { if (id) onChange([...value, id]) }} />
      ) : (
        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Maximum {max} coordinators reached.</div>
      )}
    </div>
  )
}

function AdminEventForm({ event, members, onSave, onClose, club, colour = "var(--purple)" }) {
  const inputStyle = { width: "100%", padding: "0.75rem 1rem", borderRadius: 10,
    border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
    fontSize: "1rem", boxSizing: "border-box", fontFamily: "inherit",
    appearance: "none", WebkitAppearance: "none" }

  const caps = clubCaps(club)
  const onsiteLocations = useLocations()
  const activeEC = event ? (event.event_coordinators || []).find(ec => !ec.replaced_at) : null
  const todayStr = new Date().toISOString().split("T")[0]
  const nowHour  = String(new Date().getHours()).padStart(2, "0") + ":00"
  const [form,   setForm]   = useState({
    event_date:   event?.event_date || todayStr,
    event_time:   (event?.event_time || nowHour).slice(0, 5),
    kit_return_date: event?.kit_return_date || "",
    book_return_date: event?.book_return_date || "",
    reservation_cutoff: cutoffToDateValue(event?.reservation_cutoff),
    max_seats:    event?.max_seats ?? 20,
    location_type: event?.location_type || "onsite",
    location:     event?.location || "",
    max_seats_per_booking: event?.max_seats_per_booking ?? 2,
    allow_nonresident_guests: event?.allow_nonresident_guests || false,
    payment_required: event?.payment_required || false,
    cost:         event?.cost || "",
    payment_due_by: event?.payment_due_by || "",
    is_public:    event?.is_public !== false,
    show_attendee_names: event?.show_attendee_names !== false,
    title:        event?.title || "",
    bring_category_ids: event?.bring_category_ids || null,
    theme_name:   event?.theme_name || "",
    description:  event?.description || "",
    welcome_message: event?.welcome_message || "",
    coordinator_ids: (event?.event_coordinators || []).filter(ec => !ec.replaced_at).map(ec => ec.member_id),
  })
  const [selectedBook, setSelectedBook] = useState(event?.books || null)
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const [saveError, setSaveError] = useState(null)

  async function save() {
    if (!form.event_date || (caps.hasBooks && !selectedBook)) return
    if (!caps.hasBooks && !form.title.trim()) { setSaveError("Please give the event a name."); return }
    setSaving(true)
    setSaveError(null)

    // Upsert book record — only for clubs that actually have a books
    // catalogue. Previously this dereferenced selectedBook unconditionally,
    // which threw (and silently killed the save) for any club without a book.
    let bookId = null
    if (caps.hasBooks && selectedBook) {
    bookId = selectedBook.id || null
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
            published_year: selectedBook.published_year || null,
          })
          .select("id")
          .single()
        if (bookErr) { setSaveError("Could not save book: " + bookErr.message); setSaving(false); return }
        bookId = newBook?.id
      }
    }

    }

    const payload = {
      hub_type:        "club",
      club_id:         club.id,
      event_date:      form.event_date,
      event_time:      form.event_time || "00:00",
      title:           form.title.trim() || selectedBook?.title || club?.name || "Club Event",
      is_public:       form.is_public !== false,
      show_attendee_names: form.show_attendee_names !== false,
      description:     form.description,
      welcome_message: form.welcome_message,
      book_id:         caps.hasBooks ? bookId : null,
      kit_return_date: caps.hasKitReturn  ? (form.kit_return_date  || null) : null,
      book_return_date: caps.hasBookReturn ? (form.book_return_date || null) : null,
      reservation_cutoff: cutoffFromDateValue(form.reservation_cutoff),
      max_seats:       Number(form.max_seats) || 20,
      location_type:   form.location_type || "onsite",
      location:        form.location || null,
      max_seats_per_booking: Number(form.max_seats_per_booking) || 1,
      allow_nonresident_guests: Number(form.max_seats_per_booking) > 1 ? !!form.allow_nonresident_guests : false,
      payment_required: caps.hasCost ? !!form.payment_required : false,
      cost:            caps.hasCost && form.payment_required ? (Number(form.cost) || 0) : 0,
      payment_due_by:  caps.hasCost && form.payment_required ? (form.payment_due_by || null) : null,
      max_seats_per_booking: Number(form.max_seats_per_booking) || 1,
      allow_nonresident_guests: Number(form.max_seats_per_booking) > 1 ? !!form.allow_nonresident_guests : false,
      payment_required: caps.hasCost ? !!form.payment_required : false,
      cost:            caps.hasCost && form.payment_required ? (Number(form.cost) || 0) : 0,
      payment_due_by:  caps.hasCost && form.payment_required ? (form.payment_due_by || null) : null,
      bring_category_ids: caps.bringEnabled ? (form.bring_category_ids || null) : null,
      theme_name:      caps.hasTheme ? (form.theme_name.trim() || null) : null,
      archived:        false,
      book_snapshot:   selectedBook ? {
        title:     selectedBook.title,
        author:    selectedBook.author,
        cover_url: selectedBook.cover_url,
      } : null,
    }

    let eventId = event?.id
    if (eventId) {
      const detailsChanged = event?.event_date !== payload.event_date
        || (event?.event_time || null) !== (payload.event_time || null)
        || (event?.location || null) !== (payload.location || null)
      const { error: evErr } = await supabase.from("events").update(payload).eq("id", eventId)
      if (evErr) { setSaveError("Could not update event: " + evErr.message); setSaving(false); return }
      if (detailsChanged) {
        const token = await getToken()
        fetch("/api/bookclub/notify-updated", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ event_id: eventId, title: payload.title }),
        }).catch(() => {})
      }
    } else {
      const { data, error: evErr } = await supabase.from("events").insert(payload).select("id").single()
      if (evErr) { setSaveError("Could not create event: " + evErr.message); setSaving(false); return }
      eventId = data?.id
      // Tell the club's joined members about the new event (server-side fan-out).
      try {
        const token = await getToken()
        fetch("/api/clubs/event-added", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ club_id: club.id, event_id: eventId, title: payload.title, event_date: payload.event_date }),
        }).catch(() => {})
      } catch {}
    }

    // Save coordinators (up to 3 ECs). Replace the whole active set with the
    // chosen list so removals and additions both take effect.
    if (form.coordinator_ids?.length && eventId) {
      await supabase
        .from("event_coordinators")
        .update({ replaced_at: new Date().toISOString() })
        .eq("event_id", eventId)
        .is("replaced_at", null)

      await supabase.from("event_coordinators")
        .insert(form.coordinator_ids.map(id => ({ event_id: eventId, member_id: id })))
    }

    setSaving(false)
    if (!saveError) onSave()
  }

  const labelStyle = { fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)",
    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, display: "block" }

  return (
    <div style={{ background: "var(--surface)", borderRadius: 16, border: `2px solid ${colour}`,
      padding: "1.25rem", marginBottom: 16 }}>
      <div style={{ fontWeight: 800, fontSize: "1rem", color: colour, marginBottom: 16 }}>
        {event ? `Edit ${club?.name || "Club"} Event` : `Add ${club?.name || "Club"} Event`}
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Event Name{!caps.hasBooks && <span style={{ color: "var(--danger)" }}> *</span>}</label>
        <input value={form.title} onChange={e => set("title", e.target.value)}
          placeholder={caps.hasBooks ? "Leave blank to use the book title" : "e.g. Italian Night"}
          style={inputStyle} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Date <span style={{ color: "var(--danger)" }}>*</span></label>
        <input type="date" autoFocus value={form.event_date} onChange={e => set("event_date", e.target.value)} onClick={e => e.currentTarget.showPicker?.()}
          style={{ ...inputStyle, border: `1.5px solid ${form.event_date ? "var(--green)" : "var(--danger)"}` }} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Location</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {["onsite", "offsite"].map(t => (
            <button key={t} type="button" onClick={() => { set("location_type", t); set("location", "") }}
              style={{ flex: 1, padding: "0.55rem", borderRadius: 10, fontFamily: "inherit", fontSize: "0.88rem",
                fontWeight: 700, cursor: "pointer", border: "2px solid",
                borderColor: form.location_type === t ? colour : "var(--border)",
                background: form.location_type === t ? colour + "18" : "var(--surface)",
                color: form.location_type === t ? colour : "var(--text-dim)" }}>
              {t === "onsite" ? "On-site" : "Off-site"}
            </button>
          ))}
        </div>
        {form.location_type === "onsite" ? (
          <select value={form.location} onChange={e => set("location", e.target.value)}
            style={{ ...inputStyle, cursor: "pointer" }}>
            <option value="">Select venue…</option>
            {onsiteLocations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        ) : (
          <textarea value={form.location} onChange={e => set("location", e.target.value)} rows={3}
            placeholder="Enter venue name and address…" style={{ ...inputStyle, resize: "vertical" }} />
        )}
      </div>

      <div style={{ marginBottom: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={labelStyle}>Total Seats</label>
          <input type="number" min={1} max={500} value={form.max_seats}
            onChange={e => set("max_seats", e.target.value)} onWheel={e => e.currentTarget.blur()}
            style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Max per Booking</label>
          <input type="number" min={1} max={10} value={form.max_seats_per_booking}
            onChange={e => set("max_seats_per_booking", e.target.value)} onWheel={e => e.currentTarget.blur()}
            style={inputStyle} />
        </div>
      </div>

      {Number(form.max_seats_per_booking) > 1 && (
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Extra attendees on multi-seat bookings</label>
        <div style={{ display: "flex", gap: 8 }}>
          {[{ v: false, t: "Residents only" }, { v: true, t: "Residents + guests" }].map(opt => (
            <button key={String(opt.v)} type="button" onClick={() => set("allow_nonresident_guests", opt.v)}
              style={{ flex: 1, padding: "0.6rem 0.5rem", borderRadius: 10, fontSize: "0.88rem", fontFamily: "inherit", cursor: "pointer",
                border: `1.5px solid ${form.allow_nonresident_guests === opt.v ? colour : "var(--border)"}`,
                background: form.allow_nonresident_guests === opt.v ? colour : "var(--surface)",
                color: form.allow_nonresident_guests === opt.v ? "#fff" : "var(--text)",
                fontWeight: form.allow_nonresident_guests === opt.v ? 700 : 500 }}>{opt.t}</button>
          ))}
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: 4 }}>Booking more than one seat means naming each extra attendee.</div>
      </div>
      )}

      {caps.hasCost && (
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Paid event</label>
        <div style={{ display: "flex", gap: 8, marginBottom: form.payment_required ? 10 : 0 }}>
          {[{ v: false, t: "Free" }, { v: true, t: "Paid" }].map(opt => (
            <button key={String(opt.v)} type="button" onClick={() => set("payment_required", opt.v)}
              style={{ flex: 1, padding: "0.6rem 0.5rem", borderRadius: 10, fontSize: "0.88rem", fontFamily: "inherit", cursor: "pointer",
                border: `1.5px solid ${form.payment_required === opt.v ? colour : "var(--border)"}`,
                background: form.payment_required === opt.v ? colour : "var(--surface)",
                color: form.payment_required === opt.v ? "#fff" : "var(--text)",
                fontWeight: form.payment_required === opt.v ? 700 : 500 }}>{opt.t}</button>
          ))}
        </div>
        {form.payment_required && (
          <>
            <label style={labelStyle}>Cost per person ($)</label>
            <input type="number" min={0} step={1} value={form.cost} onChange={e => set("cost", e.target.value)}
              onWheel={e => e.currentTarget.blur()} placeholder="e.g. 25" style={{ ...inputStyle, marginBottom: 10 }} />
            <label style={labelStyle}>Payment due by (optional)</label>
            <input type="date" value={form.payment_due_by} onChange={e => set("payment_due_by", e.target.value)}
              onClick={e => e.currentTarget.showPicker?.()} style={inputStyle} />
          </>
        )}
      </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Start Time</label>
        <HourPicker value={form.event_time} onChange={v => set("event_time", v)} colour={colour} inputStyle={inputStyle} />
      </div>

      {caps.hasKitReturn && (
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Kit Return Date</label>
        <input type="date" value={form.kit_return_date} onChange={e => set("kit_return_date", e.target.value)} onClick={e => e.currentTarget.showPicker?.()}
          style={inputStyle} />
        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: 4 }}>When the whole kit goes back to the library.</div>
      </div>
      )}

      {caps.hasBookReturn && (
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Book Return Date</label>
        <input type="date" value={form.book_return_date} onChange={e => set("book_return_date", e.target.value)} onClick={e => e.currentTarget.showPicker?.()}
          style={inputStyle} />
        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: 4 }}>When attendees must return their copy to you — allow time before the kit return date.</div>
      </div>
      )}

      <div style={{ marginBottom: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { k: "is_public",           label: "Public calendar" },
          { k: "show_attendee_names", label: "Show attendees" },
        ].map(({ k, label }) => (
          <button key={k} type="button" onClick={() => set(k, !form[k])}
            style={{ padding: "0.6rem 0.5rem", borderRadius: 10, fontSize: "0.85rem", fontFamily: "inherit",
              cursor: "pointer", fontWeight: form[k] ? 700 : 500,
              border: `1.5px solid ${form[k] ? colour : "var(--border)"}`,
              background: form[k] ? colour + "18" : "var(--surface)",
              color: form[k] ? colour : "var(--text-dim)" }}>
            {form[k] ? "✓ " : ""}{label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label style={labelStyle}>Bookings Close (optional)</label>
        <input type="date" value={form.reservation_cutoff} onChange={e => set("reservation_cutoff", e.target.value)}
          onClick={e => e.currentTarget.showPicker?.()} style={inputStyle} />
        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: "0.35rem" }}>Bookings stay open for all of this day, then residents see &ldquo;Bookings Closed&rdquo;. Leave blank to keep them open until the event.</div>
      </div>

      {event?.id && (
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Event Image</label>
        <EventImagePicker
          eventId={event.id}
          imageUrl={event?.image_url}
          focalX={event?.image_focal_x}
          focalY={event?.image_focal_y}
          colour={colour}
          getToken={getToken}
        />
      </div>
      )}
      {!event?.id && (
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Event Image</label>
        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", fontStyle: "italic" }}>Create the event first, then reopen it to add a photo.</div>
      </div>
      )}

      {caps.hasTheme && (
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Theme</label>
        <input value={form.theme_name} onChange={e => set("theme_name", e.target.value)}
          placeholder="e.g. Italian Night" style={inputStyle} />
      </div>
      )}

      {caps.bringEnabled && (
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Attendees bring something</label>
        <BringCategoryPicker clubId={club?.id} colour={colour}
          value={form.bring_category_ids} onChange={v => set("bring_category_ids", v)} />
      </div>
      )}

      {caps.hasBooks && (
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Book <span style={{ color: "var(--danger)" }}>*</span></label>
        <BookPicker onSelect={setSelectedBook} initialBook={event?.books || null} colour={colour} />
      </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Event Coordinator{form.coordinator_ids.length !== 1 ? "s" : ""} <span style={{ color: "var(--danger)" }}>*</span> <span style={{ textTransform: "none", fontWeight: 500, color: "var(--text-dim)" }}>(up to 3)</span></label>
        <CoordMultiPicker
          members={members}
          value={form.coordinator_ids}
          onChange={ids => set("coordinator_ids", ids)}
          colour={colour}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Event Details</label>
        <RichEditor
          initialValue={form.description}
          hubColour={colour}
          onChange={html => set("description", html)}
          placeholder="Any extra details about this meeting…"
        />
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
        <button onClick={save} disabled={saving || !form.event_date || (caps.hasBooks && !selectedBook)}
          style={{ flex: 2, padding: "0.75rem", background: colour, border: "none",
            borderRadius: 12, fontWeight: 700, fontSize: "0.9rem", color: "#fff",
            cursor: (saving || !form.event_date || (caps.hasBooks && !selectedBook)) ? "not-allowed" : "pointer",
            opacity: (saving || !form.event_date || (caps.hasBooks && !selectedBook)) ? 0.6 : 1, fontFamily: "inherit" }}>
          {saving ? "Saving…" : event ? "Save Changes" : "Create Event"}
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
// ── Join/leave + club notices (Phase 2c) ─────────────────────────────────────
// Joining is notices-only — never a gate on booking. Only joined members get
// notified when a notice is posted; anyone can read them here.
function ClubSocial({ club, colour, isAdmin }) {
  const { member } = useUser()
  const [joined, setJoined]     = useState(null)   // null = loading
  const [busy, setBusy]         = useState(false)
  const [notices, setNotices]   = useState([])
  const [composing, setComposing] = useState(false)
  const [draft, setDraft]       = useState("")
  const [posting, setPosting]   = useState(false)
  const [toast, setToast]       = useState(null)

  const loadNotices = () => {
    supabase.from("club_notices").select("id, content, created_at")
      .eq("club_id", club.id).eq("archived", false).order("created_at", { ascending: false })
      .then(({ data }) => setNotices(data || []))
  }
  useEffect(() => {
    loadNotices()
    if (!member?.id) { setJoined(false); return }
    supabase.from("club_members").select("member_id").eq("club_id", club.id).eq("member_id", member.id).maybeSingle()
      .then(({ data }) => setJoined(!!data))
  }, [club.id, member?.id])

  async function toggleJoin() {
    if (!member?.id || busy) return
    setBusy(true)
    if (joined) {
      await supabase.from("club_members").delete().eq("club_id", club.id).eq("member_id", member.id)
      setJoined(false)
    } else {
      await supabase.from("club_members").insert({ club_id: club.id, member_id: member.id })
      setJoined(true)
    }
    setBusy(false)
  }

  async function postNotice() {
    if (!draft.trim() || posting) return
    setPosting(true)
    const token = await getToken()
    const res = await fetch("/api/clubs/notices", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ club_id: club.id, content: draft }),
    })
    const data = await res.json()
    setPosting(false)
    if (!res.ok) { setToast(data.error || "Could not post"); setTimeout(() => setToast(null), 3000); return }
    setDraft(""); setComposing(false); loadNotices()
    setToast(data.notified ? `Posted — ${data.notified} member${data.notified !== 1 ? "s" : ""} notified` : "Posted")
    setTimeout(() => setToast(null), 3000)
  }

  async function removeNotice(id) {
    if (!confirm("Remove this notice?")) return
    const token = await getToken()
    await fetch("/api/clubs/notices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id }),
    })
    loadNotices()
  }

  const fmt = (iso) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" })

  return (
    <div style={{ marginBottom: 16 }}>
      {toast && <div style={{ position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "var(--text)", color: "var(--bg)", padding: "0.5rem 1rem", borderRadius: 8, fontSize: "0.85rem", fontWeight: 600 }}>{toast}</div>}

      {/* Join + Post notice — compact pills on one line, outside any event */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        {member?.id && joined !== null && (
          <button onClick={toggleJoin} disabled={busy} title={joined ? "Tap to leave — you'll stop getting this club's notices" : "Join to get this club's notices"}
            style={{ padding: "0.4rem 0.9rem", borderRadius: 20, fontFamily: "inherit", fontWeight: 700,
              fontSize: "0.82rem", cursor: busy ? "wait" : "pointer", whiteSpace: "nowrap",
              border: `1.5px solid ${colour}`,
              background: joined ? "var(--surface)" : colour,
              color: joined ? colour : "#fff" }}>
            {joined ? "✓ Joined" : "Join"}
          </button>
        )}
        {isAdmin && !composing && (
          <button onClick={() => setComposing(true)}
            style={{ padding: "0.4rem 0.9rem", borderRadius: 20, border: `1px dashed ${colour}`,
              background: "transparent", color: colour, fontWeight: 700, fontFamily: "inherit",
              fontSize: "0.82rem", cursor: "pointer", whiteSpace: "nowrap" }}>
            📣 Post notice
          </button>
        )}
      </div>

      {/* Admin composer */}
      {isAdmin && composing && (
        (() => (
          <div style={{ marginBottom: 12, border: `1px solid ${colour}`, borderRadius: 12, padding: "0.75rem" }}>
            <RichEditor key="club-notice" initialValue="" hubColour={colour.startsWith("var(") ? undefined : colour}
              onChange={setDraft} placeholder="Write a notice for this club's members…" />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => { setComposing(false); setDraft("") }} style={{ flex: 1, padding: "0.6rem", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>Cancel</button>
              <button onClick={postNotice} disabled={posting || !draft.trim()} style={{ flex: 2, padding: "0.6rem", borderRadius: 10, border: "none", background: colour, color: "#fff", fontWeight: 700, fontFamily: "inherit", cursor: (posting || !draft.trim()) ? "not-allowed" : "pointer", opacity: (posting || !draft.trim()) ? 0.6 : 1 }}>{posting ? "Posting…" : "Post notice"}</button>
            </div>
          </div>
        ))()
      )}

      {/* Notices */}
      {notices.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notices.map(n => (
            <div key={n.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${colour}`, borderRadius: 10, padding: "0.75rem 0.9rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: colour, textTransform: "uppercase", letterSpacing: "0.04em" }}>📣 Notice</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>{fmt(n.created_at)}</span>
              </div>
              <div style={{ fontSize: "0.88rem", color: "var(--text)", lineHeight: 1.5, marginTop: 4 }}>
                {/<[a-z][\s\S]*>/i.test(n.content)
                  ? <span dangerouslySetInnerHTML={{ __html: n.content }} />
                  : n.content}
              </div>
              {isAdmin && (
                <button onClick={() => removeNotice(n.id)} style={{ marginTop: 6, background: "none", border: "none", color: "var(--danger)", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Remove</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ClubHome({ club }) {
  const { member, isAdmin } = useUser()
  // Everything below is driven by the club's CONFIG, never by a hub name —
  // that's what lets Book Club and Dinner Club share this one page.
  const caps   = clubCaps(club)
  const colour = clubColour(club)
  const welcomeText = club?.welcome_text || ""
  const [events,      setEvents]      = useState([])  // all non-archived BC events ordered by date asc
  const [myBookings,  setMyBookings]  = useState({})  // eventId → booking
  const [seatCounts,  setSeatCounts]  = useState({})  // eventId → {confirmed, waitlist} seats
  const [myBookedIds, setMyBookedIds] = useState(new Set())  // past event ids user participated in
  const [members,     setMembers]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [toast,       setToast]       = useState(null)
  const [showForm,    setShowForm]    = useState(false)
  const [editEvent,   setEditEvent]   = useState(null)
  const [slideOutEvent, setSlideOutEvent] = useState(null)
  const [outstandingBook, setOutstandingBook] = useState(null) // { book_id, title } — member's most recent unreturned book, if any

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  function toSlideOutShape(ev, myBooking) {
    // Block joining a different book while a previously-issued kit copy hasn't
    // been returned yet (has_book=true, cleared manually by EC/admin). Same
    // book (a repeat cycle) is always allowed through.
    const bookConflictTitle = (outstandingBook && ev.book_id && outstandingBook.book_id !== ev.book_id)
      ? outstandingBook.title
      : null
    return {
      ...ev,
      hub_type: "club",
      club_id: club.id,
      club,
      max_seats: ev.max_seats ?? 0,
      bookings_count: (seatCounts[ev.id]?.confirmed) || 0,
      waitlist_count: (seatCounts[ev.id]?.waitlist) || 0,
      my_bookings: (myBooking && myBooking.status !== "cancelled")
        ? [{ status: myBooking.status, seats: myBooking.seats || 1, payment_status: myBooking.payment_status ?? null, has_book: !!myBooking.has_book }]
        : [],
      book: ev.books || null,
      book_conflict_title: bookConflictTitle,
      payment_required: !!ev.payment_required,
    }
  }

  function openSlideOut(ev) {
    setSlideOutEvent(toSlideOutShape(ev, myBookings[ev.id]))
  }

  async function handleSlideOutRefresh() {
    if (!slideOutEvent) return
    const currentId = slideOutEvent.id
    // Refresh booking state in-place so user sees confirmation without slideout closing
    const { data: bkRows } = await supabase
      .from("bookings")
      .select("id, status, seats, payment_status, has_book")
      .eq("event_id", currentId)
      .eq("member_id", member?.id)
      .neq("status", "cancelled")
    // A split booking legitimately returns two rows (confirmed + waitlist), so
    // this can't use maybeSingle(). Carry the real seats/payment_status through
    // rather than assuming one unpaid seat.
    const bk = (bkRows || []).find(b => b.status === "confirmed") || (bkRows || [])[0] || null
    setSlideOutEvent(prev => prev ? {
      ...prev,
      my_bookings: bk
        ? [{ status: bk.status, seats: bk.seats || 1, payment_status: bk.payment_status ?? null, has_book: !!bk.has_book }]
        : [],
    } : null)
    load()
  }

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().split("T")[0]

    // All non-archived BC events
    const { data: evs } = await supabase
      .from("events")
      .select("id, title, event_date, event_time, max_seats, max_seats_per_booking, allow_nonresident_guests, cost, payment_due_by, payment_required, location_type, location, image_url, image_focal_x, image_focal_y, theme_name, bring_category_ids, description, welcome_message, book_id, kit_return_date, book_return_date, reservation_cutoff, book_snapshot, books(id, title, author, cover_url, rating, rating_link, summary, published_year), event_coordinators(id, member_id, replaced_at, members!event_coordinators_member_id_fkey(name, username))")
      .eq("club_id", club.id)
      .eq("archived", false)
      .order("event_date", { ascending: true })

    // Attach community vote scores to event.books
    const bookIds = (evs || []).map(e => e.books?.id).filter(Boolean)
    let enrichedEvs = evs || []
    if (bookIds.length) {
      const { data: bvotes } = await supabase.from("book_votes").select("book_id, score").in("book_id", bookIds)
      const scoreSums = {}, scoreCounts = {}
      for (const v of bvotes || []) {
        scoreSums[v.book_id]   = (scoreSums[v.book_id]   || 0) + v.score
        scoreCounts[v.book_id] = (scoreCounts[v.book_id] || 0) + 1
      }
      enrichedEvs = enrichedEvs.map(e => !e.books ? e : {
        ...e,
        books: {
          ...e.books,
          avg_score:  scoreCounts[e.books.id] ? (scoreSums[e.books.id] / scoreCounts[e.books.id]).toFixed(1) : null,
          vote_count: scoreCounts[e.books.id] || 0,
        }
      })
    }
    setEvents(enrichedEvs)

    // Seat counts for every event, so the booking modal shows real capacity
    // (this used to be hardcoded to 0, which made every club event look fully
    // booked and forced people onto the waitlist — Iain 2026-07-18).
    if (evs?.length) {
      const allIds = evs.map(e => e.id)
      const { data: allBk } = await supabase
        .from("bookings").select("event_id, status, seats")
        .in("event_id", allIds).neq("status", "cancelled")
      const counts = {}
      for (const b of allBk || []) {
        const c = counts[b.event_id] || (counts[b.event_id] = { confirmed: 0, waitlist: 0 })
        if (b.status === "confirmed") c.confirmed += (b.seats || 1)
        else if (b.status === "waitlist") c.waitlist += (b.seats || 1)
      }
      setSeatCounts(counts)
    }

    // My bookings for all BC events
    if (member?.id && evs?.length) {
      const ids = evs.map(e => e.id)
      const { data: bks } = await supabase
        .from("bookings")
        .select("id, event_id, status, seats, payment_status, has_book, book_given_at")
        .eq("member_id", member.id)
        .in("event_id", ids)
        .neq("status", "cancelled")

      // A member can have more than one row per event (a confirmed booking
      // plus a waitlist row, or history from a cancel-and-rebook). Blindly
      // taking the last row meant a CANCELLED booking could overwrite the
      // confirmed one, so the card showed "Tap to sign up" while the server
      // correctly refused with "Already booked" (Iain 2026-07-18). Cancelled
      // rows are now excluded and confirmed always wins.
      const byEvent = {}
      for (const b of bks || []) {
        const existing = byEvent[b.event_id]
        if (!existing || (existing.status !== "confirmed" && b.status === "confirmed")) {
          byEvent[b.event_id] = b
        }
      }
      setMyBookings(byEvent)

      // Past participated events
      const past = (evs || []).filter(e => e.event_date < today)
      const participated = new Set(past.filter(e => byEvent[e.id]?.status === "confirmed").map(e => e.id))
      setMyBookedIds(participated)
    }

    // Outstanding book check — this member's most recent unreturned kit copy, if
    // any (has_book=true is never auto-cleared, including on cancellation — see
    // Book Club scope). Used to block joining a different book until it's back.
    if (member?.id) {
      const { data: outRows } = await supabase
        .from("bookings")
        .select("id, has_book, book_given_at, events(id, book_id, title, books(title))")
        .eq("member_id", member.id)
        .eq("has_book", true)
        .order("book_given_at", { ascending: false })
        .limit(1)
      const row = outRows?.[0]
      setOutstandingBook(row?.events?.book_id
        ? { book_id: row.events.book_id, title: row.events.books?.title || row.events.title }
        : null)
    } else {
      setOutstandingBook(null)
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
    const token = await getToken()
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
    const token = await getToken()
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
  // Only clubs that deliberately run one cycle at a time (Book Club) block
  // adding another while one is upcoming; most clubs schedule ahead.
  const canAdd  = isAdmin && (!caps.oneEventAtATime || !nextEvent)
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

      <ClubSocial club={club} colour={colour} isAdmin={isAdmin} />

      {/* Welcome tile */}
      {welcomeText && (
        <div style={{ background: colour, borderRadius: 14,
          padding: "1rem", marginBottom: 16, fontSize: "0.9rem", color: "#fff", lineHeight: 1.6 }}>
          {/<[a-z][\s\S]*>/i.test(welcomeText)
            ? <span dangerouslySetInnerHTML={{ __html: welcomeText }} />
            : welcomeText}
        </div>
      )}

      <ContactBar contextType="club" contextKey={club?.id} contextLabel={club?.name} colour={colour} style={{ marginTop: -4, marginBottom: 16 }} />

      {/* Admin add/edit controls */}
      {isAdmin && !showForm && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {canAdd && (
            <button onClick={() => { setEditEvent(null); setShowForm(true) }}
              style={{ background: colour, color: "#fff", border: "none", borderRadius: 20,
                padding: "8px 18px", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit" }}>
              + Add Event
            </button>
          )}
          {canEdit && (
            <button onClick={() => { setEditEvent(activeEvent); setShowForm(true) }}
              style={{ background: "transparent", color: colour, border: `1px solid ${colour}`,
                borderRadius: 20, padding: "8px 18px", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit" }}>
              Edit Current Event
            </button>
          )}
          {nextEvent && isAdmin && (
            <button onClick={() => { setEditEvent(nextEvent); setShowForm(true) }}
              style={{ background: "transparent", color: colour, border: `1px solid ${colour}`,
                borderRadius: 20, padding: "8px 18px", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit" }}>
              Edit Next Event
            </button>
          )}
        </div>
      )}

      {/* Admin event form */}
      {showForm && (
        <AdminEventForm
          club={club}
          colour={colour}
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
          label={upcoming[0] ? "Next Event" : "Latest Event"}
          booking={myBookings[activeEvent.id]}
          onOpen={() => openSlideOut(activeEvent)}
          colour={colour}
          club={club}
          club={club}
          showToast={showToast}
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
          label="Upcoming Event"
          booking={myBookings[nextEvent.id]}
          onOpen={() => openSlideOut(nextEvent)}
          colour="#7c3aed"
          showToast={showToast}
        />
      )}

      {/* Closed events */}
      <ClosedEventsAccordion events={closedEvents} myBookedIds={myBookedIds} colour={colour} />

      {/* Unified booking slide-over */}
      <EventSlideOut
        event={slideOutEvent}
        onClose={() => setSlideOutEvent(null)}
        onRefresh={handleSlideOutRefresh}
      />
    </div>
  )
}
