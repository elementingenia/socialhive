"use client"
import { useState, useEffect, useCallback } from "react"
import { authedFetch } from "@/lib/getAuthToken"
import SpaceBookingForm from "@/components/SpaceBookingForm"
import PromoteBookingModal from "@/components/PromoteBookingModal"

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
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney",
  })
}
function fmtSpaceTime(iso) {
  return new Date(iso).toLocaleTimeString("en-AU", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Australia/Sydney",
  }).toLowerCase().replace(" ", "")
}

// refreshSignal (optional): bump this from a parent whenever something
// OUTSIDE this component's own actions might have changed the resident's
// space bookings -- e.g. the "Book a Space" CTA on /spaces uses its own
// separate SpaceBookingForm instance, so a brand-new booking never runs any
// code inside MySpaceBookings and this list previously only refreshed on
// mount, silently missing the new row until the resident manually
// reloaded the page (Iain, 2026-08-22, live screenshot).
function MySpaceBookings({ refreshSignal } = {}) {
  const [bookings, setBookings] = useState(null) // null = loading
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
    if (!res.ok) { setBookings([]); return }
    const data = await res.json()
    setBookings((data.bookings || []).filter(b => b.status !== "cancelled"))
  }, [])

  useEffect(() => { load() }, [load, refreshSignal])

  async function cancel(id) {
    if (!window.confirm("Cancel this space booking?")) return
    setCancellingId(id)
    const res = await authedFetch("/api/spaces", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    setCancellingId(null)
    if (res.ok) load()
  }

  if (bookings === null || bookings.length === 0) return null

  // Grouped by Location (heading), then chronological by date underneath,
  // indented a fraction (Iain, 2026-08-17, Social_Hive_Location_First_
  // Booking_Scope_v2.md item 7) -- was a flat chronological list. No query
  // change needed: /api/spaces?mine=1 already returns locations(name)
  // joined, this is a pure client-side re-group of data already present.
  const byLocation = new Map()
  for (const b of bookings) {
    const name = b.locations?.name || "Space"
    if (!byLocation.has(name)) byLocation.set(name, [])
    byLocation.get(name).push(b)
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
                .sort((a, c) => (a.starts_at || "").localeCompare(c.starts_at || ""))
                .map(b => (
                <div key={b.id} style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderLeft: "4px solid var(--amber)", borderRadius: "14px",
                  padding: "0.75rem 0.9rem",
                }}>
                  {/* Iain, 2026-08-22: date/time on one line, description
                      below it, action pills on their own bottom row --
                      vertical space is precious, and the old side-by-side
                      layout pushed the row taller than any of this
                      actually needs, especially once a 3rd pill
                      ("Allow others to join") was added. No per-tile
                      "Space Booking" or location label -- the section
                      header (Iain, 2026-08-04) and the location heading
                      above (Iain, 2026-08-17) already say it. */}
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>
                    {fmtSpaceDate(b.starts_at)} · {fmtSpaceTime(b.starts_at)}–{fmtSpaceTime(b.ends_at)}
                  </div>
                  {b.title && (
                    <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "0.15rem" }}>
                      {b.title}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
                    {b.purpose === "private" && (
                      <button
                        onClick={() => setPromotingBooking(b)}
                        disabled={cancellingId === b.id}
                        style={{
                          background: "var(--surface2)", border: "1px solid var(--space)",
                          borderRadius: 8, padding: "0.35rem 0.7rem", fontSize: "0.76rem", fontWeight: 600,
                          color: "var(--space)", cursor: cancellingId === b.id ? "default" : "pointer",
                          opacity: cancellingId === b.id ? 0.6 : 1,
                        }}
                      >
                        Allow others to join
                      </button>
                    )}
                    <button
                      onClick={() => setEditingBooking(b)}
                      disabled={cancellingId === b.id}
                      style={{
                        background: "var(--surface2)", border: "1px solid var(--border)",
                        borderRadius: 8, padding: "0.35rem 0.7rem", fontSize: "0.76rem", fontWeight: 600,
                        color: "var(--text)", cursor: cancellingId === b.id ? "default" : "pointer",
                        opacity: cancellingId === b.id ? 0.6 : 1,
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => cancel(b.id)}
                      disabled={cancellingId === b.id}
                      style={{
                        background: "var(--surface2)", border: "1px solid var(--border)",
                        borderRadius: 8, padding: "0.35rem 0.7rem", fontSize: "0.76rem", fontWeight: 600,
                        color: "var(--danger)", cursor: cancellingId === b.id ? "default" : "pointer",
                        opacity: cancellingId === b.id ? 0.6 : 1,
                      }}
                    >
                      {cancellingId === b.id ? "Cancelling…" : "Cancel"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <SpaceBookingForm
        open={!!editingBooking}
        editBooking={editingBooking}
        onClose={() => setEditingBooking(null)}
        onBooked={() => load()}
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
