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

function NextEventCard({ event, myBooking, onBook }) {
  if (!event) return (
    <div style={{ background: "var(--surface)", borderRadius: "16px", border: "1px solid var(--border)", padding: "1.5rem", textAlign: "center", marginBottom: "1.25rem" }}>
      <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🎉</div>
      <div style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>No upcoming social events yet</div>
    </div>
  )

  const today = new Date(); today.setHours(0,0,0,0)
  const evDate = localDate(event.event_date)
  const daysUntil = Math.round((evDate - today) / 86400000)
  const daysLabel = daysUntil === 0 ? "Today!" : daysUntil === 1 ? "Tomorrow" : "In " + daysUntil + " days"
  const isBooked   = myBooking?.status === "confirmed"
  const isWaitlist = myBooking?.status === "waitlist"

  return (
    <div style={{ background: "var(--surface)", borderRadius: "16px", border: "1px solid var(--border)", overflow: "hidden", boxShadow: "var(--shadow)", marginBottom: "1.25rem" }}>
      <div style={{ background: "var(--terracotta)", padding: "0.6rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}>Next Social Event</span>
        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.78rem", fontWeight: 600 }}>{daysLabel}</span>
      </div>
      {event.image_url && (
        <img src={event.image_url} alt={event.title} style={{ width: "100%", height: 140, objectFit: "cover" }} />
      )}
      <div style={{ padding: "0.9rem 1rem" }}>
        <div style={{ fontWeight: 800, fontSize: "1.05rem", lineHeight: 1.2, marginBottom: "0.3rem" }}>{event.title}</div>
        <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginBottom: "0.2rem" }}>{fmtDate(event.event_date)}</div>
        <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginBottom: "0.75rem" }}>
          {fmtTime(event.event_time)}{event.location ? " · " + event.location : ""}
        </div>
        {isBooked ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "#dcfce7", color: "#15803d", borderRadius: "20px", padding: "0.25rem 0.75rem", fontSize: "0.78rem", fontWeight: 700 }}>
            ✓ You're going!
          </div>
        ) : isWaitlist ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "#fef3c7", color: "#d97706", borderRadius: "20px", padding: "0.25rem 0.75rem", fontSize: "0.78rem", fontWeight: 700 }}>
            On waitlist
          </div>
        ) : (
          <button onClick={onBook} style={{ background: "var(--terracotta)", color: "#fff", border: "none", borderRadius: "20px", padding: "0.35rem 1rem", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}>
            Book Now
          </button>
        )}
      </div>
      {event.description && (
        <div style={{ padding: "0.65rem 1rem", borderTop: "1px solid var(--border)", fontSize: "0.83rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
          {event.description}
        </div>
      )}
    </div>
  )
}

export default function SocialHome() {
  const router         = useRouter()
  const { member }     = useUser()
  const [nextEvent, setNextEvent] = useState(null)
  const [myBooking, setMyBooking] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState(null)

  useEffect(() => {
    if (!member?.id) return
    async function load() {
      const today = new Date().toISOString().split("T")[0]
      const { data: events } = await supabase
        .from("events")
        .select("id, title, event_date, event_time, hub_type, location, description, image_url, max_seats, cost")
        .eq("hub_type", "social")
        .gte("event_date", today)
        .eq("archived", false)
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true })
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

      setLoading(false)
    }
    load()
  }, [member?.id])

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[140, 56].map((h, i) => <div key={i} style={{ height: h, borderRadius: "14px", background: "var(--surface2)" }} />)}
        </div>
      ) : (
        <>
          <NextEventCard
            event={nextEvent}
            myBooking={myBooking}
            onBook={() => nextEvent && setSelected(nextEvent)}
          />
          <button
            onClick={() => router.push("/social/events")}
            style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "1rem", fontSize: "0.95rem", fontWeight: 600, color: "var(--text)", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <span>📅 All Social Events</span>
            <span style={{ color: "var(--text-dim)" }}>›</span>
          </button>
        </>
      )}
      {selected && (
        <EventSlideOut
          event={selected}
          onClose={() => { setSelected(null) }}
          onRefresh={() => { setSelected(null); window.location.reload() }}
        />
      )}
    </div>
  )
}
