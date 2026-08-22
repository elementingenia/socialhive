"use client"
import { useEffect, useState, useCallback } from "react"
import { authedFetch } from "@/lib/getAuthToken"
import { useUser } from "@/lib/UserContext"
import { sydneyTodayStr } from "@/lib/date"
import { toInstant, sydneyOffsetMinutes } from "@/lib/spaces"
import { supabase } from "@/lib/supabase"
import EventSlideOut from "@/components/EventSlideOut"
import SharedSpaceEventRow, { fmtSpaceEventDate, fmtSpaceEventTime } from "@/components/SharedSpaceEventRow"

// Space Bookings' Scheduled tab. Added 2026-08-22 after Iain flagged /spaces
// only had a Home page, same Home-preview + Scheduled-full-list split every
// other hub already has (Show Time's /movies + /screenings, Social's
// /social + /social/events).
//
// Iain, 2026-08-22, second pass: "The Scheduled Page will include all
// resident bookings, as the user can see their own bookings on the home
// page." The first version only ever listed SHARED events (bookings
// promoted via "Allow others to join") -- this rewrite widens it to every
// resident's space activity, shared and still-private, reusing
// /api/spaces?calendar_from=&calendar_to= (no location_id) rather than
// inventing new privacy-handling logic: that mode already returns every
// CONFIRMED private space_booking with the standard Display Name /
// hide_name masking (resolveMemberName, same convention as any other
// attendee list) plus, as of this same change, every hub_type='space'
// shared event in range too.

const WINDOW_DAYS = 180 // generous forward window; nothing here needs an exact cap

function PrivateBookingRow({ booking }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderLeft: "4px solid var(--amber)", borderRadius: "14px",
      padding: "0.9rem 1.1rem",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text)" }}>
          {booking.title || "Space booking"}
        </div>
        <div style={{ fontSize: "0.8rem", color: "var(--amber-dark, var(--amber))", fontWeight: 600, marginTop: 2 }}>
          {fmtSpaceEventDate(booking._dateStr)} · {fmtSpaceEventTime(booking._timeStr)}
          {booking.location_name ? ` · ${booking.location_name}` : ""}
        </div>
      </div>
      <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", flexShrink: 0, textAlign: "right" }}>
        {booking.booked_by_name}
      </div>
    </div>
  )
}

export default function SpacesScheduledPage() {
  const { member } = useUser()
  const [rows, setRows] = useState(null) // null = loading; else [{kind:'event'|'private', ...}]
  const [fullEvent, setFullEvent] = useState(null)

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
    const privateRows = (data.bookings || [])
      .filter(b => b.purpose === "private")
      .map(b => ({
        kind: "private", id: `private-${b.id}`, sortKey: b.starts_at,
        booking: {
          ...b,
          location_name: b.location_name,
          booked_by_name: b.booked_by_name,
          _dateStr: b.starts_at.slice(0, 10),
          _timeStr: new Date(b.starts_at).toLocaleTimeString("en-AU", {
            hour: "numeric", minute: "2-digit", hour12: false, timeZone: "Australia/Sydney",
          }),
        },
      }))

    setRows([...eventRows, ...privateRows].sort((a, c) => a.sortKey.localeCompare(c.sortKey)))
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
            Every resident's upcoming space booking — shared or still private — will show up here.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {rows.map(row => row.kind === "event"
            ? <SharedSpaceEventRow key={row.id} event={row.event} onOpen={() => openEvent(row.event.id)} />
            : <PrivateBookingRow key={row.id} booking={row.booking} />
          )}
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
