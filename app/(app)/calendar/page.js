"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "@/lib/supabase"
import CalendarView from "@/components/CalendarView"
import EventSlideOut from "@/components/EventSlideOut"

export default function CalendarPage() {
  const [events, setEvents]   = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
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
        <CalendarView events={events} onEventTap={handleEventTap} />
      )}

      <EventSlideOut
        event={selected}
        onClose={() => setSelected(null)}
        isAuthenticated={true}
        onRefresh={handleRefresh}
      />
    </div>
  )
}
