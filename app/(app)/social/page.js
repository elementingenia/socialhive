"use client"
import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import EventSlideOut from "@/components/EventSlideOut"
import { BusIcon } from "@/components/NavIcons"

const COLOUR = "var(--terracotta)"

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

// ── Welcome Banner (matches Movies pattern exactly) ───────────────────────────
const WELCOME_KEY = "social_welcome_dismissed"

function WelcomeBanner({ text }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(WELCOME_KEY) === "1" } catch { return false }
  })
  if (!text) return null
  if (dismissed) {
    return (
      <button onClick={() => setDismissed(false)} style={{
        display: "flex", alignItems: "center", gap: 6,
        background: "none", border: "none", color: COLOUR,
        fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
        padding: "0 0 0.75rem", fontFamily: "inherit",
      }}>
        <span style={{ fontSize: "1rem" }}>ℹ</span> Show welcome message
      </button>
    )
  }
  return (
    <div style={{
      background: COLOUR, borderRadius: 14,
      padding: "0.9rem 1rem", marginBottom: "1rem",
      position: "relative",
    }}>
      <div style={{ fontSize: "0.88rem", lineHeight: 1.55, color: "#fff", paddingRight: "1.5rem" }}>
        {text}
      </div>
      <button onClick={() => {
        setDismissed(true)
        try { localStorage.setItem(WELCOME_KEY, "1") } catch {}
      }} style={{
        position: "absolute", top: 8, right: 10, background: "none", border: "none",
        color: "rgba(255,255,255,0.7)", fontSize: "1rem", cursor: "pointer", lineHeight: 1, padding: 4,
      }}>×</button>
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
    <div style={{ marginTop: "0.5rem" }}>
      <div style={{ height: 5, background: "var(--surface2)", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: colour, borderRadius: 4, minWidth: pct > 0 ? 4 : 0 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-dim)" }}>
        <span>{booked}/{max} seats{waitlist > 0 && ` · ${waitlist} waiting`}</span>
        <span style={{ color: left === 0 ? "var(--danger)" : colour, fontWeight: 600 }}>
          {left === 0 ? "Full" : `${left} left`}
        </span>
      </div>
    </div>
  )
}

// ── Next Event tile — surface card + terracotta header strip (matches Movies) ─
function NextEventTile({ event, coordinators, myBooking, bookedCount, waitlistCount, onOpen }) {
  if (!event) {
    return (
      <div style={{
        background: "var(--surface)", borderRadius: "16px",
        border: "1px solid var(--border)", overflow: "hidden",
        boxShadow: "var(--shadow)", marginBottom: "1.25rem",
      }}>
        <div style={{ background: COLOUR, padding: "0.6rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}>Next Social Event</span>
        </div>
        <div style={{ padding: "1.25rem 1rem", textAlign: "center" }}>
          <div style={{ fontSize: "1.8rem", marginBottom: "0.4rem" }}>🎉</div>
          <div style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>No upcoming events — check back soon</div>
        </div>
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
  const ecNames     = coordinators.map(c => c.name || c.username).filter(Boolean)

  return (
    <div onClick={onOpen} style={{
      background: "var(--surface)", borderRadius: "16px",
      border: "1px solid var(--border)", overflow: "hidden",
      boxShadow: "var(--shadow)", marginBottom: "1.25rem", cursor: "pointer",
    }}>
      {/* Coloured header strip */}
      <div style={{
        background: COLOUR, padding: "0.6rem 1rem",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}>Next Social Event</span>
        <span style={{ color: "rgba(255,255,255,0.9)", fontSize: "0.78rem", fontWeight: 600 }}>{daysLabel} ›</span>
      </div>

      {/* Content — white/surface background */}
      <div style={{ padding: "0.9rem 1rem" }}>
        <div style={{ fontWeight: 800, fontSize: "1.05rem", lineHeight: 1.2, marginBottom: "0.3rem" }}>
          {event.title}
        </div>

        <div style={{ fontSize: "0.8rem", color: COLOUR, fontWeight: 600, marginBottom: "0.2rem" }}>
          {fmtDate(event.event_date)}{event.event_time ? ` · ${fmtTime(event.event_time)}` : ""}
        </div>

        {event.location && (
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.2rem" }}>
            📍 {event.location_type === "offsite" ? event.location.split("\n")[0] : event.location}
          </div>
        )}

        {ecNames.length > 0 && (
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.2rem" }}>
            Coordinator{ecNames.length > 1 ? "s" : ""}: {ecNames.join(", ")}
          </div>
        )}

        {event.has_bus && event.bus_driver && (
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.2rem" }}>
            <BusIcon size={14} /> {event.bus_driver.name || event.bus_driver.username}
          </div>
        )}

        {event.payment_required && event.cost > 0 && (
          <div style={{
            display: "inline-block", marginBottom: "0.35rem",
            background: "rgba(180,120,0,0.1)", color: "var(--amber-dark)",
            borderRadius: "20px", padding: "0.15rem 0.55rem",
            fontSize: "0.72rem", fontWeight: 700,
          }}>${Number(event.cost).toFixed(0)} per person</div>
        )}

        {event.description && (
          <div style={{
            fontSize: "0.78rem", color: "var(--text-dim)", lineHeight: 1.45,
            marginBottom: "0.4rem",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{event.description}</div>
        )}

        <CapacityBar booked={bookedCount} max={event.max_seats} waitlist={waitlistCount} />

        {/* Booking status or CTA */}
        <div style={{ marginTop: "0.6rem" }}>
          {isConfirmed ? (() => {
            const seats = myBooking?.seats || 1
            const total = event.cost ? `$${(parseFloat(event.cost) * seats).toFixed(2)}` : null
            const label = isPending
              ? `${seats} seat${seats !== 1 ? "s" : ""} booked · Unpaid${total ? " " + total : ""}`
              : `✓ ${seats} seat${seats !== 1 ? "s" : ""} confirmed${total ? " · Paid " + total : ""}`
            return (
              <div style={{
                display: "inline-flex", alignItems: "center",
                background: isPending ? "#fef3c7" : "#dcfce7",
                color: isPending ? "#92400e" : "#15803d",
                borderRadius: "20px", padding: "0.25rem 0.75rem",
                fontSize: "0.78rem", fontWeight: 700,
              }}>{label}</div>
            )
          })() : isWaitlist ? (
            <div style={{
              display: "inline-flex", alignItems: "center",
              background: "var(--surface2)", color: "var(--text-dim)",
              borderRadius: "20px", padding: "0.25rem 0.75rem",
              fontSize: "0.78rem", fontWeight: 700,
            }}>⏳ You're on the waitlist</div>
          ) : (
            <div style={{
              display: "inline-flex", alignItems: "center",
              background: COLOUR + "18", color: COLOUR,
              borderRadius: "20px", padding: "0.25rem 0.75rem",
              fontSize: "0.78rem", fontWeight: 700,
            }}>Tap to book →</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── My Social Bookings tile — amber header (matches Movies pattern) ──────────
function MyBookingsCard({ bookings, onViewAll }) {
  const today    = new Date(); today.setHours(0, 0, 0, 0)
  const upcoming = bookings.filter(b =>
    b.status !== "cancelled" &&
    b.events?.hub_type === "social" &&
    localDate(b.events?.event_date) >= today
  )

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
        background: "var(--amber)", padding: "0.6rem 1rem",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}>My Bookings</span>
        <span style={{ color: "rgba(255,255,255,0.9)", fontSize: "0.78rem", fontWeight: 600 }}>View all ›</span>
      </div>
      {sorted.length === 0 ? (
        <div style={{ padding: "1.25rem 1rem", textAlign: "center", color: "var(--text-dim)", fontSize: "0.88rem" }}>
          You have no upcoming bookings.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {sorted.slice(0, 3).map(({ events: ev, status, seats, payment_status }, i) => {
            const isPending = status === "confirmed" && ev?.payment_required && payment_status === "pending"
            const isWait    = status === "waitlist"
            const n         = seats || 1
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
                  <div style={{ fontSize: "0.78rem", color: COLOUR, fontWeight: 600, marginTop: "0.1rem" }}>
                    {fmtDate(ev?.event_date)}{ev?.event_time ? ` · ${fmtTime(ev.event_time)}` : ""}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {isWait ? (
                    <span style={{ background: "var(--surface2)", color: "var(--text-dim)", borderRadius: "20px", padding: "0.2rem 0.65rem", fontSize: "0.75rem", fontWeight: 700 }}>
                      ⏳ Waitlisted
                    </span>
                  ) : isPending ? (
                    <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: "20px", padding: "0.2rem 0.65rem", fontSize: "0.75rem", fontWeight: 700 }}>
                      {n} seat{n !== 1 ? "s" : ""} · Unpaid{ev?.cost ? ` $${(parseFloat(ev.cost) * n).toFixed(2)}` : ""}
                    </span>
                  ) : (
                    <span style={{ background: "#dcfce7", color: "#15803d", borderRadius: "20px", padding: "0.2rem 0.65rem", fontSize: "0.75rem", fontWeight: 700 }}>
                      ✓ {n} seat{n !== 1 ? "s" : ""}{ev?.payment_required ? " · Paid" : ""}
                    </span>
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

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SocialHome() {
  const { member }          = useUser()
  const router              = useRouter()
  const [nextEvent,         setNextEvent]         = useState(undefined) // undefined = loading, null = none
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

    const [eventsRes, myBookingsRes, hubRes] = await Promise.all([
      supabase
        .from("events")
        .select("id, title, event_date, event_time, description, max_seats, cost, payment_required, has_bus, location_type, location, bus_driver:members!bus_driver_id(name, username), bookings(id, status, seats, payment_status, member_id)")
        .eq("hub_type", "social").eq("archived", false)
        .gte("event_date", todayStr)
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true })
        .limit(1),
      supabase
        .from("bookings")
        .select("id, event_id, status, seats, payment_status, events(id, title, event_date, event_time, hub_type, payment_required, location_type, location)")
        .eq("member_id", member.id)
        .neq("status", "cancelled"),
      supabase.from("hub_settings").select("welcome_text").eq("hub_type", "social").single(),
    ])

    const ev = eventsRes.data?.[0] || null
    setNextEvent(ev)

    if (ev) {
      const confirmed = ev.bookings?.filter(b => b.status === "confirmed") || []
      setBookedCount(confirmed.reduce((s, b) => s + (b.seats || 1), 0))
      setWaitlistCount(ev.bookings?.filter(b => b.status === "waitlist").length || 0)
      setMyBooking(ev.bookings?.find(b => b.member_id === member.id && b.status !== "cancelled") || null)

      const { data: ecs } = await supabase
        .from("event_coordinators")
        .select("member_id, members(name, username)")
        .eq("event_id", ev.id).is("replaced_at", null).order("assigned_at")
      setNextCoordinators((ecs || []).map(ec => ec.members))
    }

    setMyAllBookings((myBookingsRes.data || []).filter(b => b.events))
    setWelcomeText(hubRes.data?.welcome_text || "")
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

      <MyBookingsCard bookings={myAllBookings} onViewAll={() => router.push("/social/events")} />

      {fullEvent && (
        <EventSlideOut event={fullEvent} onClose={() => setFullEvent(null)}
          onRefresh={() => { setFullEvent(null); load() }} />
      )}
    </div>
  )
}
