"use client"
import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { buildGoogleCalendarUrl, buildIcsContent, buildCalendarDescription, downloadIcs } from "@/lib/eventShare"

// Event Deep Linking + Add to Calendar — shared, event-level actions.
// Scope: Event_Deep_Linking_and_Calendar_Scope_v2 (Iain, 2026-09-13). Deliberately
// NOT gated on booking status or isAuthenticated -- "you do not need a booking
// to be able to copy the link... You do not need a booking for either." Every
// caller resolves its own `url`/`start`/`end`, so these components stay
// decoupled from the `events` vs `space_bookings` table shape.
//
// Iain, 2026-09-14 (first correction): moved out of EventSlideOut (the
// booking modal) onto each hub's own tile/card; Copy Link simplified to a
// plain clipboard copy, no navigator.share().
//
// Iain, 2026-09-15 (second correction): the Add to Calendar dropdown was
// getting visually covered by the NEXT tile in the list -- every tile sets
// `overflow: hidden` for its rounded corners, and on the affected device
// that clipped/mis-stacked the dropdown instead of just cropping it at the
// tile edge. Fixed at the root: the dropdown now renders through a React
// Portal straight onto `document.body` with `position: fixed`, computed
// from the button's own bounding rect -- it can never be clipped by an
// ancestor's overflow or out-stacked by a sibling tile, regardless of which
// tile it's opened from. Also split into two standalone exports
// (`CopyLinkButton`, `AddToCalendarButton`) so each hub's card can place
// them exactly where Iain asked -- Add to Calendar beside the Coordinators
// line, Copy Link on its own line directly below -- rather than as one
// fixed row.
//
// Every handler stops event propagation -- a tile's own onClick opens the
// event/booking detail, and these buttons sit inside that same clickable row.

const BTN_STYLE = (colour) => ({
  display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700,
  padding: "3px 8px", borderRadius: 20, border: `1px solid ${colour}`, color: colour,
  background: "transparent", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
})

/** Plain clipboard copy, no native share sheet (Iain, 2026-09-14: "can this
 * not simply be a copy url to clipboard function?"). */
export function CopyLinkButton({ url, colour = "var(--amber)" }) {
  const [copied, setCopied] = useState(false)
  if (!url) return null

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

  return (
    <button type="button" onClick={handleCopyLink} style={BTN_STYLE(colour)} title="Copy a link to this event">
      {copied ? "✓ Copied" : "🔗 Copy Link"}
    </button>
  )
}

/** Add to Calendar -- Google Calendar link + .ics download, in a dropdown
 * rendered via a portal so it's never clipped by a tile's own overflow. */
export function AddToCalendarButton({ url, title, description, location, start, end, colour = "var(--amber)" }) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    // A portal-rendered menu is fixed-position -- it doesn't track scroll, so
    // close it on scroll rather than risk it drifting from the button that
    // opened it (same reasoning a native <select> menu follows).
    function onScroll() { setOpen(false) }
    document.addEventListener("mousedown", onDocClick)
    window.addEventListener("scroll", onScroll, true)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      window.removeEventListener("scroll", onScroll, true)
    }
  }, [open])

  if (!url || !start || !end) return null // no date to build a calendar entry from

  function toggleOpen(e) {
    e.stopPropagation()
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const menuWidth = 210
      // Keep the menu on-screen horizontally -- align its right edge to the
      // button's right edge when opening it would otherwise overflow the
      // viewport (small phone widths, a button near the right margin).
      const left = Math.min(Math.max(8, r.right - menuWidth), window.innerWidth - menuWidth - 8)
      setMenuPos({ top: r.bottom + 4, left })
    }
    setOpen(v => !v)
  }

  const calDescription = buildCalendarDescription({ deepLink: url, description })

  function handleGoogleCalendar(e) {
    e.stopPropagation()
    const href = buildGoogleCalendarUrl({ title, description: calDescription, location, start, end })
    window.open(href, "_blank", "noopener,noreferrer")
    setOpen(false)
  }

  function handleIcsDownload(e) {
    e.stopPropagation()
    const ics = buildIcsContent({
      uid: `event-${encodeURIComponent(url)}@elementhappenings.com.au`,
      title, description: calDescription, location, start, end,
    })
    downloadIcs(title || "event", ics)
    setOpen(false)
  }

  const menuItems = [
    { label: "Google Calendar", onClick: handleGoogleCalendar },
    { label: "Download .ics (Apple/Outlook)", onClick: handleIcsDownload },
  ]

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggleOpen} style={BTN_STYLE(colour)}
        title="Add this event to your calendar">
        📅 Add to Calendar
      </button>
      {open && menuPos && typeof document !== "undefined" && createPortal(
        <div ref={menuRef} onClick={e => e.stopPropagation()} style={{
          position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 500,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)", width: 210, overflow: "hidden",
        }}>
          {menuItems.map(item => (
            <button key={item.label} type="button" onClick={item.onClick} style={{
              display: "block", width: "100%", textAlign: "left", padding: "10px 14px",
              background: "none", border: "none", borderBottom: "1px solid var(--border)",
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
        </div>,
        document.body
      )}
    </>
  )
}
