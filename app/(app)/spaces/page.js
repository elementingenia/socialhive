"use client"
import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import { sydneyTodayStr, isEventPast } from "@/lib/date"
import EventSlideOut from "@/components/EventSlideOut"
import MySpaceBookings from "@/components/MySpaceBookings"
import SpaceBookingForm from "@/components/SpaceBookingForm"
import LocationScheduleView from "@/components/LocationScheduleView"
import { SpaceIcon } from "@/components/NavIcons"

// Book a Space hub home. Scope: Book_a_Space_Scope_v2.md /
// Book_a_Space_Technical_Design.md (Iain, 2026-08-22). Merges the existing
// Personal Space Booking feature (MySpaceBookings, SpaceBookingForm,
// LocationScheduleView -- all pre-existing, none of their logic touched
// here) with a "Next Booked Space" / upcoming shared-events section for
// bookings that have been promoted to a real hub_type='space' event via
// the "Allow others to join" toggle (see PromoteBookingModal, reached from
// MySpaceBookings). A shared event opens through the same EventSlideOut
// every other hub uses -- no new booking/attendee logic needed here, it
// already renders generically for a hub_type it doesn't special-case.

function fmtDate(str) {
  if (!str) return ""
  const [y, m, d] = str.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
}
function fmtTime(str) {
  if (!str) return ""
  const [h, m] = str.split(":").map(Number)
  const ampm = h >= 12 ? "pm" : "am"
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${ampm}`
}

function SharedEventRow({ event, onOpen }) {
  const confirmed = (event.bookings || []).filter(b => b.status === "confirmed")
  const seatsBooked = confirmed.reduce((s, b) => s + (b.seats || 1), 0)
  return (
    <div onClick={onOpen} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && onOpen()}
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderLeft: "4px solid var(--space)", borderRadius: "14px",
        padding: "0.9rem 1.1rem", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem",
      }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text)" }}>{event.title}</div>
        <div style={{ fontSize: "0.8rem", color: "var(--space)", fontWeight: 600, marginTop: 2 }}>
          {fmtDate(event.event_date)} · {fmtTime(event.event_time)}{event.locations?.name ? ` · ${event.locations.name}` : ""}
        </div>
      </div>
      <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", flexShrink: 0 }}>
        {seatsBooked}{event.max_seats ? `/${event.max_seats}` : ""} booked
      </div>
    </div>
  )
}

export default function SpacesPage() {
  const { member } = useUser()
  const [events, setEvents] = useState(null) // null = loading
  const [fullEvent, setFullEvent] = useState(null)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [browsingByLocation, setBrowsingByLocation] = useState(false)
  const [spacePrefill, setSpacePrefill] = useState(null)

  const load = useCallback(async () => {
    const todayStr = sydneyTodayStr()
    const { data } = await supabase
      .from("events")
      .select("id, title, event_date, event_time, max_seats, locations(name), bookings(id, status, seats)")
      .eq("hub_type", "space").eq("archived", false)
      .gte("event_date", todayStr)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true })
      .limit(8)
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
        {[1, 2].map(i => (
          <div key={i} style={{ height: 90, borderRadius: "14px", background: "var(--surface2)", marginBottom: "0.75rem" }} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      <button onClick={() => setBrowsingByLocation(true)} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
        background: "var(--space)", color: "#fff", border: "none", borderRadius: "14px",
        padding: "0.95rem", fontSize: "0.95rem", fontWeight: 700, cursor: "pointer",
        fontFamily: "inherit", marginBottom: "1.25rem",
      }}>
        <SpaceIcon size={22} /> Book a Space
      </button>

      {events.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)",
            textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
            {events.length === 1 ? "Next Booked Space" : "Upcoming Shared Bookings"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {events.map(ev => (
              <SharedEventRow key={ev.id} event={ev} onOpen={() => openEvent(ev.id)} />
            ))}
          </div>
        </div>
      )}

      <MySpaceBookings />

      <EventSlideOut
        event={fullEvent}
        onClose={() => setFullEvent(null)}
        isAuthenticated={true}
        onRefresh={() => { load(); if (fullEvent) openEvent(fullEvent.id) }}
      />

      <SpaceBookingForm
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        onBooked={() => load()}
        initialLocationId={spacePrefill?.locationId || ""}
        initialDate={spacePrefill?.date || ""}
      />

      <LocationScheduleView
        open={browsingByLocation}
        onClose={() => setBrowsingByLocation(false)}
        onPickSlot={({ locationId, date }) => {
          setSpacePrefill({ locationId, date })
          setBrowsingByLocation(false)
          setBookingOpen(true)
        }}
      />
    </div>
  )
}
