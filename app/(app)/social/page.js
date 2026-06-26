"use client"
import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import EventSlideOut from "@/components/EventSlideOut"

// ── Helpers ───────────────────────────────────────────────────────────────────

function localDate(str) {
  if (!str) return null
  const [y, m, d] = str.split("-").map(Number)
  return new Date(y, m - 1, d)
}
function fmtDate(str) {
  if (!str) return ""
  return localDate(str).toLocaleDateString("en-AU", {
    weekday: "long", day: "numeric", month: "long",
  })
}
function fmtTime(str) {
  if (!str) return ""
  const [h, m] = str.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h >= 12 ? "pm" : "am"}`
}

// ── Welcome Banner (same pattern as Movies) ───────────────────────────────────
const WELCOME_KEY = "social_welcome_dismissed"

function WelcomeBanner({ text }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(WELCOME_KEY) === "1" } catch { return false }
  })

  if (!text) return null
  if (dismissed) {
    return (
      <button
        onClick={() => setDismissed(false)}
        style={{
          display: "flex", alignItems: "center", gap: 6, background: "none",
          border: "none", color: "var(--terracotta)", fontSize: "0.78rem",
          fontWeight: 600, cursor: "pointer", padding: "0 0 0.75rem", fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: "1rem" }}>ℹ</span> Show welcome message
      </button>
    )
  }
  return (
    <div style={{
      background: "var(--terracotta)14", border: "1px solid var(--terracotta)40",
      borderRadius: 14, padding: "0.9rem 1rem", marginBottom: "1rem", position: "relative",
    }}>
      <div style={{ fontSize: "0.88rem", lineHeight: 1.55, color: "var(--text)", paddingRight: "1.5rem" }}>
        {text}
      </div>
      <button
        onClick={() => {
          setDismissed(true)
          try { localStorage.setItem(WELCOME_KEY, "1") } catch {}
        }}
        style={{
          position: "absolute", top: 8, right: 10, background: "none", border: "none",
          color: "var(--text-dim)", fontSize: "1.1rem", cursor: "pointer", lineHeight: 1, padding: 4,
        }}
        aria-label="Dismiss"
      >×</button>
    </div>
  )
}

// ── Capacity Bar ──────────────────────────────────────────────────────────────
function CapacityBar({ booked, max, waitlist }) {
  if (!max || max <= 0) return null
  const pct    = Math.min(100, (booked / max) * 100)
  const left   = Math.max(0, max - booked)
  const colour = pct >= 85 ? "var(--danger)" : pct >= 55 ? "var(--amber)" : "var(--green)"
  return (
    <div style={{ marginBottom: "0.5rem" }}>
      <div style={{ height: 6, background: "var(--surface2)", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: colour, borderRadius: 4, minWidth: pct > 0 ? 4 : 0 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-dim)" }}>
        <span>
          {booked}/{max} seats{waitlist > 0 && ` · ${waitlist} waiting`}
        </span>
        <span style={{ color: left === 0 ? "var(--danger)" : colour, fontWeight: 600 }}>
          {left === 0 ? "Full" : `${left} left`}
        </span>
      </div>
    </div>
  )
}

// ── Next Event Tile ───────────────────────────────────────────────────────────
function NextEventTile({ event, coordinators, myBooking, bookedCount, waitlistCount, onOpen }) {
  if (!event) {
    return (
      <div style={{
        background: "var(--surface)", borderRadius: "16px",
        border: "1px solid var(--border)", padding: "1.75rem",
        textAlign: "center", marginBottom: "1.25rem",
      }}>
        <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🎉</div>
        <div style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>No upcoming social events yet</div>
      </div>
    )
  }

  const today     = new Date(); today.setHours(0, 0, 0, 0)
  const evDate    = localDate(event.event_date)
  const daysUntil = Math.round((evDate - today) / 86400000)
  const daysLabel = daysUntil === 0 ? "Today!" : daysUntil === 1 ? "Tomorrow" : `In ${daysUntil} days`

  const isConfirmed = myBooking?.status === "confirmed"
  const isPending   = isConfirmed && event.payment_required && myBooking?.payment_status === "pending"
  const isWaitlist  = myBooking?.status === "waitlist"
  const isBooked    = isConfirmed || isPending

  const ecNames = coordinators.map(c => c.members?.name || c.members?.username).filter(Boolean)

  return (
    <div
      onClick={onOpen}
      style={{
        background: "var(--surface)", borderRadius: "16px",
        border: "1px solid var(--border)", overflow: "hidden",
        boxShadow: "var(--shadow)", marginBottom: "1.25rem", cursor: "pointer",
      }}
    >
      {/* Coloured header bar */}
      <div style={{
        background: "var(--terracotta)", padding: "0.6rem 1rem",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}>Next Social Event</span>
        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.78rem", fontWeight: 600 }}>{daysLabel}</span>
      </div>

      <div style={{ padding: "0.9rem 1rem 1rem" }}>
        {/* Title + booking status */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.3rem" }}>
          <div style={{ fontWeight: 800, fontSize: "1.05rem", lineHeight: 1.2, flex: 1 }}>
            {event.title}
          </div>
          {isBooked && (
            <span style={{
              background: isPending ? "#fef3c7" : "#dcfce7",
              color: isPending ? "#92400e" : "#166534",
              borderRadius: "20px", padding: "0.2rem 0.6rem",
              fontSize: "0.7rem", fontWeight: 700, flexShrink: 0,
            }}>
              {isPending ? "⏳ Pending Payment" : "✓ Going!"}
            </span>
          )}
          {isWaitlist && (
            <span style={{
              background: "#f1f5f9", color: "#64748b",
              borderRadius: "20px", padding: "0.2rem 0.6rem",
              fontSize: "0.7rem", fontWeight: 700, flexShrink: 0,
            }}>
              Waitlisted
            </span>
          )}
        </div>

        {/* Date + time */}
        <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginBottom: "0.2rem" }}>
          {fmtDate(event.event_date)}{event.event_time ? ` · ${fmtTime(event.event_time)}` : ""}
        </div>

        {/* Coordinators */}
        {ecNames.length > 0 && (
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.2rem" }}>
            Coordinator{ecNames.length > 1 ? "s" : ""}: {ecNames.join(", ")}
          </div>
        )}

        {/* Bus driver */}
        {event.has_bus && event.bus_driver && (
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.2rem" }}>
            🚌 Bus driver: {event.bus_driver.name || event.bus_driver.username}
          </div>
        )}

        {/* Cost */}
        {event.payment_required && event.cost > 0 && (
          <div style={{
            display: "inline-block", fontSize: "0.75rem", fontWeight: 700,
            color: "var(--amber-dark)", background: "#fef3c720",
            border: "1px solid var(--amber)", borderRadius: "20px",
            padding: "0.15rem 0.55rem", marginBottom: "0.5rem",
          }}>
            ${Number(event.cost).toFixed(0)} per person
          </div>
        )}

        {/* Description */}
        {event.description && (
          <div style={{
            fontSize: "0.83rem", color: "var(--text-dim)",
            lineHeight: 1.5, marginBottom: "0.6rem",
          }}>
            {event.description}
          </div>
        )}

        {/* Capacity bar */}
        <CapacityBar booked={bookedCount} max={event.max_seats} waitlist={waitlistCount} />

        {/* Book CTA (if not already booked) */}
        {!isBooked && !isWaitlist && (
          <div style={{
            marginTop: "0.5rem",
            display: "inline-block",
            background: "var(--terracotta)", color: "#fff",
            borderRadius: "20px", padding: "0.35rem 1.1rem",
            fontSize: "0.82rem", fontWeight: 700,
          }}>
            Book Now ›
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SocialHome() {
  const router       = useRouter()
  const { member }   = useUser()
  const [loading,    setLoading]    = useState(true)
  const [welcomeText, setWelcomeText] = useState("")
  const [nextEvent,  setNextEvent]  = useState(null)
  const [coordinators, setCoordinators] = useState([])
  const [myBooking,  setMyBooking]  = useState(null)
  const [bookedCount,  setBookedCount]  = useState(0)
  const [waitlistCount, setWaitlistCount] = useState(0)
  const [selected,   setSelected]   = useState(null)
  const [fullEvent,  setFullEvent]  = useState(null)

  const load = useCallback(async () => {
    if (!member?.id) return
    fetch("/api/hub-settings")
      .then(r => r.json())
      .then(d => setWelcomeText(d.social?.text || ""))
      .catch(() => {})

    const today = new Date().toISOString().split("T")[0]
    const { data: events } = await supabase
      .from("events")
      .select("id, title, event_date, event_time, description, max_seats, cost, payment_required, has_bus, bus_driver_id, bus_driver:members!bus_driver_id(name, username)")
      .eq("hub_type", "social")
      .gte("event_date", today)
      .eq("archived", false)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true })
      .limit(1)

    const next = events?.[0] || null
    setNextEvent(next)

    if (next) {
      const [
        { data: ecs },
        { data: booking },
        { data: bookings },
      ] = await Promise.all([
        supabase
          .from("event_coordinators")
          .select("member_id, members(name, username)")
          .eq("event_id", next.id)
          .is("replaced_at", null)
          .order("assigned_at"),
        supabase
          .from("bookings")
          .select("id, status, seats, payment_status")
          .eq("event_id", next.id)
          .eq("member_id", member.id)
          .neq("status", "cancelled")
          .maybeSingle(),
        supabase
          .from("bookings")
          .select("status, seats")
          .eq("event_id", next.id),
      ])

      setCoordinators(ecs || [])
      setMyBooking(booking || null)

      const confirmed = (bookings || []).filter(b => b.status === "confirmed").reduce((s, b) => s + (b.seats || 1), 0)
      const waitlist  = (bookings || []).filter(b => b.status === "waitlist").length
      setBookedCount(confirmed)
      setWaitlistCount(waitlist)
    }

    setLoading(false)
  }, [member?.id])

  useEffect(() => { load() }, [load])

  async function handleOpen() {
    if (!nextEvent) return
    const { data } = await supabase
      .from("events")
      .select("*, bookings(id, status, seats, payment_status, member_id, members(name, username))")
      .eq("id", nextEvent.id)
      .single()
    if (data) setFullEvent(data)
  }

  if (loading) {
    return (
      <div style={{ padding: "1.25rem 1rem" }}>
        {[140, 56].map((h, i) => (
          <div key={i} style={{ height: h, borderRadius: "14px", background: "var(--surface2)", marginBottom: "0.75rem" }} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      <WelcomeBanner text={welcomeText} />

      <NextEventTile
        event={nextEvent}
        coordinators={coordinators}
        myBooking={myBooking}
        bookedCount={bookedCount}
        waitlistCount={waitlistCount}
        onOpen={handleOpen}
      />

      <button
        onClick={() => router.push("/social/events")}
        style={{
          width: "100%", background: "var(--surface)",
          border: "1px solid var(--border)", borderRadius: "14px",
          padding: "1rem", fontSize: "0.95rem", fontWeight: 600,
          color: "var(--text)", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          fontFamily: "inherit",
        }}
      >
        <span>📅 All Social Events</span>
        <span style={{ color: "var(--text-dim)" }}>›</span>
      </button>

      {fullEvent && (
        <EventSlideOut
          event={fullEvent}
          onClose={() => { setFullEvent(null) }}
          onRefresh={() => { setFullEvent(null); load() }}
        />
      )}
    </div>
  )
}
