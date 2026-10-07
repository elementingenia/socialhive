"use client"
import { useState } from "react"
import MenuModal, { hasMenu } from "@/components/MenuModal"

// Menu/View Details pill for event tiles (Iain, 2026-10-07): sits to the
// left of Invite a neighbour so the menu/flyer is reachable from the tile
// as well as the booking modal. Same pill style as Invite/Copy Link.
// Renders nothing when the event has no menu.
export default function MenuButton({ event, colour = "var(--amber)" }) {
  const [open, setOpen] = useState(false)
  if (!hasMenu(event)) return null
  return (
    <span onClick={e => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen(true)} title="See the menu or extra details for this event"
        style={{
          display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700,
          padding: "3px 8px", borderRadius: 20, border: `1px solid ${colour}`, color: colour,
          background: "transparent", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
        }}>
        📋 Menu/View Details
      </button>
      {open && <MenuModal event={event} colour={colour} onClose={() => setOpen(false)} />}
    </span>
  )
}
