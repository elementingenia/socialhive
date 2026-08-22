"use client"
import { useState, useEffect, useCallback } from "react"
import { authedFetch } from "@/lib/getAuthToken"
import SpaceBookingForm from "@/components/SpaceBookingForm"
import PromoteBookingModal from "@/components/PromoteBookingModal"
import SharedSpaceEventRow from "@/components/SharedSpaceEventRow"

// Iain, 2026-08-22, second live review: the private-booking tile and the
// shared "Welcome party for all" tile (SharedSpaceEventRow, on this same
// Home page) looked inconsistent -- one a stacked card with visible action
// pills, the other a single clean clickable row with no pills at all.
// Rebuilt to match that row's format exactly: title/date-time-location,
// click anywhere to manage it. Every action that used to be its own pill
// (Edit, Cancel, Allow others to join) now lives inside the edit sheet that
// opens on click, the same way a shared event's Modify/Cancel live inside
// EventSlideOut rather than on ITS Home tile -- one consistent pattern for
// "tap a booking to manage it" across both private and shared bookings.
//
// Iain, 2026-08-22, THIRD live review: promoting a booking (or joining
// someone else's shared space event) was making it disappear from here
// entirely -- it only ever showed up on /spaces/scheduled after that. His
// rule, matching every other hub's own "My Bookings" (Show Time Home
// etc): a resident should see EVERY space booking they hold in one place,
// private or shared, their own gathering or someone else's. This now
// fetches BOTH still-private bookings (space_bookings, as before) AND the
// caller's own active bookings on any hub_type='space' event
// (event_bookings, new) from the same /api/spaces?mine=1 call, merges them
// into the existing location-grouped list, and opens the right surface for
// each on click -- the edit sheet for a private booking, the real
// EventSlideOut (via the new onOpenSharedEvent prop) for a shared one.

// Extracted from app/(app)/bookings/page.js (2026-08-22) so both "My
// Bookings" and the new /spaces hub home page can render the same list
// rather than maintaining two copies -- see the Book a Space hub work,
// Book_a_Space_Scope_v2.md. Behaviour unchanged from the original inline
// version except for the new "Allow others to join" action added below.

// My Space Bookings — separate from the hub-bookings list above on purpose.
// A space booking has no `events` row behind it (space_bookings.event_id is
// null for a personal booking) and no EventSlideOut-compatible shape, so
// rather than force it through the event-grouping pipeline built for
// hub bookings, it gets its own small, self-contained section. Renders
// nothing at all when there are no upcoming space bookings — never an empty
// header or placeholder (standing UI rule: don't render a container for
// content that isn't there).
function fmtSpaceDate(iso) {
  return new Date(iso).toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Sydney",
  })
}
function fmtSpaceTime(iso) {
  return new Date(iso).toLocaleTimeString("en-AU", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Australia/Sydney",
  }).toLowerCase().replace(" ", "")
}

// Same visual shape as SharedSpaceEventRow -- title bold on top, date/time
// (+ location, since this list isn't already grouped by one room the way
// SharedSpaceEventRow's caller lists are) in the hub colour underneath.
function PrivateBookingRow({ booking, locationName, onOpen }) {
  return (
    <div onClick={onOpen} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && onOpen()}
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderLeft: "4px solid var(--amber)", borderRadius: "14px",
        padding: "0.9rem 1.1rem", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem",
      }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text)" }}>
          {booking.title || "Space booking"}
        </div>
        <div style={{ fontSize: "0.8rem", color: "var(--amber-dark, var(--amber))", fontWeight: 600, marginTop: 2 }}>
          {fmtSpaceDate(booking.starts_at)} · {fmtSpaceTime(booking.starts_at)}–{fmtSpaceTime(booking.ends_at)}
          {locationName ? ` · ${locationName}` : ""}
        </div>
      </div>
    </div>
  )
}

// refreshSignal (optional): bump this from a parent whenever something
// OUTSIDE this component's own actions might have changed the resident's
// space bookings -- e.g. the "Book a Space" CTA on /spaces uses its own
// separate SpaceBookingForm instance, so a brand-new booking never runs any
// code inside MySpaceBookings and this list previously only refreshed on
// mount, silently missing the new row until the resident manually
// reloaded the page (Iain, 2026-08-22, live screenshot).
function MySpaceBookings({ refreshSignal, onOpenSharedEvent } = {}) {
  const [bookings, setBookings] = useState(null) // null = loading; private space_bookings rows
  const [eventBookings, setEventBookings] = useState([]) // the caller's own bookings on shared hub_type='space' events
  const [cancellingId, setCancellingId] = useState(null)
  // Iain, 2026-08-17: "My Space bookings need to be editable" -- previously
  // Cancel was the only option, so changing a date/time/location meant
  // cancelling and re-booking from scratch with no fallback if the new slot
  // wasn't actually free. Reuses SpaceBookingForm itself (same fields,
  // validation, clash-check, Ingenia confirmation) via its editBooking prop
  // rather than building a second form.
  const [editingBooking, setEditingBooking] = useState(null)
  // "Allow others to join" -- promote a private booking to a shared event.
  // Scope: Book_a_Space_Scope_v2.md (Iain, 2026-08-22, "Yes can be flipped
  // after the fact"). Deliberately its own small modal (PromoteBookingModal)
  // rather than a field on SpaceBookingForm -- see that component's own
  // comment for why.
  const [promotingBooking, setPromotingBooking] = useState(null)

  const load = useCallback(async () => {
    const res = await authedFetch("/api/spaces?mine=1")
    if (!res.ok) { setBookings([]); setEventBookings([]); return }
    const data = await res.json()
    setBookings((data.bookings || []).filter(b => b.status !== "cancelled"))
    setEventBookings((data.event_bookings || []).filter(b => b.status !== "cancelled"))
  }, [])

  useEffect(() => { load() }, [load, refreshSignal])

  // Returns true on a successful cancel so the caller (the edit sheet's own
  // "Cancel this booking" button) knows to close itself too.
  async function cancel(id) {
    if (!window.confirm("Cancel this space booking?")) return false
    setCancellingId(id)
    const res = await authedFetch("/api/spaces", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    setCancellingId(null)
    if (res.ok) load()
    return res.ok
  }

  if (bookings === null) return null
  if (bookings.length === 0 && eventBookings.length === 0) return null

  // Grouped by Location (heading), then chronological by date underneath,
  // indented a fraction (Iain, 2026-08-17, Social_Hive_Location_First_
  // Booking_Scope_v2.md item 7) -- was a flat chronological list. No query
  // change needed: /api/spaces?mine=1 already returns locations(name)
  // joined, this is a pure client-side re-group of data already present.
  const byLocation = new Map()
  for (const b of bookings) {
    const name = b.locations?.name || "Space"
    if (!byLocation.has(name)) byLocation.set(name, [])
    byLocation.get(name).push({ kind: "private", sortKey: b.starts_at || "", booking: b })
  }
  for (const eb of eventBookings) {
    const name = eb.event.locations?.name || "Space"
    if (!byLocation.has(name)) byLocation.set(name, [])
    byLocation.get(name).push({
      kind: "event", sortKey: `${eb.event.event_date}T${eb.event.event_time || "00:00"}`,
      event: eb.event, mySeats: eb.seats || 1,
    })
  }
  const locationNames = [...byLocation.keys()].sort((a, b) => a.localeCompare(b))

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)",
        textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
        My Space Bookings
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
        {locationNames.map(name => (
          <div key={name}>
            <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>
              {name}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", paddingLeft: "0.6rem" }}>
              {byLocation.get(name)
                .slice()
                .sort((a, c) => a.sortKey.localeCompare(c.sortKey))
                .map(row => row.kind === "private"
                  ? <PrivateBookingRow key={`p-${row.booking.id}`} booking={row.booking} locationName={row.booking.locations?.name} onOpen={() => setEditingBooking(row.booking)} />
                  : <SharedSpaceEventRow key={`e-${row.event.id}`} event={row.event} mySeats={row.mySeats} onOpen={() => onOpenSharedEvent?.(row.event.id)} />
                )}
            </div>
          </div>
        ))}
      </div>

      <SpaceBookingForm
        open={!!editingBooking}
        editBooking={editingBooking}
        onClose={() => setEditingBooking(null)}
        onBooked={() => load()}
        onPromote={editingBooking ? () => { setPromotingBooking(editingBooking); setEditingBooking(null) } : undefined}
        onCancelBooking={editingBooking ? async () => {
          const ok = await cancel(editingBooking.id)
          if (ok) setEditingBooking(null)
        } : undefined}
      />

      {promotingBooking && (
        <PromoteBookingModal
          booking={promotingBooking}
          onClose={() => setPromotingBooking(null)}
          onPromoted={() => { setPromotingBooking(null); load() }}
        />
      )}
    </div>
  )
}

export default MySpaceBookings
