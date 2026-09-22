"use client"
import { useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { authedFetch } from "@/lib/getAuthToken"
import { sydneyTodayStr, sydneyDateStrPlusDays } from "@/lib/date"
import { SearchResultsList, eventMatchesQuery } from "@/components/CalendarView"
import { eventDeepLinkFor } from "@/lib/eventNav"

// Global "Find an event" button (Iain, 2026-09-22): Calendar's own Find
// pill only exists inside Calendar's filter row, so it was invisible from
// every other page -- "the find option is always going to be off page
// placed there. It needs to persist visibly." Chosen approach (Iain,
// confirmed via option pick): a small floating button on every authenticated
// page, opening the same full-screen search overlay/result list Calendar's
// own Find already uses (SearchResultsList + eventMatchesQuery, imported
// from CalendarView.js rather than reimplemented -- see that file's own
// comment on why those two are exported). Doesn't touch Header or
// BottomNav.
//
// Mounted once in app/(app)/layout.js's InnerLayout, which does not remount
// on route changes, so this component (and its fetched events) persists
// across navigation for the life of the session -- opening it a second time
// on a different page re-fetches fresh data rather than reusing a stale
// list, since the resident may be looking for something that changed since
// the first open.
export default function FindButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const loadRef = useRef(0)

  const loadEvents = useCallback(async () => {
    const tag = ++loadRef.current
    setLoading(true)
    try {
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

  function handleOpen() {
    setOpen(true)
    loadEvents()
  }

  function handleClose() {
    setOpen(false)
    setQuery("")
  }

  function handleEventTap(ev) {
    handleClose()
    // eventDeepLinkFor lands on the specific event for every hub, including
    // Club/Book Club (routes via the club's own slug -- see lib/eventNav.js)
    // -- falls back to a hub's plain page only if that data is genuinely
    // unavailable, rather than erroring or dead-ending.
    const target = eventDeepLinkFor(ev)
    if (target) router.push(target)
  }

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const results = words.length === 0 ? [] : events
    .filter(ev => eventMatchesQuery(ev, words))
    .sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.event_time || "").localeCompare(b.event_time || ""))

  return (
    <>
      <button
        onClick={handleOpen}
        aria-label="Find an event"
        style={{
          position: "fixed",
          right: 16,
          bottom: "calc(82px + env(safe-area-inset-bottom, 0px))",
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "var(--amber)",
          border: "none",
          boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          cursor: "pointer",
          zIndex: 90,
        }}
      >
        🔍
      </button>

      {open && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 500,
          background: "var(--bg)", display: "flex", flexDirection: "column",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "0.9rem 1rem",
            borderBottom: "1px solid var(--border)", flexShrink: 0,
          }}>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search event names and descriptions…"
              style={{
                flex: 1, padding: "0.6rem 0.9rem", borderRadius: 10,
                border: "1px solid var(--border)", background: "var(--surface)",
                color: "var(--text)", fontSize: "0.9rem", fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={handleClose}
              aria-label="Close search"
              style={{
                flexShrink: 0, background: "var(--surface2)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "0.6rem 0.8rem", fontSize: 13, fontWeight: 600,
                color: "var(--text-dim)", cursor: "pointer",
              }}
            >Cancel</button>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading && events.length === 0 ? (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                height: 200, flexDirection: "column", gap: 10, color: "var(--text-dim)",
              }}>
                <div className="spinner" />
                <div style={{ fontSize: 13 }}>Loading events…</div>
              </div>
            ) : (
              <SearchResultsList query={query} results={results} onEventTap={handleEventTap} />
            )}
          </div>
        </div>
      )}
    </>
  )
}
