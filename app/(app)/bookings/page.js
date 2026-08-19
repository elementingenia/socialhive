"use client"
import { useEffect, useState, useCallback, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import EventSlideOut from "@/components/EventSlideOut"
import { bookingStatusBadge } from "@/lib/payments"
import { authedFetch } from "@/lib/getAuthToken"
import { MoviesIcon, SocialIcon } from "@/components/NavIcons"
import ClubScopeDropdown from "@/components/ClubScopeDropdown"
import { useMyClubs } from "@/lib/useMyClubs"
import SpaceBookingForm from "@/components/SpaceBookingForm"

const HUB_COLOURS = {
  movie:    "var(--teal)",
  bookclub: "var(--purple)",
  social:   "var(--terracotta)",
}

const HUB_LABELS = {
  movie: "Show Time", bookclub: "Book Club", social: "Social",
}

// Same shape Calendar filters on (components/CalendarView.js's hubKeyOf) --
// a club-linked event keys as "club" regardless of hub_type, so Dinner Club
// and Book Club fall under the one Groups & Clubs control rather than the
// generic hub toggle.
function hubKeyOf(ev) {
  return ev?.club_id ? "club" : ev?.hub_type
}

// Icon + colour for the two independent toggle chips -- pixel-identical to
// Calendar's hub-filter pills (components/CalendarView.js), per the app's
// canonical-asset rule (Iain, 2026-07-27). Groups & Clubs isn't a toggle
// chip here any more than it is on Calendar -- it's the shared
// ClubScopeDropdown instead (Iain, 2026-08-04: "Make sure they are
// identical in UI and function" -- matching the visual style wasn't enough,
// the underlying multi-toggle + dropdown interaction model has to match too).
const HUB_TOGGLES = [
  { key: "movie",  label: "Show Time", Icon: MoviesIcon, colour: "var(--teal)" },
  { key: "social", label: "Social",    Icon: SocialIcon, colour: "var(--terracotta)" },
]

function fmtDate(str) {
  if (!str) return ""
  const [y, m, d] = str.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  })
}

function fmtTime(t) {
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  const ampm = h >= 12 ? "pm" : "am"
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${ampm}`
}

// BookingCard accepts a grouped entry: { event, confirmed, waitlist, eventId }
function BookingCard({ group, waitlistPosition, onClick }) {
  const event = group.event
  if (!event) return null

  const club       = event.clubs || null
  const colour     = club?.colour || HUB_COLOURS[event.hub_type] || "var(--teal)"
  const hubLabel   = club?.name   || HUB_LABELS[event.hub_type]  || event.hub_type
  // "sign-up" clubs book one seat per person, so no seat count is shown
  const isBookClub = club ? !!club.single_signup : event.hub_type === "bookclub"
  const { confirmed, waitlist } = group

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onClick()}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderLeft: "4px solid " + colour,
        borderRadius: "14px",
        padding: "0.9rem 1.1rem",
        cursor: "pointer",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "0.75rem",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: "0.68rem", fontWeight: 700, color: colour,
          textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.2rem",
        }}>
          {hubLabel}
        </div>
        <div style={{
          fontSize: "0.98rem", fontWeight: 700, color: "var(--text)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          marginBottom: "0.22rem",
        }}>
          {event.title}
        </div>
        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
          {fmtDate(event.event_date)}
          {event.event_time ? " · " + fmtTime(event.event_time) : ""}
          {!isBookClub && confirmed > 1 ? " · " + confirmed + " seats" : ""}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", flexShrink: 0, alignItems: "flex-end" }}>
        {confirmed > 0 && (() => {
          const badge = bookingStatusBadge(group.confirmedBooking, event)
          const label = confirmed === 1
            ? badge.label
            : `${badge.label === "Confirmed" ? "✓ " : ""}${confirmed} ${badge.label.toLowerCase()}`
          return (
            <div style={{
              background: badge.bg, color: badge.color,
              fontSize: "0.7rem", fontWeight: 700,
              padding: "0.25rem 0.65rem", borderRadius: "20px", whiteSpace: "nowrap",
            }}>
              {label}
            </div>
          )
        })()}
        {waitlist > 0 && (
          <div style={{
            background: "#fef3c7", color: "#d97706",
            fontSize: "0.7rem", fontWeight: 700,
            padding: "0.25rem 0.65rem", borderRadius: "20px", whiteSpace: "nowrap",
          }}>
            {`⏳ ${waitlist} waitlisted${waitlistPosition ? ` (#${waitlistPosition})` : ''}`}
          </div>
        )}
      </div>
    </div>
  )
}

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

function MySpaceBookings() {
  const [bookings, setBookings] = useState(null) // null = loading
  const [cancellingId, setCancellingId] = useState(null)
  // Iain, 2026-08-17: "My Space bookings need to be editable" -- previously
  // Cancel was the only option, so changing a date/time/location meant
  // cancelling and re-booking from scratch with no fallback if the new slot
  // wasn't actually free. Reuses SpaceBookingForm itself (same fields,
  // validation, clash-check, Ingenia confirmation) via its editBooking prop
  // rather than building a second form.
  const [editingBooking, setEditingBooking] = useState(null)

  const load = useCallback(async () => {
    const res = await authedFetch("/api/spaces?mine=1")
    if (!res.ok) { setBookings([]); return }
    const data = await res.json()
    setBookings((data.bookings || []).filter(b => b.status !== "cancelled"))
  }, [])

  useEffect(() => { load() }, [load])

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
                  padding: "0.9rem 1.1rem", display: "flex", alignItems: "flex-start",
                  justifyContent: "space-between", gap: "0.75rem",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* No per-tile "Space Booking" or location label -- the
                        section header (Iain, 2026-08-04) and the location
                        heading above (Iain, 2026-08-17) already say it. */}
                    <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: "0.3rem" }}>
                      {fmtSpaceDate(b.starts_at)} · {fmtSpaceTime(b.starts_at)}–{fmtSpaceTime(b.ends_at)}
                    </div>
                    {b.title && <div style={{ fontSize: "0.82rem", color: "var(--text)" }}>{b.title}</div>}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                    <button
                      onClick={() => setEditingBooking(b)}
                      disabled={cancellingId === b.id}
                      style={{
                        background: "var(--surface2)", border: "1px solid var(--border)",
                        borderRadius: 8, padding: "0.4rem 0.75rem", fontSize: "0.78rem", fontWeight: 600,
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
                        borderRadius: 8, padding: "0.4rem 0.75rem", fontSize: "0.78rem", fontWeight: 600,
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
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{
      textAlign: "center",
      padding: "3.5rem 1.5rem",
      color: "var(--text-dim)",
    }}>
      <div style={{ fontSize: "2.25rem", marginBottom: "0.75rem" }}>📅</div>
      <div style={{
        fontWeight: 700, color: "var(--text)",
        fontSize: "1.05rem", marginBottom: "0.5rem",
      }}>
        Nothing booked yet
      </div>
      <div style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>
        Head to Events to see what's coming up and grab a spot.
      </div>
    </div>
  )
}

export default function BookingsPage() {
  const { member }    = useUser()
  const [bookings,    setBookings]    = useState([])
  const [loading,     setLoading]     = useState(true)
  // Same default and shape as Calendar's activeHubs -- independent
  // multi-toggle, not a single-select filter (Iain, 2026-08-04).
  const [activeHubs,  setActiveHubs]  = useState(["movie", "club", "social"])
  const [clubScope,   setClubScope]   = useState("all")
  const { myClubIds } = useMyClubs()
  const [pastOpen,    setPastOpen]    = useState(false)
  const [selectedEvent,    setSelectedEvent]    = useState(null)
  const [loadingEvent,     setLoadingEvent]     = useState(false)
  const [waitlistPositions, setWaitlistPositions] = useState({})

  const load = useCallback(async () => {
    if (!member?.id) return
    const { data } = await supabase
      .from("bookings")
      .select("id, status, seats, payment_status, booked_at, event_id, events(id, title, event_date, event_time, hub_type, club_id, clubs!club_id(name, colour, single_signup))")
      .eq("member_id", member.id)
      .neq("status", "cancelled")

    setBookings(data || [])
    setLoading(false)
  }, [member?.id])

  useEffect(() => { load() }, [load])

  // Batch-fetch waitlist positions whenever bookings change
  useEffect(() => {
    const waitlisted = bookings.filter(b => b.status === "waitlist" && b.booked_at)
    if (waitlisted.length === 0) { setWaitlistPositions({}); return }
    Promise.all(
      waitlisted.map(b =>
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("event_id", b.event_id)
          .eq("status", "waitlist")
          .lt("booked_at", b.booked_at)
          .then(({ count }) => [b.event_id, (count ?? 0) + 1])
      )
    ).then(results => setWaitlistPositions(Object.fromEntries(results)))
  }, [bookings])

  async function openBooking(booking) {
    setLoadingEvent(true)
    const { data } = await supabase
      .from("events")
      .select("*, bus_driver:members!bus_driver_id(name, username), bookings(id, status, seats, payment_status, member_id, bus_passenger, members(name, username)), booking_attendees(owner_id, owner_contact_id, is_bus_passenger)")
      .eq("id", booking.event_id)
      .single()
    setLoadingEvent(false)
    if (!data) return
    // Bug fixed 2026-07-08: same gap as social/page.js's Next Social Event
    // tile — never derived my_bookings, so EventSlideOut always showed the
    // "no booking yet" view even from the Scheduled tab, where by
    // definition every event tapped IS one you've booked.
    const my_bookings = (data.bookings || []).filter(b => b.member_id === member?.id)
    setSelectedEvent({ ...data, my_bookings })
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)

  // Every club actually appearing in this member's bookings, for the
  // dropdown's per-club options -- same derivation Calendar uses off
  // `events`, just off `b.events` here (only club_id/clubs.name are
  // selected on the booking query, so id comes from the FK, not a
  // separate id column in the join).
  const clubsInView = useMemo(() => {
    const seen = new Map()
    for (const b of bookings) {
      const ev = b.events
      if (ev?.club_id && ev?.clubs) seen.set(ev.club_id, { id: ev.club_id, name: ev.clubs.name })
    }
    return [...seen.values()].sort((a, b) => (a.name || "").localeCompare(b.name || ""))
  }, [bookings])

  // Identical predicate to Calendar's filteredEvents (components/CalendarView.js).
  const filtered = bookings.filter(b => {
    const ev = b.events
    if (!ev) return false
    const key = hubKeyOf(ev)
    if (!activeHubs.includes(key)) return false
    if (key === "club") {
      if (clubScope === "hide") return false
      if (clubScope === "mine" && !myClubIds.has(ev.club_id)) return false
      if (clubScope !== "all" && clubScope !== "mine" && ev.club_id !== clubScope) return false
    }
    return true
  })

  // Group by event_id so split bookings (confirmed + waitlist) show as one tile
  function groupBookings(rows) {
    const grouped = {}
    for (const b of rows) {
      if (!b.events) continue
      if (!grouped[b.event_id]) grouped[b.event_id] = { event: b.events, eventId: b.event_id, confirmed: 0, waitlist: 0, confirmedBooking: null }
      if (b.status === "waitlist") grouped[b.event_id].waitlist += (b.seats || 1)
      else { grouped[b.event_id].confirmed += (b.seats || 1); grouped[b.event_id].confirmedBooking = b }
    }
    return Object.values(grouped)
  }

  const upcoming = groupBookings(
    filtered.filter(b => b.events && new Date(b.events.event_date + "T00:00:00") >= today)
  ).sort((a, b) => a.event.event_date.localeCompare(b.event.event_date))

  // Exclude waitlist-only from past (no seat was held)
  const past = groupBookings(
    filtered.filter(b => b.events && new Date(b.events.event_date + "T00:00:00") < today && b.status !== "waitlist")
  ).sort((a, b) => b.event.event_date.localeCompare(a.event.event_date))

  if (loading) {
    return (
      <div style={{ padding: "1.25rem 1rem" }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            height: 76, borderRadius: 14,
            background: "var(--surface2)", marginBottom: "0.6rem",
          }} />
        ))}
      </div>
    )
  }

  const noBookings = upcoming.length === 0 && past.length === 0

  return (
    <>
      <div style={{ padding: "1rem 1rem 6rem" }}>

        <MySpaceBookings />

        {/* Filter strip -- identical in UI AND function to Calendar's hub
            filters (components/CalendarView.js): Show Time/Social are
            independent toggle pills (tap to add/remove, not a single
            select), and Groups & Clubs is the same shared ClubScopeDropdown
            popover, not a third toggle chip (Iain, 2026-08-04). */}
        <div style={{
          display: "flex", gap: 8,
          marginBottom: "1.25rem",
          overflowX: "auto", paddingBottom: 2,
        }}>
          {HUB_TOGGLES.map(({ key, label, Icon, colour }) => {
            const on = activeHubs.includes(key)
            return (
              <button
                key={key}
                onClick={() => setActiveHubs(prev =>
                  prev.includes(key) ? prev.filter(h => h !== key) : [...prev, key]
                )}
                style={{
                  display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                  padding: "4px 10px", borderRadius: 20,
                  border: `1px solid ${on ? colour : "var(--border)"}`,
                  background: on ? colour + "20" : "var(--surface2)",
                  cursor: "pointer", fontFamily: "inherit",
                  opacity: on ? 1 : 0.55,
                  transition: "all 0.15s",
                }}
              >
                {Icon && (
                  <span style={{ display: "flex", color: on ? colour : "var(--text-dim)", flexShrink: 0 }}>
                    <Icon size={14} />
                  </span>
                )}
                <span style={{ fontSize: 12, fontWeight: 600, color: on ? colour : "var(--text-dim)", whiteSpace: "nowrap" }}>
                  {label}
                </span>
              </button>
            )
          })}

          {(clubsInView.length > 0 || myClubIds.size > 0) && (
            <ClubScopeDropdown
              clubScope={clubScope}
              setClubScope={setClubScope}
              clubsInView={clubsInView}
            />
          )}
        </div>

        {/* Upcoming */}
        {noBookings ? (
          <EmptyState />
        ) : upcoming.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "2rem 1rem",
            color: "var(--text-dim)", fontSize: "0.9rem",
          }}>
            No upcoming bookings
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1.5rem" }}>
            {upcoming.map(g => (
              <BookingCard key={g.eventId} group={g} waitlistPosition={waitlistPositions[g.eventId]} onClick={() => openBooking({ event_id: g.eventId, events: g.event })} />
            ))}
          </div>
        )}

        {/* Past events accordion */}
        {past.length > 0 && (
          <div style={{ marginTop: noBookings ? 0 : "0.5rem" }}>
            <button
              onClick={() => setPastOpen(v => !v)}
              style={{
                width: "100%",
                padding: "0.75rem 1.1rem",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: pastOpen ? "14px 14px 0 0" : "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "0.85rem",
                fontWeight: 700,
                color: "var(--text-dim)",
              }}
            >
              <span>Past Events</span>
              <span style={{
                fontSize: "0.7rem",
                display: "inline-block",
                transform: pastOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}>▼</span>
            </button>
            {pastOpen && (
              <div style={{
                border: "1px solid var(--border)",
                borderTop: "none",
                borderRadius: "0 0 14px 14px",
                overflow: "hidden",
              }}>
                {past.map((g, i) => (
                  <div
                    key={g.eventId}
                    style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none", opacity: 0.7 }}
                  >
                    <BookingCard group={g} waitlistPosition={waitlistPositions[g.eventId]} onClick={() => openBooking({ event_id: g.eventId, events: g.event })} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Spinner overlay while fetching full event for slide-out */}
      {loadingEvent && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.25)", zIndex: 299,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "var(--surface)", borderRadius: 14,
            padding: "1rem 1.5rem", fontSize: "0.9rem",
            color: "var(--text-dim)", fontWeight: 600,
          }}>
            Loading…
          </div>
        </div>
      )}

      {selectedEvent && (
        <EventSlideOut
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onRefresh={load}
        />
      )}
    </>
  )
}
