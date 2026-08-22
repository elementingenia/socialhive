"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import { authedFetch } from "@/lib/getAuthToken"
import CalendarView from "@/components/CalendarView"
import EventSlideOut from "@/components/EventSlideOut"
import { sydneyTodayStr, sydneyDateStrPlusDays } from "@/lib/date"

// Book by Date / Book by Location entry points removed from here 2026-08-23
// (Iain: "should have been removed") -- Book a Space now has its own
// dedicated hub (/spaces, "Book a Space" pill on Home), which was the
// point of building it; keeping a second, older pair of entry points here
// was redundant now that hub exists. Calendar stays a pure browse/view
// surface for every hub's events, space bookings included (see the
// "Spaces" filter pill in CalendarView.js) -- booking itself happens from
// the hub that owns it, same as Show Time/Social/Clubs already work.

export default function CalendarPage() {
  const [events, setEvents]   = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const loadRef = useRef(0)

  const loadEvents = useCallback(async () => {
    const tag = ++loadRef.current
    setLoading(true)
    try {
      // Load 90 days of events
      const from = sydneyTodayStr()
      const to = sydneyDateStrPlusDays(90)

      const res = await authedFetch(`/api/events?from=${from}&to=${to}`)
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
