"use client"
import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import EventSlideOut from "@/components/EventSlideOut"

const HUB_COLOURS = {
  movie:    "var(--teal)",
  bookclub: "var(--purple)",
  social:   "var(--terracotta)",
}

const HUB_LABELS = {
  movie: "Movies", bookclub: "Book Club", social: "Social",
}

const FILTERS = [
  { key: "all",      label: "All" },
  { key: "movie",    label: "Movies" },
  { key: "bookclub", label: "Book Club" },
  { key: "social",   label: "Social" },
]

// Derive display status from booking record
function getStatus(booking) {
  if (booking.status === "waitlist") {
    return { label: "Waitlisted", bg: "#f1f5f9", color: "#64748b" }
  }
  if (booking.payment_status === "pending") {
    return { label: "Pending Payment", bg: "#fef3c7", color: "#92400e" }
  }
  return { label: "Confirmed", bg: "#dcfce7", color: "#166534" }
}

function fmtDate(str) {
  if (!str) return ""
  const [y, m, d] = str.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  })
}

function fmtTime(t) {
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  const ampm = h >= 12 ? "pm" : "am"
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${ampm}`
}

// BookingCard accepts a grouped entry: { event, confirmed, waitlist, eventId }
function BookingCard({ group, waitlistPosition, onClick }) {
  const event = group.event
  if (!event) return null

  const colour     = HUB_COLOURS[event.hub_type] || "var(--teal)"
  const hubLabel   = HUB_LABELS[event.hub_type]  || event.hub_type
  const isBookClub = event.hub_type === "bookclub"
  const { confirmed, waitlist } = group

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onClick()}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderLeft: "4px solid " + colour,
        borderRadius: "14px",
        padding: "0.9rem 1.1rem",
        cursor: "pointer",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "0.75rem",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: "0.68rem", fontWeight: 700, color: colour,
          textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.2rem",
        }}>
          {hubLabel}
        </div>
        <div style={{
          fontSize: "0.98rem", fontWeight: 700, color: "var(--text)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          marginBottom: "0.22rem",
        }}>
          {event.title}
        </div>
        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
          {fmtDate(event.event_date)}
          {event.event_time ? " · " + fmtTime(event.event_time) : ""}
          {!isBookClub && confirmed > 1 ? " · " + confirmed + " seats" : ""}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", flexShrink: 0, alignItems: "flex-end" }}>
        {confirmed > 0 && (
          <div style={{
            background: "#dcfce7", color: "#166534",
            fontSize: "0.7rem", fontWeight: 700,
            padding: "0.25rem 0.65rem", borderRadius: "20px", whiteSpace: "nowrap",
          }}>
            {confirmed === 1 ? "Confirmed" : `✓ ${confirmed} confirmed`}
          </div>
        )}
        {waitlist > 0 && (
          <div style={{
            background: "#fef3c7", color: "#d97706",
            fontSize: "0.7rem", fontWeight: 700,
            padding: "0.25rem 0.65rem", borderRadius: "20px", whiteSpace: "nowrap",
          }}>
            {`⏳ ${waitlist} waitlisted${waitlistPosition ? ` (#${waitlistPosition})` : ''}`}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{
      textAlign: "center",
      padding: "3.5rem 1.5rem",
      color: "var(--text-dim)",
    }}>
      <div style={{ fontSize: "2.25rem", marginBottom: "0.75rem" }}>📅</div>
      <div style={{
        fontWeight: 700, color: "var(--text)",
        fontSize: "1.05rem", marginBottom: "0.5rem",
      }}>
        Nothing booked yet
      </div>
      <div style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>
        Head to Events to see what's coming up and grab a spot.
      </div>
    </div>
  )
}

export default function BookingsPage() {
  const { member }    = useUser()
  const [bookings,    setBookings]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [filter,      setFilter]      = useState("all")
  const [pastOpen,    setPastOpen]    = useState(false)
  const [selectedEvent,    setSelectedEvent]    = useState(null)
  const [loadingEvent,     setLoadingEvent]     = useState(false)
  const [waitlistPositions, setWaitlistPositions] = useState({})

  const load = useCallback(async () => {
    if (!member?.id) return
    const { data } = await supabase
      .from("bookings")
      .select("id, status, seats, payment_status, booked_at, event_id, events(id, title, event_date, event_time, hub_type)")
      .eq("member_id", member.id)
      .neq("status", "cancelled")

    setBookings(data || [])
    setLoading(false)
  }, [member?.id])

  useEffect(() => { load() }, [load])

  // Batch-fetch waitlist positions whenever bookings change
  useEffect(() => {
    const waitlisted = bookings.filter(b => b.status === "waitlist" && b.booked_at)
    if (waitlisted.length === 0) { setWaitlistPositions({}); return }
    Promise.all(
      waitlisted.map(b =>
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("event_id", b.event_id)
          .eq("status", "waitlist")
          .lt("booked_at", b.booked_at)
          .then(({ count }) => [b.event_id, (count ?? 0) + 1])
      )
    ).then(results => setWaitlistPositions(Object.fromEntries(results)))
  }, [bookings])

  async function openBooking(booking) {
    setLoadingEvent(true)
    const { data } = await supabase
      .from("events")
      .select("*, bookings(id, status, seats, payment_status, member_id, members(name, username))")
      .eq("id", booking.event_id)
      .single()
    setLoadingEvent(false)
    if (data) setSelectedEvent(data)
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)

  const filtered = filter === "all"
    ? bookings
    : bookings.filter(b => b.events?.hub_type === filter)

  // Group by event_id so split bookings (confirmed + waitlist) show as one tile
  function groupBookings(rows) {
    const grouped = {}
    for (const b of rows) {
      if (!b.events) continue
      if (!grouped[b.event_id]) grouped[b.event_id] = { event: b.events, eventId: b.event_id, confirmed: 0, waitlist: 0 }
      if (b.status === "waitlist") grouped[b.event_id].waitlist += (b.seats || 1)
      else grouped[b.event_id].confirmed += (b.seats || 1)
    }
    return Object.values(grouped)
  }

  const upcoming = groupBookings(
    filtered.filter(b => b.events && new Date(b.events.event_date + "T00:00:00") >= today)
  ).sort((a, b) => a.event.event_date.localeCompare(b.event.event_date))

  // Exclude waitlist-only from past (no seat was held)
  const past = groupBookings(
    filtered.filter(b => b.events && new Date(b.events.event_date + "T00:00:00") < today && b.status !== "waitlist")
  ).sort((a, b) => b.event.event_date.localeCompare(a.event.event_date))

  if (loading) {
    return (
      <div style={{ padding: "1.25rem 1rem" }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            height: 76, borderRadius: 14,
            background: "var(--surface2)", marginBottom: "0.6rem",
          }} />
        ))}
      </div>
    )
  }

  const noBookings = upcoming.length === 0 && past.length === 0

  return (
    <>
      <div style={{ padding: "1rem 1rem 6rem" }}>

        {/* Filter strip */}
        <div style={{
          display: "flex", gap: "0.4rem",
          marginBottom: "1.25rem",
          overflowX: "auto", paddingBottom: 2,
        }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: "0.45rem 1.05rem",
                borderRadius: "20px",
                border: "1px solid var(--border)",
                background: filter === f.key ? "var(--teal)" : "var(--surface)",
                color: filter === f.key ? "#fff" : "var(--text-dim)",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontFamily: "inherit",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Upcoming */}
        {noBookings ? (
          <EmptyState />
        ) : upcoming.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "2rem 1rem",
            color: "var(--text-dim)", fontSize: "0.9rem",
          }}>
            No upcoming bookings
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1.5rem" }}>
            {upcoming.map(g => (
              <BookingCard key={g.eventId} group={g} waitlistPosition={waitlistPositions[g.eventId]} onClick={() => openBooking({ event_id: g.eventId, events: g.event })} />
            ))}
          </div>
        )}

        {/* Past events accordion */}
        {past.length > 0 && (
          <div style={{ marginTop: noBookings ? 0 : "0.5rem" }}>
            <button
              onClick={() => setPastOpen(v => !v)}
              style={{
                width: "100%",
                padding: "0.75rem 1.1rem",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: pastOpen ? "14px 14px 0 0" : "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "0.85rem",
                fontWeight: 700,
                color: "var(--text-dim)",
              }}
            >
              <span>Past Events</span>
              <span style={{
                fontSize: "0.7rem",
                display: "inline-block",
                transform: pastOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}>▼</span>
            </button>
            {pastOpen && (
              <div style={{
                border: "1px solid var(--border)",
                borderTop: "none",
                borderRadius: "0 0 14px 14px",
                overflow: "hidden",
              }}>
                {past.map((g, i) => (
                  <div
                    key={g.eventId}
                    style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none", opacity: 0.7 }}
                  >
                    <BookingCard group={g} waitlistPosition={waitlistPositions[g.eventId]} onClick={() => openBooking({ event_id: g.eventId, events: g.event })} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Spinner overlay while fetching full event for slide-out */}
      {loadingEvent && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.25)", zIndex: 299,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "var(--surface)", borderRadius: 14,
            padding: "1rem 1.5rem", fontSize: "0.9rem",
            color: "var(--text-dim)", fontWeight: 600,
          }}>
            Loading…
          </div>
        </div>
      )}

      {selectedEvent && (
        <EventSlideOut
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onRefresh={load}
        />
      )}
    </>
  )
}
