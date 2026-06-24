"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import EventSlideOut from "@/components/EventSlideOut"

function localDate(str) {
  if (!str) return null
  const [y, m, d] = str.split("-").map(Number)
  return new Date(y, m - 1, d)
}
function fmtDate(str) {
  if (!str) return ""
  return localDate(str).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })
}
function fmtTime(str) {
  if (!str) return ""
  const [h, m] = str.split(":").map(Number)
  const ampm = h >= 12 ? "pm" : "am"
  return `${h % 12 || 12}:${String(m).padStart(2,"0")}${ampm}`
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
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
      {list.map(g => (
        <span key={g} style={{ fontSize: 10, color: "var(--purple)", background: "var(--purple)15",
          padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>{g}</span>
      ))}
    </div>
  )
}

function NextMeetingCard({ event, myBooking, onBook }) {
  if (!event) return (
    <div style={{ background: "var(--surface)", borderRadius: "16px", border: "1px solid var(--border)",
      padding: "1.5rem", textAlign: "center", marginBottom: "1.25rem" }}>
      <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📚</div>
      <div style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>No upcoming meetings scheduled</div>
    </div>
  )

  const today = new Date(); today.setHours(0,0,0,0)
  const daysUntil = Math.round((localDate(event.event_date) - today) / 86400000)
  const daysLabel = daysUntil === 0 ? "Today!" : daysUntil === 1 ? "Tomorrow" : "In " + daysUntil + " days"
  const isBooked   = myBooking?.status === "confirmed"
  const isWaitlist = myBooking?.status === "waitlist"
  const book = event.books

  return (
    <div style={{ background: "var(--surface)", borderRadius: "16px", border: "1px solid var(--border)",
      overflow: "hidden", boxShadow: "var(--shadow)", marginBottom: "1.25rem" }}>
      <div style={{ background: "var(--purple)", padding: "0.6rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}>Next Meeting</span>
        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.78rem", fontWeight: 600 }}>{daysLabel}</span>
      </div>

      {book && (
        <div style={{ display: "flex", gap: "0.75rem", padding: "0.9rem 1rem", borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
          {book.cover_url && (
            <img src={book.cover_url} alt={book.title}
              style={{ width: 56, height: 80, objectFit: "cover", borderRadius: "6px", flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--purple)", textTransform: "uppercase",
              letterSpacing: "0.07em", marginBottom: "0.2rem" }}>Current Book</div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.2, marginBottom: "0.15rem" }}>{book.title}</div>
            {book.author && <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "0.2rem" }}>by {book.author}</div>}
            <GenrePills genres={book.genres} />
          </div>
        </div>
      )}

      <div style={{ padding: "0.9rem 1rem" }}>
        <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginBottom: "0.2rem" }}>{fmtDate(event.event_date)}</div>
        <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginBottom: event.description ? "0.6rem" : "0.75rem" }}>
          {fmtTime(event.event_time)}{event.location ? " · " + event.location : ""}
        </div>
        {event.description && (
          <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, marginBottom: "0.75rem" }}>
            {event.description}
          </div>
        )}
        {isBooked ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "#dcfce7",
            color: "#15803d", borderRadius: "20px", padding: "0.25rem 0.75rem", fontSize: "0.78rem", fontWeight: 700 }}>
            ✓ Attending
          </div>
        ) : isWaitlist ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "#fef3c7",
            color: "#d97706", borderRadius: "20px", padding: "0.25rem 0.75rem", fontSize: "0.78rem", fontWeight: 700 }}>
            On waitlist
          </div>
        ) : (
          <button onClick={onBook} style={{ background: "var(--purple)", color: "#fff", border: "none",
            borderRadius: "20px", padding: "0.35rem 1rem", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}>
            Join Meeting
          </button>
        )}
      </div>
    </div>
  )
}

function HistoryAccordion({ history }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ background: "var(--surface)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden", marginTop: "0.75rem" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "1rem", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>📖 Book Club History</span>
        <span style={{ color: "var(--text-dim)", fontSize: "1rem", transition: "transform 0.2s",
          transform: open ? "rotate(180deg)" : "none", display: "inline-block" }}>▼</span>
      </button>
      {open && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "0.75rem 1rem" }}>
          {history.length === 0 ? (
            <div style={{ color: "var(--text-dim)", fontSize: "0.88rem", textAlign: "center", padding: "0.5rem" }}>
              No books in the history yet
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {history.map(ev => {
                const book = ev.books
                return (
                  <div key={ev.id} style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
                    {book?.cover_url ? (
                      <img src={book.cover_url} alt={book.title}
                        style={{ width: 36, height: 52, objectFit: "cover", borderRadius: "4px", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 36, height: 52, borderRadius: "4px", background: "var(--purple)20",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "1rem" }}>📖</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.88rem", lineHeight: 1.2 }}>
                        {book?.title || ev.title}
                      </div>
                      {book?.author && <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>by {book.author}</div>}
                      <div style={{ fontSize: "0.72rem", color: "var(--purple)", marginTop: "0.15rem" }}>{fmtYear(ev.event_date)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function BookClubHome() {
  const router        = useRouter()
  const { member }    = useUser()
  const [nextEvent, setNextEvent] = useState(null)
  const [myBooking, setMyBooking] = useState(null)
  const [history,   setHistory]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState(null)

  useEffect(() => {
    if (!member?.id) return
    async function load() {
      const today = new Date().toISOString().split("T")[0]

      // Next upcoming event
      const { data: events } = await supabase
        .from("events")
        .select("id, title, event_date, event_time, hub_type, location, description, welcome_message, max_seats, cost, books(id, title, author, cover_url, genres, rating, rating_link, summary)")
        .eq("hub_type", "bookclub")
        .gte("event_date", today)
        .eq("archived", false)
        .order("event_date", { ascending: true })
        .limit(1)

      const next = events?.[0] || null
      setNextEvent(next)

      if (next) {
        const { data: booking } = await supabase
          .from("bookings")
          .select("id, status, seats")
          .eq("event_id", next.id)
          .eq("member_id", member.id)
          .maybeSingle()
        setMyBooking(booking)
      }

      // History: past book club events, ordered by date desc
      const { data: past } = await supabase
        .from("events")
        .select("id, title, event_date, books(id, title, author, cover_url, genres)")
        .eq("hub_type", "bookclub")
        .lt("event_date", today)
        .eq("archived", false)
        .order("event_date", { ascending: false })

      setHistory(past || [])
      setLoading(false)
    }
    load()
  }, [member?.id])

  function handleRefresh() {
    setSelected(null)
    // Reload bookings
    if (nextEvent && member?.id) {
      supabase.from("bookings").select("id, status, seats")
        .eq("event_id", nextEvent.id).eq("member_id", member.id).maybeSingle()
        .then(({ data }) => setMyBooking(data))
    }
  }

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[160, 56, 56].map((h, i) => <div key={i} style={{ height: h, borderRadius: "14px", background: "var(--surface2)" }} />)}
        </div>
      ) : (
        <>
          <NextMeetingCard
            event={nextEvent}
            myBooking={myBooking}
            onBook={() => nextEvent && setSelected(nextEvent)}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <button onClick={() => router.push("/bookclub/events")}
              style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px",
                padding: "1rem", fontSize: "0.95rem", fontWeight: 600, color: "var(--text)", cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>📅 All Meetings</span>
              <span style={{ color: "var(--text-dim)" }}>›</span>
            </button>
            <button onClick={() => router.push("/bookclub/books")}
              style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px",
                padding: "1rem", fontSize: "0.95rem", fontWeight: 600, color: "var(--text)", cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>📖 Our Reading List</span>
              <span style={{ color: "var(--text-dim)" }}>›</span>
            </button>
          </div>
          <HistoryAccordion history={history} />
        </>
      )}
      {selected && (
        <EventSlideOut
          event={selected}
          onClose={() => setSelected(null)}
          onRefresh={handleRefresh}
        />
      )}
    </div>
  )
}
