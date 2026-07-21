"use client"
import AskQuestion from "@/components/AskQuestion"
import { clubInk } from "@/lib/clubColours"

// Shared "Coordinator(s): name, name" line for an event TILE, where the names
// string is the trigger to ask a question about THIS event (routes server-side
// to the event's coordinators). Used by every hub/club event tile so the
// display + ask behaviour is identical everywhere (replaces the old per-hub
// one-offs). The standalone "Ask about this event" button is removed in favour
// of this — the coordinator names ARE the ask affordance.
//
// stopPropagation is essential: tiles are tap-to-open, so tapping the names must
// open the ask modal WITHOUT also opening the tile's slide-out.
export default function EventCoordinators({ eventId, eventTitle, names, colour = "var(--amber)", style }) {
  const list = (names || []).filter(Boolean)
  if (!list.length) return null
  const ink = clubInk(colour) // readable on the light card background (no-op for dark colours)
  return (
    <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", ...style }}>
      Coordinator{list.length > 1 ? "s" : ""}:{" "}
      <AskQuestion
        contextType="event"
        contextKey={eventId}
        contextLabel={eventTitle}
        colour={colour}
        trigger={(open) => (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); open() }}
            style={{ background: "none", border: "none", padding: 0, margin: 0, fontFamily: "inherit",
              fontSize: "0.8rem", fontWeight: 700, color: ink, textDecoration: "underline", cursor: "pointer" }}>
            {list.join(", ")}
          </button>
        )} />
    </div>
  )
}
