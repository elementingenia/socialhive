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
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })
}
function fmtTime(str) {
  if (!str) return ""
  const [h, m] = str.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h >= 12 ? "pm" : "am"}`
}

// ── Welcome Banner ────────────────────────────────────────────────────────────
const WELCOME_KEY = "social_welcome_dismissed"

function WelcomeBanner({ text }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(WELCOME_KEY) === "1" } catch { return false }
  })
  if (!text) return null
  if (dismissed) {
    return (
      <button onClick={() => setDismissed(false)} style={{
        width: "100%", background: "none", border: "none", cursor: "pointer",
        color: "var(--terracotta)", fontSize: "0.78rem", fontWeight: 600,
        textAlign: "left", padding: "0.25rem 0", marginBottom: "0.75rem",
        fontFamily: "inherit",
      }}>▼ Show welcome message</button>
    )
  }
  return (
    <div style={{
      background: "var(--terracotta)", borderRadius: "14px",
      padding: "1rem 1.1rem", marginBottom: "1rem", position: "relative",
    }}>
      <button onClick={() => {
        setDismissed(true)
        try { localStorage.setItem(WELCOME_KEY, "1") } catch {}
      }} style={{
        position: "absolute", top: "0.6rem", right: "0.75rem",
        background: "rgba(255,255,255,0.25)", border: "none", borderRadius: "50%",
        width: 24, height: 24, cursor: "pointer", color: "#fff",
        fontSize: "0.85rem", display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "inherit",
      }}>×</button>
      <p style={{ color: "#fff", margin: 0, fontSize: "0.92rem", lineHeight: 1.55, paddingRight: "1.5rem" }}>
        {text}
      </p>
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
    <div style={{ marginTop: "0.6rem" }}>
      <div style={{ height: 6, background: "rgba(255,255,255,0.25)", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "#fff", borderRadius: 4, opacity: 0.85, minWidth: pct > 0 ? 4 : 0 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "rgba(255,255,255,0.8)" }}>
        <span>{booked}/{max} seats{waitlist > 0 && ` · ${waitlist} waiting`}</span>
        <span style={{ fontWeight: 600 }}>{left === 0 ? "Full" : `${left} left`}</span>
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
        border: "1px solid var(--border)", padding: "1.5rem",
        textAlign: "center", marginBottom: "1.25rem",
      }}>
        <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🎉</div>
        <div style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>No upcoming social events</div>
      </div>
    )
  }

  const isConfirmed = myBooking?.status === "confirmed"
  const isPending   = isConfirmed && event.payment_required && myBooking?.payment_status === "pending"
  const isWaitlist  = myBooking?.status === "waitlist"
  const ecNames     = coordinators.map(c => c.name || c.username).filter(Boolean)

  return (
    <div onClick={onOpen} style={{
      background: "var(--terracotta)", borderRadius: "16px",
      padding: "1.1rem 1.15rem", marginBottom: "1.25rem",
      boxShadow: "var(--shadow)", cursor: "pointer", position: "relative",
    }}>
      {/* Status pill */}
      {(isConfirmed || isWaitlist) && (
        <div style={{ position: "absolute", top: "0.75rem", right: "0.75rem" }}>
          <span style={{
            background: isWaitlist ? "rgba(255,255,255,0.2)" : (isPending ? "#fef3c7" : "rgba(255,255,255,0.95)"),
            color: isWaitlist ? "#fff" : (isPending ? "#92400e" : "var(--terracotta)"),
            borderRadius: "20px", padding: "0.25rem 0.65rem",
            fontSize: "0.72rem", fontWeight: 700,
          }}>
            {isWaitlist ? "Waitlisted" : isPending ? "⏳ Pending" : "✓ Going"}
          </span>
        </div>
      )}

      <div style={{ color: "#fff", fontWeight: 700, fontSize: "1.05rem", marginBottom: "0.3rem", paddingRight: "5rem" }}>
        {event.title}
      </div>
      <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.82rem", marginBottom: "0.15rem" }}>
        {fmtDate(event.event_date)}{event.event_time ? ` · ${fmtTime(event.event_time)}` : ""}
      </div>

      {/* Location */}
      {event.location && (
        <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.78rem", marginBottom: "0.15rem" }}>
          📍 {event.location_type === "offsite" ? event.location.split("\n")[0] : event.location}
        </div>
      )}

      {/* EC names */}
      {ecNames.length > 0 && (
        <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.78rem", marginBottom: "0.15rem" }}>
          Coordinator{ecNames.length > 1 ? "s" : ""}: {ecNames.join(", ")}
        </div>
      )}

      {/* Bus driver */}
      {event.has_bus && event.bus_driver && (
        <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.78rem", marginBottom: "0.15rem" }}>
          🚌 {event.bus_driver.name || event.bus_driver.username}
        </div>
      )}

      {/* Cost pill */}
      {event.payment_required && event.cost > 0 && (
        <div style={{
          display: "inline-block", marginTop: "0.3rem",
          background: "rgba(255,255,255,0.2)", borderRadius: "20px",
          padding: "0.15rem 0.55rem", fontSize: "0.72rem", fontWeight: 700, color: "#fff",
          marginBottom: "0.3rem",
        }}>${Number(event.cost).toFixed(0)} per person</div>
      )}

      {/* Description */}
      {event.description && (
        <div style={{
          color: "rgba(255,255,255,0.8)", fontSize: "0.82rem", lineHeight: 1.5,
          marginTop: "0.4rem", marginBottom: "0.4rem",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>{event.description}</div>
      )}

      <CapacityBar booked={bookedCount} max={event.max_seats} waitlist={waitlistCount} />

      {!isConfirmed && !isWaitlist && (
        <div style={{
          marginTop: "0.75rem", textAlign: "right",
          color: "rgba(255,255,255,0.9)", fontSize: "0.85rem", fontWeight: 700,
        }}>Book Now ›</div>
      )}
    </div>
  )
}

// ── My Social Bookings tile ───────────────────────────────────────────────────
function MyBookingsCard({ bookings, onViewAll }) {
  const today    = new Date(); today.setHours(0, 0, 0, 0)
  const upcoming = bookings.filter(b =>
    b.status !== "cancelled" &&
    b.events?.hub_type === "social" &&
    localDate(b.events?.event_date) >= today
  )

  if (!upcoming.length) return null

  const sorted = [...upcoming].sort((a, b) =>
    localDate(a.events?.event_date) - localDate(b.events?.event_date)
  )

  return (
    <div onClick={onViewAll} style={{
      background: "var(--surface)", borderRadius: "16px",
      border: "1px solid var(--border)", overflow: "hidden",
      boxShadow: "var(--shadow)", marginBottom: "1.25rem", cursor: "pointer",
    }}>
      <div style={{
        background: "var(--terracotta)", padding: "0.6rem 1rem",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}>My Bookings</span>
        <span style={{ color: "rgba(255,255,255,0.9)", fontSize: "0.78rem", fontWeight: 600 }}>View all ›</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {sorted.slice(0, 3).map(({ events: ev, status, seats, payment_status }, i) => {
          const isPending = status === "confirmed" && ev?.payment_required && payment_status === "pending"
          const isWait    = status === "waitlist"
          return (
            <div key={ev?.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: "0.75rem", padding: "0.75rem 1rem",
              borderTop: i > 0 ? "1px solid var(--border)" : "none",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "0.88rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {ev?.title || "Event"}
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: "0.15rem" }}>
                  {fmtDate(ev?.event_date)}{ev?.event_time ? ` · ${fmtTime(ev.event_time)}` : ""}
                </div>
                {ev?.location && (
                  <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                    📍 {ev.location_type === "offsite" ? ev.location.split("\n")[0] : ev.location}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                {!isWait && (
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: isPending ? "var(--amber-dark)" : "var(--terracotta)" }}>
                    {isPending ? "⏳ Pending" : `✓ ${seats || 1} seat${(seats || 1) !== 1 ? "s" : ""}`}
                  </div>
                )}
                {isWait && <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-dim)" }}>⏳ Waitlisted</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SocialHome() {
  const { member }          = useUser()
  const router              = useRouter()
  const [nextEvent,         setNextEvent]         = useState(null)
  const [nextCoordinators,  setNextCoordinators]  = useState([])
  const [myBooking,         setMyBooking]         = useState(null)
  const [bookedCount,       setBookedCount]       = useState(0)
  const [waitlistCount,     setWaitlistCount]     = useState(0)
  const [myAllBookings,     setMyAllBookings]     = useState([])
  const [welcomeText,       setWelcomeText]       = useState("")
  const [fullEvent,         setFullEvent]         = useState(null)
  const [loading,           setLoading]           = useState(true)

  const load = useCallback(async () => {
    if (!member?.id) return
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().slice(0, 10)

    // Next upcoming social event
    const { data: events } = await supabase
      .from("events")
      .select("id, title, event_date, event_time, description, welcome_message, max_seats, max_seats_per_booking, cost, payment_required, show_attendee_names, is_public, has_bus, bus_driver_id, location_type, location, bus_driver:members!bus_driver_id(name, username), bookings(id, status, seats, payment_status, member_id)")
      .eq("hub_type", "social")
      .eq("archived", false)
      .gte("event_date", todayStr)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true })
      .limit(1)

    const ev = events?.[0] || null
    setNextEvent(ev)

    if (ev) {
      const confirmed = ev.bookings?.filter(b => b.status === "confirmed")
      setBookedCount(confirmed?.reduce((s, b) => s + (b.seats || 1), 0) || 0)
      setWaitlistCount(ev.bookings?.filter(b => b.status === "waitlist").length || 0)
      setMyBooking(ev.bookings?.find(b => b.member_id === member.id && b.status !== "cancelled") || null)

      // Coordinators for next event
      const { data: ecs } = await supabase
        .from("event_coordinators")
        .select("member_id, members(name, username)")
        .eq("event_id", ev.id).is("replaced_at", null).order("assigned_at")
      setNextCoordinators((ecs || []).map(ec => ec.members))
    }

    // My upcoming social bookings (for My Bookings tile)
    const { data: myBookings } = await supabase
      .from("bookings")
      .select("id, event_id, status, seats, payment_status, events(id, title, event_date, event_time, hub_type, payment_required, location_type, location)")
      .eq("member_id", member.id)
      .neq("status", "cancelled")
      .gte("events.event_date", todayStr)
    setMyAllBookings((myBookings || []).filter(b => b.events))

    // Hub settings welcome text
    const { data: hs } = await supabase
      .from("hub_settings").select("welcome_text").eq("hub_type", "social").single()
    setWelcomeText(hs?.welcome_text || "")

    setLoading(false)
  }, [member?.id])

  useEffect(() => { load() }, [load])

  async function openEventSlideOut(event) {
    const { data } = await supabase
      .from("events")
      .select("*, bookings(id, status, seats, payment_status, member_id, members(name, username))")
      .eq("id", event.id).single()
    if (data) setFullEvent(data)
  }

  if (loading) {
    return (
      <div style={{ padding: "1.25rem 1rem" }}>
        {[1, 2].map(i => (
          <div key={i} style={{ height: 140, borderRadius: "16px", background: "var(--surface2)", marginBottom: "1rem" }} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      <WelcomeBanner text={welcomeText} />

      <NextEventTile
        event={nextEvent}
        coordinators={nextCoordinators}
        myBooking={myBooking}
        bookedCount={bookedCount}
        waitlistCount={waitlistCount}
        onOpen={() => nextEvent && openEventSlideOut(nextEvent)}
      />

      <MyBookingsCard bookings={myAllBookings} onViewAll={() => router.push("/bookings")} />

      {fullEvent && (
        <EventSlideOut event={fullEvent} onClose={() => setFullEvent(null)}
          onRefresh={() => { setFullEvent(null); load() }} />
      )}
    </div>
  )
}
