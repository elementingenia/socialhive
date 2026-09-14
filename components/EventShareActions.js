"use client"
import { useState, useRef, useEffect } from "react"
import { buildGoogleCalendarUrl, buildIcsContent, buildCalendarDescription, downloadIcs } from "@/lib/eventShare"

// Event Deep Linking + Add to Calendar — shared, event-level action row.
// Scope: Event_Deep_Linking_and_Calendar_Scope_v2 (Iain, 2026-09-13). Deliberately
// NOT gated on booking status or isAuthenticated -- "you do not need a booking
// to be able to copy the link... You do not need a booking for either." Every
// caller resolves its own `url`/`start`/`end`, so this component stays decoupled
// from the `events` vs `space_bookings` table shape -- one shared UI for both.
//
// Iain, 2026-09-14 (post-launch correction): "The buttons for both options
// should NOT be on the booking modal. They relate to the event and not a
// booking. Place the link and Calendar options on the event tile." Moved out
// of EventSlideOut entirely -- every caller is now a compact tile/card, so
// this renders as small icon buttons rather than the wider labelled pair the
// slide-out used. Also simplified per his direct question: Copy Link is now a
// plain clipboard copy, no navigator.share() native-sheet branch.
//
// Every handler stops event propagation -- a tile's own onClick opens the
// event/booking detail, and these buttons sit inside that same clickable row.
//
// Props:
//   url          — the full deep-link URL to copy and embed in the invite
//   title        — calendar entry SUMMARY
//   description  — the event's own description/notes (truncated + embedded in
//                  the invite body by lib/eventShare.js; NOT shown here directly)
//   location     — plain text location, or omitted if none
//   start, end   — JS Date objects (real instants, not Sydney-local strings)
//   colour       — the hub/club's own accent colour, matching the rest of the tile
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

  async function handleCopyLink(e) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt("Copy this link:", url) // last-resort fallback, e.g. clipboard permission denied
    }
  }

  const calDescription = buildCalendarDescription({ deepLink: url, description })

  function handleGoogleCalendar(e) {
    e.stopPropagation()
    const href = buildGoogleCalendarUrl({ title, description: calDescription, location, start, end })
    window.open(href, "_blank", "noopener,noreferrer")
    setShowCalMenu(false)
  }

  function handleIcsDownload(e) {
    e.stopPropagation()
    const ics = buildIcsContent({
      uid: `event-${encodeURIComponent(url)}@elementhappenings.com.au`,
      title, description: calDescription, location, start, end,
    })
    downloadIcs(title || "event", ics)
    setShowCalMenu(false)
  }

  const btnStyle = {
    display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700,
    padding: "5px 10px", borderRadius: 20, border: `1px solid ${colour}`, color: colour,
    background: "transparent", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  }

  const menuItems = [
    { label: "Google Calendar", onClick: handleGoogleCalendar },
    { label: "Download .ics (Apple/Outlook)", onClick: handleIcsDownload },
  ]

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={e => e.stopPropagation()}>
      <button type="button" onClick={handleCopyLink} style={btnStyle} title="Copy a link to this event">
        {copied ? "✓ Copied" : "🔗 Copy Link"}
      </button>
      <div ref={menuRef} style={{ position: "relative" }}>
        <button type="button" onClick={(e) => { e.stopPropagation(); setShowCalMenu(v => !v) }} style={btnStyle}
          title="Add this event to your calendar">
          📅 Add to Calendar
        </button>
        {showCalMenu && (
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 5,
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)", minWidth: 210, overflow: "hidden",
          }}>
            {menuItems.map((item, i) => (
              <button key={item.label} type="button" onClick={item.onClick} style={{
                display: "block", width: "100%", textAlign: "left", padding: "10px 14px",
                background: "none", border: "none",
                borderBottom: "1px solid var(--border)",
                fontSize: 13, fontWeight: 600, color: "var(--text)", cursor: "pointer", fontFamily: "inherit",
              }}>
                {item.label}
              </button>
            ))}
            {/* Iain, 2026-09-13 (decision 5): a proactive note that the entry
                won't auto-update -- shown here, when the menu's actually
                open, rather than as permanent text on every tile. */}
            <div style={{ padding: "8px 14px", fontSize: 11, color: "var(--text-dim)", lineHeight: 1.4 }}>
              Won't update automatically if this event changes.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
