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
import NextSpaceEventTile from "@/components/NextSpaceEventTile"
import PromoteBookingModal from "@/components/PromoteBookingModal"

// Book a Space hub home. Scope: Book_a_Space_Scope_v2.md /
// Book_a_Space_Technical_Design.md (Iain, 2026-08-22). Merges the existing
// Personal Space Booking feature (MySpaceBookings, SpaceBookingForm,
// LocationScheduleView -- all pre-existing, none of their logic touched
// here) with a "Next Booked Space" preview for bookings that have been
// promoted to a real hub_type='space' event via the "Allow others to
// join" toggle (see PromoteBookingModal, reached from MySpaceBookings).
//
// Home shows only the SOONEST shared booking, same as every other hub's
// Home tile (Show Time's NextScreeningCard, Social's NextEventTile) --
// the FULL chronological list lives on /spaces/scheduled instead (added
// 2026-08-22 after Iain flagged this hub had a Home page but no Scheduled
// page, unlike every other hub). A shared event opens through the same
// EventSlideOut every other hub uses -- no new booking/attendee logic
// needed here, it already renders generically for a hub_type it doesn't
// special-case.

export default function SpacesPage() {
  const { member } = useUser()
  const [nextEvent, setNextEvent] = useState(undefined) // undefined = loading, null = none
  const [fullEvent, setFullEvent] = useState(null)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [browsingByLocation, setBrowsingByLocation] = useState(false)
  const [spacePrefill, setSpacePrefill] = useState(null)
  // Bumped whenever the CTA form below books/edits something -- MySpaceBookings
  // is a self-contained component with its own load(), which otherwise only
  // ever runs on mount, so a booking made via THIS page's own SpaceBookingForm
  // instance (below) never reached it (Iain, 2026-08-22: "will not appear
  // until the user manually refreshes the page").
  const [mySpacesRefresh, setMySpacesRefresh] = useState(0)
  // Edit pill on the Next Scheduled Space tile itself, for its organiser
  // (Iain, 2026-08-23) -- same PromoteBookingModal edit mode My Space
  // Bookings already uses.
  const [editingEvent, setEditingEvent] = useState(null)

  const load = useCallback(async () => {
    const todayStr = sydneyTodayStr()
    const { data } = await supabase
      .from("events")
      .select(`
        id, title, event_date, event_time, event_end_time, description,
        location, location_type, max_seats, has_bus, reservation_cutoff,
        bus_driver:members!bus_driver_id(name, username),
        event_coordinators(member_id, replaced_at, members!event_coordinators_member_id_fkey(name, username)),
        bookings(id, status, seats, member_id)
      `)
      .eq("hub_type", "space").eq("archived", false)
      .gte("event_date", todayStr)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true })
      .limit(5)
    setNextEvent((data || []).find(e => !isEventPast(e)) || null)
  }, [member?.id])

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

  if (nextEvent === undefined) {
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

      {nextEvent && (() => {
        const activeCoordinators = (nextEvent.event_coordinators || []).filter(c => !c.replaced_at)
        const coordinators = activeCoordinators.map(c => c.members).filter(Boolean)
        const isCoordinator = activeCoordinators.some(c => c.member_id === member?.id)
        const confirmed = (nextEvent.bookings || []).filter(b => b.status === "confirmed")
        const bookedCount = confirmed.reduce((sum, b) => sum + (b.seats || 1), 0)
        const myBooking = (nextEvent.bookings || []).find(
          b => b.member_id === member?.id && b.status !== "cancelled",
        ) || null
        return (
          <div style={{ marginBottom: "0.5rem" }}>
            <NextSpaceEventTile
              event={nextEvent}
              coordinators={coordinators}
              bookedCount={bookedCount}
              myBooking={myBooking}
              isCoordinator={isCoordinator}
              onEdit={() => setEditingEvent(nextEvent)}
              onOpen={() => openEvent(nextEvent.id)}
            />
          </div>
        )
      })()}

      <MySpaceBookings refreshSignal={mySpacesRefresh} onOpenSharedEvent={openEvent} />

      <EventSlideOut
        event={fullEvent}
        onClose={() => setFullEvent(null)}
        isAuthenticated={true}
        onRefresh={() => { load(); if (fullEvent) openEvent(fullEvent.id) }}
      />

      <SpaceBookingForm
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        onBooked={() => { load(); setMySpacesRefresh(n => n + 1) }}
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

      {editingEvent && (
        <PromoteBookingModal
          editEvent={editingEvent}
          onClose={() => setEditingEvent(null)}
          onPromoted={() => { setEditingEvent(null); load() }}
        />
      )}
    </div>
  )
}
