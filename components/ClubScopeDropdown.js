"use client"
import { useState, useRef, useEffect } from "react"
import { ClubsIcon } from "@/components/NavIcons"

// Custom pill + popover for the Groups & Clubs filter — replaces a native
// <select> so its text is guaranteed to match the Show Time/Social pill font
// exactly (Iain, 2026-07-27: a native select's text rendered visibly larger
// than the other pills on iOS Safari no matter what inline fontSize was set
// -- platform-enforced minimum form-control font size overriding CSS).
//
// Extracted out of CalendarView.js (2026-08-04) so Calendar and the Bookings
// page can share the exact same component instead of Bookings approximating
// it with a different interaction model — Iain: "Bookings Filters are STILL
// not the same as the Calendar filters... identical in UI and function."
export default function ClubScopeDropdown({ clubScope, setClubScope, clubsInView }) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const rootRef = useRef(null)
  const btnRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [open])

  const FIXED = [
    { value: "all",  label: "All Groups & Clubs" },
    { value: "mine", label: "My Groups & Clubs" },
    { value: "hide", label: "Hide Groups & Clubs" },
  ]
  const options = [...FIXED, ...clubsInView.map(c => ({ value: c.id, label: c.name }))]
  const current = options.find(o => o.value === clubScope) || FIXED[0]

  // Position with the button's screen coords rather than CSS position:absolute
  // (Iain, 2026-07-27 live-fire find: the pill row is horizontally scrollable
  // via overflowX:"auto", and per spec that forces overflow-y to clip too --
  // an absolutely-positioned dropdown was silently invisible, clipped by its
  // own scrollable ancestor even though it was correctly in the DOM). Using
  // position:"fixed" with a rect computed at open-time escapes that ancestor
  // clipping (no transformed ancestor exists here to re-anchor "fixed").
  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setMenuPos({ top: r.bottom + 4, left: r.left })
    }
    setOpen(o => !o)
  }

  return (
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        style={{
          display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
          maxWidth: 220, padding: "4px 10px", borderRadius: 20,
          border: "1px solid var(--purple)", background: "var(--surface2)",
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <span style={{ display: "flex", color: "var(--purple)", flexShrink: 0 }}>
          <ClubsIcon size={14} />
        </span>
        <span style={{
          fontSize: 12, fontWeight: 600, color: "var(--purple)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{current.label}</span>
      </button>

      {open && menuPos && (
        <div style={{
          position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 200,
          minWidth: 200, maxHeight: 260, overflowY: "auto",
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.15)", padding: 4,
        }}>
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { setClubScope(o.value); setOpen(false) }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "8px 10px", borderRadius: 8, border: "none",
                background: o.value === clubScope ? "var(--surface2)" : "transparent",
                color: o.value === clubScope ? "var(--purple)" : "var(--text)",
                fontFamily: "inherit", fontSize: 13,
                fontWeight: o.value === clubScope ? 700 : 500,
                cursor: "pointer",
              }}
            >{o.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}
