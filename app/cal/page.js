"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "@/lib/supabase"
import CalendarView from "@/components/CalendarView"
import EventSlideOut from "@/components/EventSlideOut"

export default function PublicCalendarPage() {
  const [events, setEvents]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(null)
  const [isAuthed, setIsAuthed] = useState(false)
  const loadRef = useRef(0)

  // Auth state is used ONLY for the header's "Go to App" vs "Sign In" link --
  // a convenience for a visitor who happens to already have a session. It
  // must never influence what the calendar itself shows or does (Iain,
  // 2026-08-04: the public page has to look and behave identically no
  // matter who's viewing it -- read-only, never bookable/editable, always
  // pointing to login). See the deliberately-unauthenticated fetch below and
  // the hardcoded isAuthenticated={false} on CalendarView/EventSlideOut.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthed(!!session)
    })
  }, [])

  const loadEvents = useCallback(async () => {
    const tag = ++loadRef.current
    setLoading(true)
    try {
      const from = new Date().toISOString().split("T")[0]
      const toDate = new Date(); toDate.setDate(toDate.getDate() + 90)
      const to = toDate.toISOString().split("T")[0]

      // Deliberately anonymous -- no Authorization header, even if this
      // browser has a real session. This is what makes is_public=false
      // filtering (app/api/events/route.js) and the "no personal booking
      // state on the public page" rule hold regardless of who's looking.
      const res = await fetch(`/api/events?from=${from}&to=${to}`)
      if (!res.ok) throw new Error("Failed to load events")
      const data = await res.json()
      if (tag === loadRef.current) setEvents(data)
    } catch (err) {
      console.error(err)
    } finally {
      if (tag === loadRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { loadEvents() }, [loadEvents])

  useEffect(() => {
    if (selected) {
      const updated = events.find(e => e.id === selected.id)
      if (updated) setSelected(updated)
    }
  }, [events])

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "DM Sans, sans-serif" }}>

      {/* Minimal public header */}
      <div style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/logo_hex_bee.png" alt="The Social Hive" style={{ width: 34, height: 34, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "var(--amber-dark)" }}>
              The Social Hive
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
              Fullerton Cove Events Calendar
            </div>
          </div>
        </div>
        {isAuthed ? (
          <a
            href="/home"
            style={{
              padding: "7px 14px",
              background: "var(--amber)",
              color: "#fff",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 13,
              textDecoration: "none",
            }}
          >Go to App</a>
        ) : (
          <a
            href="/login"
            style={{
              padding: "7px 14px",
              background: "var(--amber)",
              color: "#fff",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 13,
              textDecoration: "none",
            }}
          >Sign In</a>
        )}
      </div>

      {/* Calendar */}
      {loading && events.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, flexDirection: "column", gap: 12, color: "var(--text-dim)" }}>
          <div className="spinner" />
          <div style={{ fontSize: 14 }}>Loading events…</div>
        </div>
      ) : events.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, flexDirection: "column", gap: 8, color: "var(--text-dim)" }}>
          <div style={{ fontSize: 40 }}>📅</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>No upcoming events</div>
          <div style={{ fontSize: 13 }}>Check back soon</div>
        </div>
      ) : (
        <CalendarView events={events} onEventTap={setSelected} defaultView="month" />
      )}

      <EventSlideOut
        event={selected}
        onClose={() => setSelected(null)}
        isAuthenticated={false}
        onRefresh={loadEvents}
      />
    </div>
  )
}
