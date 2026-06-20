"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"

const HUBS = [
  { key: "movies",   label: "Cinema",    icon: "🎬", path: "/movies",   colour: "var(--teal)" },
  { key: "social",   label: "Social",    icon: "🎉", path: "/social",   colour: "var(--terracotta)" },
  { key: "outings",  label: "Outings",   icon: "🚌", path: "/outings",  colour: "var(--green)" },
  { key: "bookclub", label: "Book Club", icon: "📚", path: "/bookclub", colour: "var(--purple)" },
]

function NoticeCard({ notice }) {
  const isMain = notice.type === "main"
  return (
    <div style={{
      background: isMain ? "var(--teal)" : "var(--surface)",
      color: isMain ? "#fff" : "var(--text)",
      borderRadius: "14px",
      padding: isMain ? "1.25rem 1.5rem" : "1rem 1.25rem",
      border: isMain ? "none" : "1px solid var(--border)",
      marginBottom: "0.75rem",
    }}>
      {isMain && (
        <div style={{ fontSize: "0.7rem", fontWeight: 700, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>
          Notice
        </div>
      )}
      <div style={{ fontSize: isMain ? "1rem" : "0.9rem", lineHeight: 1.5 }}>{notice.content}</div>
    </div>
  )
}

function NextEventCard({ event }) {
  const router = useRouter()
  if (!event) return null

  const colourMap = {
    movie: "var(--teal)",
    social: "var(--terracotta)",
    outings: "var(--green)",
    bookclub: "var(--purple)"
  }
  const colour = colourMap[event.hub_type] || "var(--teal)"

  const pathMap = {
    movie: "/screenings",
    social: "/social/events",
    outings: "/outings/events",
    bookclub: "/bookclub"
  }
  const hubPath = pathMap[event.hub_type] || "/screenings"

  const dateObj = new Date(event.event_date + "T00:00:00")
  const today = new Date(); today.setHours(0,0,0,0)
  const diffDays = Math.round((dateObj - today) / 86400000)
  const dayLabel = diffDays === 0 ? "Today" : diffDays === 1 ? "Tomorrow" : "In " + diffDays + " days"

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const dateLabel = dateObj.getDate() + " " + monthNames[dateObj.getMonth()]

  return (
    <div
      onClick={() => router.push(hubPath)}
      style={{
        background: colour, color: "#fff", borderRadius: "16px",
        padding: "1.25rem 1.5rem", marginBottom: "1rem", cursor: "pointer",
        boxShadow: "0 4px 16px " + colour.replace("var(", "").replace(")", "") + "40",
      }}
    >
      <div style={{ fontSize: "0.7rem", fontWeight: 700, opacity: 0.85, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.35rem" }}>
        Next Up
      </div>
      <div style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.25rem" }}>{event.title}</div>
      <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
        {dayLabel}{" · "}{dateLabel}
        {event.event_time ? " · " + event.event_time.slice(0,5) : ""}
      </div>
    </div>
  )
}

function HubTile({ hub }) {
  const router = useRouter()
  return (
    <button
      onClick={() => router.push(hub.path)}
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "16px", padding: "1.25rem 0.75rem",
        display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem",
        cursor: "pointer", width: "100%",
      }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: "50%",
        background: hub.colour + "20",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "1.5rem",
      }}>
        {hub.icon}
      </div>
      <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text)" }}>{hub.label}</div>
    </button>
  )
}

export default function HomePage() {
  const { member } = useUser()
  const [notices, setNotices]     = useState([])
  const [nextEvent, setNextEvent] = useState(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().split("T")[0]
      const now   = new Date().toISOString()

      const [{ data: noticesData }, { data: eventsData }] = await Promise.all([
        supabase
          .from("notices")
          .select("*")
          .eq("archived", false)
          .or("expires_at.is.null,expires_at.gt." + now)
          .order("type", { ascending: true })
          .order("created_at", { ascending: false }),

        supabase
          .from("events")
          .select("id, title, event_date, event_time, hub_type, image_url")
          .gte("event_date", today)
          .eq("archived", false)
          .order("event_date", { ascending: true })
          .order("event_time", { ascending: true })
          .limit(1),
      ])

      setNotices(noticesData || [])
      setNextEvent(eventsData?.[0] || null)
      setLoading(false)
    }
    load()
  }, [])

  const firstName = member?.name?.split(" ")[0] || "there"

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      {/* Wordmark */}
      <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <img
          src="/wordmark_final.png"
          alt="The Social Hive"
          style={{ maxHeight: 56, width: "auto", height: "auto", maxWidth: "65%" }}
        />
        <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
          {"Hey, " + firstName + " 👋"}
        </div>
      </div>

      {/* Notices */}
      {!loading && notices.length > 0 && (
        <div style={{ marginBottom: "1.25rem" }}>
          {notices.map(n => <NoticeCard key={n.id} notice={n} />)}
        </div>
      )}

      {/* No notices */}
      {!loading && notices.length === 0 && (
        <div style={{
          background: "var(--surface)", borderRadius: "14px", padding: "1rem 1.25rem",
          border: "1px solid var(--border)", marginBottom: "1.25rem",
          color: "var(--text-dim)", fontSize: "0.9rem", textAlign: "center"
        }}>
          No announcements right now
        </div>
      )}

      {/* Next Event */}
      {!loading && <NextEventCard event={nextEvent} />}

      {/* Hub tiles */}
      {!loading && (
        <div>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            Explore
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.6rem" }}>
            {HUBS.map(h => <HubTile key={h.key} hub={h} />)}
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[80, 56, 100].map((h, i) => (
            <div key={i} style={{ height: h, borderRadius: "14px", background: "var(--surface2)" }} />
          ))}
        </div>
      )}
    </div>
  )
}
