"use client"
import { useEffect, useState, useCallback } from "react"
import { authedFetch } from "@/lib/getAuthToken"
import { useUser } from "@/lib/UserContext"
import { sydneyTodayStr } from "@/lib/date"
import { toInstant, sydneyOffsetMinutes } from "@/lib/spaces"
import { supabase } from "@/lib/supabase"
import EventSlideOut from "@/components/EventSlideOut"
import SpaceScheduledEventCard from "@/components/SpaceScheduledEventCard"
import PromoteBookingModal from "@/components/PromoteBookingModal"

// Space Bookings' Scheduled tab. Added 2026-08-22 after Iain flagged /spaces
// only had a Home page, same Home-preview + Scheduled-full-list split every
// other hub already has (Show Time's /movies + /screenings, Social's
// /social + /social/events).
//
// Corrected 2026-08-22, third pass, per Iain: "The scheduled page is only
// for spaces booked that have invitees enabled. It is not for all space
// bookings by all users. Idea is that the logged in user can see OTHER
// user space bookings that they COULD attend." A private booking, by
// definition, has no seats another resident can book into -- listing it
// here would be misleading (nothing to tap through to attend) and a
// privacy overreach (broadcasting who's using a room for personal use to
// every other resident). Reverted the second pass's private-bookings
// merge; this page shows ONLY hub_type='space' events -- bookings that
// have been shared via "Allow others to join" -- exactly like every other
// hub's Scheduled list only ever shows real, joinable events. A resident's
// own private bookings still live on the Home page's My Space Bookings.

const WINDOW_DAYS = 180 // generous forward window; nothing here needs an exact cap

export default function SpacesScheduledPage() {
  const { member } = useUser()
  const [rows, setRows] = useState(null) // null = loading; else [{kind:'event', ...}]
  const [fullEvent, setFullEvent] = useState(null)
  // Edit pill, owner-only (Iain, 2026-08-23) -- same PromoteBookingModal
  // edit mode My Space Bookings and the Next Scheduled Space tile use.
  const [editingEvent, setEditingEvent] = useState(null)

  const load = useCallback(async () => {
    const today = sydneyTodayStr()
    const end = new Date()
    end.setDate(end.getDate() + WINDOW_DAYS)
    const endStr = sydneyTodayStr(end)
    const from = toInstant(today, "00:00", sydneyOffsetMinutes(today)).toISOString()
    const to = toInstant(endStr, "23:59", sydneyOffsetMinutes(endStr)).toISOString()
    const res = await authedFetch(`/api/spaces?calendar_from=${encodeURIComponent(from)}&calendar_to=${encodeURIComponent(to)}`)
    if (!res.ok) { setRows([]); return }
    const data = await res.json()

    const eventRows = (data.events || []).map(ev => ({
      kind: "event", id: `event-${ev.id}`, sortKey: `${ev.event_date}T${ev.event_time || "00:00"}`, event: ev,
    }))

    setRows(eventRows.sort((a, c) => a.sortKey.localeCompare(c.sortKey)))
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

  if (rows === null) {
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
      {rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3.5rem 1.5rem", color: "var(--text-dim)" }}>
          <div style={{ fontSize: "2.25rem", marginBottom: "0.75rem" }}>📅</div>
          <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "1.05rem", marginBottom: "0.5rem" }}>
            Nothing booked yet
          </div>
          <div style={{ fontSize: "0.88rem" }}>
            No shared space bookings coming up — spaces opened up with "Allow others to join"
            will show up here.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {rows.map(row => (
            <SpaceScheduledEventCard key={row.id} event={row.event}
              onOpen={() => openEvent(row.event.id)} onEdit={setEditingEvent} />
          ))}
        </div>
      )}

      <EventSlideOut
        event={fullEvent}
        onClose={() => setFullEvent(null)}
        isAuthenticated={true}
        onRefresh={() => { load(); if (fullEvent) openEvent(fullEvent.id) }}
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
