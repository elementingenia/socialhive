"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "@/lib/supabase"
import CalendarView from "@/components/CalendarView"
import EventSlideOut from "@/components/EventSlideOut"
import SpaceBookingForm from "@/components/SpaceBookingForm"

export default function CalendarPage() {
  const [events, setEvents]   = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [bookingSpace, setBookingSpace] = useState(false)
  const loadRef = useRef(0)

  const loadEvents = useCallback(async () => {
    const tag = ++loadRef.current
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      // Load 90 days of events
      const from = new Date().toISOString().split("T")[0]
      const toDate = new Date(); toDate.setDate(toDate.getDate() + 90)
      const to = toDate.toISOString().split("T")[0]

      const res = await fetch(`/api/events?from=${from}&to=${to}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
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

  function handleEventTap(event) {
    // Refresh the tapped event's booking data from the loaded list
    setSelected(event)
  }

  function handleRefresh() {
    loadEvents().then(() => {
      // Re-select the updated event after refresh
      if (selected) {
        setSelected(prev => events.find(e => e.id === prev?.id) || prev)
      }
    })
  }

  // After events reload, update selected if it's open
  useEffect(() => {
    if (selected) {
      const updated = events.find(e => e.id === selected.id)
      if (updated) setSelected(updated)
    }
  }, [events])

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Book a Space — independent of every hub/club (Iain, 2026-08-01).
          Calendar is the entry point: it's where a resident would already be
          checking what's on before deciding when to book their own use of a
          room. */}
      <div style={{ padding: "12px 16px 0" }}>
        <button
          onClick={() => setBookingSpace(true)}
          style={{
            width: "100%", background: "var(--surface)", border: "1px dashed var(--border)",
            borderRadius: 10, padding: "0.65rem 1rem", color: "var(--text)", fontWeight: 600,
            fontSize: "0.88rem", cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", gap: "0.4rem",
          }}
        >
          <span style={{ fontSize: "1.05rem", lineHeight: 1 }}>+</span> Book a Space
        </button>
      </div>

      {loading && events.length === 0 ? (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          height: 300, flexDirection: "column", gap: 12, color: "var(--text-dim)",
        }}>
          <div className="spinner" />
          <div style={{ fontSize: 14 }}>Loading events…</div>
        </div>
      ) : events.length === 0 ? (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          height: 300, flexDirection: "column", gap: 8, color: "var(--text-dim)",
        }}>
          <div style={{ fontSize: 40 }}>📅</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>No events coming up</div>
          <div style={{ fontSize: 13 }}>Check back soon!</div>
        </div>
      ) : (
        <CalendarView events={events} onEventTap={handleEventTap} isAuthenticated={true} />
      )}

      <EventSlideOut
        event={selected}
        onClose={() => setSelected(null)}
        isAuthenticated={true}
        onRefresh={handleRefresh}
      />

      <SpaceBookingForm
        open={bookingSpace}
        onClose={() => setBookingSpace(false)}
        onBooked={() => {}}
      />
    </div>
  )
}
