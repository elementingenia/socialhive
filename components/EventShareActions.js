"use client"
import { useState, useRef, useEffect } from "react"
import { buildGoogleCalendarUrl, buildIcsContent, buildCalendarDescription, downloadIcs } from "@/lib/eventShare"

// Event Deep Linking + Add to Calendar — shared, event-level action row.
// Scope: Event_Deep_Linking_and_Calendar_Scope_v2 (Iain, 2026-09-13). Deliberately
// NOT gated on booking status or isAuthenticated -- "you do not need a booking
// to be able to copy the link... You do not need a booking for either." Every
// caller (EventSlideOut, SpaceBookingForm's edit view) is responsible for
// resolving its own `url`/`start`/`end`, so this component stays decoupled
// from the `events` vs `space_bookings` table shape -- one shared UI for both.
//
// Props:
//   url          — the full deep-link URL to copy/share and embed in the invite
//   title        — calendar entry SUMMARY / share title
//   description  — the event's own description/notes (truncated + embedded in
//                  the invite body by lib/eventShare.js; NOT shown here directly)
//   location     — plain text location, or omitted if none
//   start, end   — JS Date objects (real instants, not Sydney-local strings)
//   colour       — the hub/club's own accent colour, matching the rest of the card
export default function EventShareActions({ url, title, description, location, start, end, colour = "var(--amber)" }) {
  const [showCalMenu, setShowCalMenu] = useState(false)
  const [copied, setCopied] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!showCalMenu) return
    function onDocClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowCalMenu(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [showCalMenu])

  // No date to build a calendar entry from -- shouldn't happen for a real
  // event, but defensive rather than throwing on a malformed row.
  if (!url || !start || !end) return null

  async function handleShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch (e) {
        if (e?.name === "AbortError") return // user cancelled the native sheet -- not an error
        // fall through to clipboard on any other failure
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt("Copy this link:", url) // last-resort fallback, e.g. clipboard permission denied
    }
  }

  const calDescription = buildCalendarDescription({ deepLink: url, description })

  function handleGoogleCalendar() {
    const href = buildGoogleCalendarUrl({ title, description: calDescription, location, start, end })
    window.open(href, "_blank", "noopener,noreferrer")
    setShowCalMenu(false)
  }

  function handleIcsDownload() {
    const ics = buildIcsContent({
      uid: `event-${encodeURIComponent(url)}@elementhappenings.com.au`,
      title, description: calDescription, location, start, end,
    })
    downloadIcs(title || "event", ics)
    setShowCalMenu(false)
  }

  const btnStyle = {
    display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700,
    padding: "7px 12px", borderRadius: 20, border: `1px solid ${colour}`, color: colour,
    background: "transparent", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  }

  const menuItems = [
    { label: "Google Calendar", onClick: handleGoogleCalendar },
    { label: "Download .ics (Apple/Outlook)", onClick: handleIcsDownload },
  ]

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
      <button type="button" onClick={handleShare} style={btnStyle}>
        {copied ? "✓ Link copied" : "🔗 Copy Link"}
      </button>
      <div ref={menuRef} style={{ position: "relative" }}>
        <button type="button" onClick={() => setShowCalMenu(v => !v)} style={btnStyle}>
          📅 Add to Calendar
        </button>
        {showCalMenu && (
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 5,
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)", minWidth: 200, overflow: "hidden",
          }}>
            {menuItems.map((item, i) => (
              <button key={item.label} type="button" onClick={item.onClick} style={{
                display: "block", width: "100%", textAlign: "left", padding: "10px 14px",
                background: "none", border: "none",
                borderBottom: i < menuItems.length - 1 ? "1px solid var(--border)" : "none",
                fontSize: 13, fontWeight: 600, color: "var(--text)", cursor: "pointer", fontFamily: "inherit",
              }}>
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Iain, 2026-09-13 (decision 5): a proactive note that the entry won't
          auto-update, right where the action is taken -- not buried in the
          invite body only. */}
      <div style={{ width: "100%", fontSize: 11, color: "var(--text-dim)", marginTop: -2 }}>
        Calendar entries won't update automatically if this event changes.
      </div>
    </div>
  )
}
