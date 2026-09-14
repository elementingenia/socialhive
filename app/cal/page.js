"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "@/lib/supabase"
import CalendarView from "@/components/CalendarView"
import EventSlideOut from "@/components/EventSlideOut"
import { sydneyTodayStr, sydneyDateStrPlusDays } from "@/lib/date"
import { hubPathForEvent } from "@/lib/eventShare"

// Sydney-local wall-clock formatting for the private-space-booking read-only
// card below -- same conversion isoToSydneyHHMM/isoToSydneyDateStr do
// elsewhere, kept local/minimal here since this card doesn't need the rest
// of EventSlideOut's machinery.
function fmtSpaceWhen(startsAt, endsAt) {
  const start = new Date(startsAt), end = new Date(endsAt)
  const dateStr = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Sydney" }).format(start)
  const timeFmt = (d) => new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Australia/Sydney" }).format(d).toLowerCase().replace(" ", "")
  return `${dateStr} · ${timeFmt(start)}–${timeFmt(end)}`
}

// Read-only card for a shared PRIVATE Book a Space booking (?sb=<id>) --
// Event_Deep_Linking_and_Calendar_Scope_v2, decision 2. Deliberately its own
// small component rather than forced through EventSlideOut, which assumes
// the `events` table's shape throughout (see app/api/spaces/share/route.js's
// own comment for why private bookings are a separate case).
function SpaceBookingCard({ booking }) {
  return (
    <div style={{ maxWidth: 480, margin: "24px auto", padding: "0 16px" }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14,
        borderLeft: "4px solid var(--amber)", padding: "1.1rem 1.25rem" }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: "var(--text)", marginBottom: 6 }}>{booking.title}</div>
        <div style={{ fontSize: 14, color: "var(--amber-dark, var(--amber))", fontWeight: 600, marginBottom: 4 }}>
          {fmtSpaceWhen(booking.starts_at, booking.ends_at)}
        </div>
        {booking.location && (
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 10 }}>📍 {booking.location}</div>
        )}
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 10 }}>
          This is a private space booking. Sign in to manage your own bookings.
        </div>
        <a href="/login" style={{ display: "inline-block", marginTop: 12, padding: "9px 16px", background: "var(--amber)",
          color: "#fff", borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: "none" }}>Sign In</a>
      </div>
    </div>
  )
}

function DeepLinkUnavailable({ kind }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 240, flexDirection: "column", gap: 8, color: "var(--text-dim)", padding: "0 16px", textAlign: "center" }}>
      <div style={{ fontSize: 34 }}>🔗</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>This {kind} isn't available anymore</div>
      <div style={{ fontSize: 13 }}>It may have passed, been cancelled, or the link may be out of date.</div>
    </div>
  )
}

export default function PublicCalendarPage() {
  const [events, setEvents]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(null)
  const [isAuthed, setIsAuthed] = useState(false)
  const loadRef = useRef(0)
  // Event Deep Linking (?event=<id> / ?sb=<id>) -- Event_Deep_Linking_and_
  // Calendar_Scope_v2, decision 4 + build sequence step 4. This is the
  // logged-out-visitor landing page every hub's own auth gate redirects a
  // shared deep link to (app/(app)/layout.js) -- viewable, not actionable,
  // matching this page's existing read-only precedent exactly rather than
  // inventing a new one.
  const [deepLink, setDeepLink] = useState(null) // { kind: 'event'|'sb', status: 'loading'|'ok'|'unavailable', data }

  // Auth state is used ONLY for the header's "Go to App" vs "Sign In" link --
  // a convenience for a visitor who happens to already have a session. It
  // must never influence what the calendar itself shows or does (Iain,
  // 2026-08-04: the public page has to look and behave identically no
  // matter who's viewing it -- read-only, never bookable/editable, always
  // pointing to login). See the deliberately-unauthenticated fetch below and
  // the hardcoded isAuthenticated={false} on CalendarView/EventSlideOut.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthed(!!session)
    })
  }, [])

  const loadEvents = useCallback(async () => {
    const tag = ++loadRef.current
    setLoading(true)
    try {
      const from = sydneyTodayStr()
      const to = sydneyDateStrPlusDays(90)

      // Deliberately anonymous -- no Authorization header, even if this
      // browser has a real session. This is what makes is_public=false
      // filtering (app/api/events/route.js) and the "no personal booking
      // state on the public page" rule hold regardless of who's looking.
      const res = await fetch(`/api/events?from=${from}&to=${to}`)
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

  useEffect(() => {
    if (selected) {
      const updated = events.find(e => e.id === selected.id)
      if (updated) setSelected(updated)
    }
  }, [events])

  // Resolve ?event=<id> / ?sb=<id> once on mount -- independent of the
  // normal 90-day/is_public-filtered `events` list above, since a deep link
  // must resolve regardless of date window or the is_public toggle (see
  // app/api/events/share/route.js's own comment on why).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const evId = params.get("event")
    const sbId = params.get("sb")
    if (evId) {
      setDeepLink({ kind: "event", status: "loading" })
      fetch(`/api/events/share?id=${encodeURIComponent(evId)}`)
        .then(res => res.json())
        .then(data => {
          if (data.available) setDeepLink({ kind: "event", status: "ok", data: data.event })
          else setDeepLink({ kind: "event", status: "unavailable" })
        })
        .catch(() => setDeepLink({ kind: "event", status: "unavailable" }))
    } else if (sbId) {
      setDeepLink({ kind: "sb", status: "loading" })
      fetch(`/api/spaces/share?id=${encodeURIComponent(sbId)}`)
        .then(res => res.json())
        .then(data => {
          if (data.available) setDeepLink({ kind: "sb", status: "ok", data: data.booking })
          else setDeepLink({ kind: "sb", status: "unavailable" })
        })
        .catch(() => setDeepLink({ kind: "sb", status: "unavailable" }))
    }
  }, [])

  // A resolved ?event= deep link opens the same EventSlideOut the calendar
  // itself uses, exactly like tapping a day's event would -- viewable,
  // read-only (isAuthenticated={false} below, unconditionally on this page).
  useEffect(() => {
    if (deepLink?.kind === "event" && deepLink.status === "ok") setSelected(deepLink.data)
  }, [deepLink])

  if (deepLink?.kind === "sb") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "DM Sans, sans-serif" }}>
        {deepLink.status === "loading" ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}><div className="spinner" /></div>
        ) : deepLink.status === "unavailable" ? (
          <DeepLinkUnavailable kind="booking" />
        ) : (
          <SpaceBookingCard booking={deepLink.data} />
        )}
      </div>
    )
  }

  if (deepLink?.kind === "event" && deepLink.status === "unavailable") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "DM Sans, sans-serif" }}>
        <DeepLinkUnavailable kind="event" />
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "DM Sans, sans-serif" }}>

      {/* Minimal public header */}
      <div style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/logo_hex_bee.png" alt="Element Happenings" style={{ width: 34, height: 34, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "var(--amber-dark)" }}>
              Element Happenings
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
              Fullerton Cove Events Calendar
            </div>
          </div>
        </div>
        {isAuthed ? (
          <a
            href="/home"
            style={{
              padding: "7px 14px",
              background: "var(--amber)",
              color: "#fff",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 13,
              textDecoration: "none",
            }}
          >Go to App</a>
        ) : (
          <a
            href="/login"
            style={{
              padding: "7px 14px",
              background: "var(--amber)",
              color: "#fff",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 13,
              textDecoration: "none",
            }}
          >Sign In</a>
        )}
      </div>

      {/* Calendar */}
      {loading && events.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, flexDirection: "column", gap: 12, color: "var(--text-dim)" }}>
          <div className="spinner" />
          <div style={{ fontSize: 14 }}>Loading events…</div>
        </div>
      ) : events.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, flexDirection: "column", gap: 8, color: "var(--text-dim)" }}>
          <div style={{ fontSize: 40 }}>📅</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>No upcoming events</div>
          <div style={{ fontSize: 13 }}>Check back soon</div>
        </div>
      ) : (
        <CalendarView events={events} onEventTap={setSelected} defaultView="month" />
      )}

      <EventSlideOut
        event={selected}
        onClose={() => setSelected(null)}
        isAuthenticated={false}
        onRefresh={loadEvents}
        shareBasePath={hubPathForEvent(selected)}
      />
    </div>
  )
}
