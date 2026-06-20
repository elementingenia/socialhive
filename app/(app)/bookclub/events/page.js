"use client"
import { useEffect, useState, useCallback } from "react"
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
  return localDate(str).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "long", year: "numeric" })
}
function fmtTime(str) {
  if (!str) return ""
  const [h, m] = str.split(":").map(Number)
  const ampm = h >= 12 ? "pm" : "am"
  return `${h % 12 || 12}:${String(m).padStart(2,"0")}${ampm}`
}
function fmtCost(cost) {
  if (!cost || cost === 0) return "Free"
  return "$" + parseFloat(cost).toFixed(2)
}

function CapacityBar({ booked, max, waitlist }) {
  const pct   = max > 0 ? Math.min(100, (booked / max) * 100) : 0
  const left  = Math.max(0, max - booked)
  const colour = pct >= 85 ? "var(--danger)" : pct >= 55 ? "var(--amber)" : "var(--green)"
  return (
    <div>
      <div style={{ height: 6, background: "var(--surface2)", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: colour, borderRadius: 4, minWidth: pct > 0 ? 4 : 0 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-dim)" }}>
        <span>{booked}/{max} seats{waitlist > 0 && ` · ${waitlist} waiting`}</span>
        <span style={{ color: left === 0 ? "var(--danger)" : colour, fontWeight: 600 }}>{left === 0 ? "Full" : left + " left"}</span>
      </div>
    </div>
  )
}

function EventCard({ event, myBooking, onClick }) {
  const today    = new Date(); today.setHours(0,0,0,0)
  const evDate   = localDate(event.event_date)
  const isPast   = evDate < today
  const daysUntil = Math.round((evDate - today) / 86400000)
  const daysLabel = isPast ? "" : daysUntil === 0 ? "Today!" : daysUntil === 1 ? "Tomorrow" : "In " + daysUntil + " days"

  const isBooked   = myBooking?.status === "confirmed"
  const isWaitlist = myBooking?.status === "waitlist"

  const confirmedSeats = event.bookings?.filter(b => b.status === "confirmed").reduce((s, b) => s + (b.seats||1), 0) || 0
  const waitlistCount  = event.bookings?.filter(b => b.status === "waitlist").length || 0

  return (
    <div
      onClick={onClick}
      style={{ background: "var(--surface)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden", cursor: "pointer", opacity: isPast ? 0.65 : 1 }}
    >
      {event.image_url && (
        <img src={event.image_url} alt={event.title} style={{ width: "100%", height: 120, objectFit: "cover" }} />
      )}
      <div style={{ padding: "0.9rem 1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.4rem" }}>
          <div style={{ fontWeight: 700, fontSize: "1rem", lineHeight: 1.2, flex: 1 }}>{event.title}</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.3rem", flexShrink: 0 }}>
            {isBooked && (
              <span style={{ background: "#dcfce7", color: "#15803d", borderRadius: "20px", padding: "0.2rem 0.55rem", fontSize: "0.7rem", fontWeight: 700 }}>✓ Going</span>
            )}
            {isWaitlist && (
              <span style={{ background: "#fef3c7", color: "#d97706", borderRadius: "20px", padding: "0.2rem 0.55rem", fontSize: "0.7rem", fontWeight: 700 }}>Waitlisted</span>
            )}
            {daysLabel && !isBooked && !isWaitlist && (
              <span style={{ background: "var(--purple)20", color: "var(--purple)", borderRadius: "20px", padding: "0.2rem 0.55rem", fontSize: "0.7rem", fontWeight: 700 }}>{daysLabel}</span>
            )}
          </div>
        </div>
        <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginBottom: "0.25rem" }}>{fmtDate(event.event_date)}</div>
        <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.82rem", color: "var(--text-dim)", marginBottom: "0.6rem" }}>
          {event.event_time && <span>{fmtTime(event.event_time)}</span>}
          {event.location && <span>📍 {event.location}</span>}
          <span style={{ color: event.cost ? "var(--amber-dark)" : "var(--green)", fontWeight: 600 }}>{fmtCost(event.cost)}</span>
        </div>
        {event.description && (
          <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, marginBottom: "0.6rem", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {event.description}
          </div>
        )}
        {event.max_seats > 0 && (
          <CapacityBar booked={confirmedSeats} max={event.max_seats} waitlist={waitlistCount} />
        )}
      </div>
    </div>
  )
}

export default function SocialEvents() {
  const { member } = useUser()
  const [events,    setEvents]   = useState([])
  const [bookings,  setBookings] = useState({})
  const [selected,  setSelected] = useState(null)
  const [loading,   setLoading]  = useState(true)
  const [showPast,  setShowPast] = useState(false)

  const load = useCallback(async () => {
    if (!member?.id) return
    const today = new Date().toISOString().split("T")[0]
    const query = supabase
      .from("events")
      .select("id, title, event_date, event_time, hub_type, location, description, image_url, max_seats, cost, bookings(id, status, seats)")
      .eq("hub_type", "bookclub")
      .eq("archived", false)
      .order("event_date", { ascending: true })

    if (!showPast) query.gte("event_date", today)

    const { data: eventsData } = await query

    const { data: myBookings } = await supabase
      .from("bookings")
      .select("id, event_id, status, seats")
      .eq("member_id", member.id)

    const byEvent = {}
    ;(myBookings || []).forEach(b => { byEvent[b.event_id] = b })

    setEvents(eventsData || [])
    setBookings(byEvent)
    setLoading(false)
  }, [member?.id, showPast])

  useEffect(() => { load() }, [load])

  const today = new Date(); today.setHours(0,0,0,0)
  const upcoming = events.filter(e => localDate(e.event_date) >= today)
  const past     = events.filter(e => localDate(e.event_date) < today)

  if (loading) return (
    <div style={{ padding: "1.25rem 1rem" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {[1,2,3].map(i => <div key={i} style={{ height: 120, borderRadius: "14px", background: "var(--surface2)" }} />)}
      </div>
    </div>
  )

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      {upcoming.length === 0 && (
        <div style={{ background: "var(--surface)", borderRadius: "14px", padding: "1.5rem", border: "1px solid var(--border)", textAlign: "center", marginBottom: "1.25rem" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📖</div>
          <div style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>No upcoming meetings</div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
          {upcoming.map(e => (
            <EventCard key={e.id} event={e} myBooking={bookings[e.id]} onClick={() => setSelected(e)} />
          ))}
        </div>
      )}

      {/* Past events toggle */}
      <button
        onClick={() => setShowPast(p => !p)}
        style={{ width: "100%", background: "none", border: "1px solid var(--border)", borderRadius: "12px", padding: "0.75rem", fontSize: "0.85rem", color: "var(--text-dim)", cursor: "pointer", marginBottom: "1rem" }}
      >
        {showPast ? "Hide past events" : "Show past events (" + past.length + ")"}
      </button>

      {showPast && past.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {past.map(e => (
            <EventCard key={e.id} event={e} myBooking={bookings[e.id]} onClick={() => setSelected(e)} />
          ))}
        </div>
      )}

      {selected && (
        <EventSlideOut
          event={selected}
          memberId={member?.id}
          onClose={() => setSelected(null)}
          onBooked={() => { setSelected(null); load() }}
        />
      )}
    </div>
  )
}
