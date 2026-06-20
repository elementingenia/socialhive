"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useUser } from "@/lib/UserContext"

const STATUS_STYLES = {
  confirmed:  { label: "Confirmed",  bg: "#dcfce7", color: "#166534" },
  waitlist:   { label: "Waitlisted", bg: "#fef9c3", color: "#854d0e" },
  cancelled:  { label: "Cancelled",  bg: "#fee2e2", color: "#991b1b" },
}

const HUB_COLOURS = {
  movie:    "var(--teal)",
  social:   "var(--terracotta)",
  outings:  "var(--green)",
  bookclub: "var(--purple)",
}

const HUB_ICONS = {
  movie: "🎬", social: "🎉", outings: "🚌", bookclub: "📚"
}

function BookingCard({ booking }) {
  const event = booking.events
  if (!event) return null

  const colour  = HUB_COLOURS[event.hub_type] || "var(--teal)"
  const icon    = HUB_ICONS[event.hub_type]   || "📅"
  const status  = STATUS_STYLES[booking.status] || STATUS_STYLES.confirmed
  const seats   = booking.seats || 1

  const dateObj = new Date(event.event_date + "T00:00:00")
  const today   = new Date(); today.setHours(0,0,0,0)
  const isPast  = dateObj < today

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const dateLabel  = dateObj.getDate() + " " + monthNames[dateObj.getMonth()] + " " + dateObj.getFullYear()

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "14px", padding: "1rem 1.25rem",
      borderLeft: "4px solid " + colour,
      opacity: isPast ? 0.65 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.25rem" }}>
            <span style={{ fontSize: "1rem" }}>{icon}</span>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {event.title}
            </div>
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
            {dateLabel}
            {event.event_time ? " · " + event.event_time.slice(0,5) : ""}
            {seats > 1 ? " · " + seats + " seats" : ""}
          </div>
        </div>
        <div style={{
          background: status.bg, color: status.color,
          fontSize: "0.7rem", fontWeight: 700, padding: "0.25rem 0.6rem",
          borderRadius: "20px", whiteSpace: "nowrap", flexShrink: 0,
        }}>
          {status.label}
        </div>
      </div>
    </div>
  )
}

function Section({ title, bookings, empty }) {
  return (
    <div style={{ marginBottom: "1.75rem" }}>
      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
        {title}
      </div>
      {bookings.length === 0 ? (
        <div style={{ background: "var(--surface)", borderRadius: "12px", padding: "1.25rem", border: "1px solid var(--border)", textAlign: "center", color: "var(--text-dim)", fontSize: "0.9rem" }}>
          {empty}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {bookings.map(b => <BookingCard key={b.id} booking={b} />)}
        </div>
      )}
    </div>
  )
}

export default function BookingsPage() {
  const { member } = useUser()
  const [bookings, setBookings] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!member?.id) return
    async function load() {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, events(id, title, event_date, event_time, hub_type)")
        .eq("member_id", member.id)
        .order("created_at", { ascending: false })

      if (!error) setBookings(data || [])
      setLoading(false)
    }
    load()
  }, [member?.id])

  const today    = new Date(); today.setHours(0,0,0,0)
  const upcoming = bookings.filter(b => b.events && new Date(b.events.event_date + "T00:00:00") >= today && b.status !== "cancelled")
  const past     = bookings.filter(b => b.events && new Date(b.events.event_date + "T00:00:00") < today)

  if (loading) {
    return (
      <div style={{ padding: "1.25rem 1rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: 72, borderRadius: "14px", background: "var(--surface2)" }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      <Section
        title={"Upcoming · " + upcoming.length}
        bookings={upcoming}
        empty="No upcoming bookings"
      />
      <Section
        title={"Past · " + past.length}
        bookings={past}
        empty="No past bookings yet"
      />
    </div>
  )
}
