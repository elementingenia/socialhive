"use client"
import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import { sydneyTodayStr, isEventPast } from "@/lib/date"
import EventSlideOut from "@/components/EventSlideOut"
import SharedSpaceEventRow from "@/components/SharedSpaceEventRow"

// Space Bookings' Scheduled tab -- the full chronological list of shared
// events (bookings promoted via "Allow others to join"), same Home-preview
// + Scheduled-full-list split every other hub already has (Show Time's
// /movies + /screenings, Social's /social + /social/events). Added
// 2026-08-22 after Iain flagged /spaces only had a Home page. Reuses the
// same SharedSpaceEventRow + EventSlideOut wiring /spaces itself uses --
// no new booking/attendee logic, just a longer, uncapped list.

export default function SpacesScheduledPage() {
  const { member } = useUser()
  const [events, setEvents] = useState(null) // null = loading
  const [fullEvent, setFullEvent] = useState(null)

  const load = useCallback(async () => {
    const todayStr = sydneyTodayStr()
    const { data } = await supabase
      .from("events")
      .select("id, title, event_date, event_time, max_seats, locations(name), bookings(id, status, seats)")
      .eq("hub_type", "space").eq("archived", false)
      .gte("event_date", todayStr)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true })
      .limit(100)
    setEvents((data || []).filter(e => !isEventPast(e)))
  }, [])

  useEffect(() => { load() }, [load])

  async function openEvent(id) {
    const { data } = await supabase
      .from("events")
      .select("*, locations(name), bookings(id, status, seats, member_id, members(name, username)), booking_attendees(owner_id, owner_contact_id)")
      .eq("id", id).single()
    if (!data) return
    const my_bookings = (data.bookings || []).filter(b => b.member_id === member?.id)
    setFullEvent({ ...data, my_bookings })
  }

  if (events === null) {
    return (
      <div style={{ padding: "1.25rem 1rem" }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: 90, borderRadius: "14px", background: "var(--surface2)", marginBottom: "0.75rem" }} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      {events.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3.5rem 1.5rem", color: "var(--text-dim)" }}>
          <div style={{ fontSize: "2.25rem", marginBottom: "0.75rem" }}>📅</div>
          <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "1.05rem", marginBottom: "0.5rem" }}>
            No shared bookings yet
          </div>
          <div style={{ fontSize: "0.88rem" }}>
            When a resident books a space and turns on "Allow others to join", it'll show up here.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {events.map(ev => (
            <SharedSpaceEventRow key={ev.id} event={ev} onOpen={() => openEvent(ev.id)} />
          ))}
        </div>
      )}

      <EventSlideOut
        event={fullEvent}
        onClose={() => setFullEvent(null)}
        isAuthenticated={true}
        onRefresh={() => { load(); if (fullEvent) openEvent(fullEvent.id) }}
      />
    </div>
  )
}
