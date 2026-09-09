"use client"
import AskQuestion from "@/components/AskQuestion"
import { QuestionIcon } from "@/components/NavIcons"
import { clubInk } from "@/lib/clubColours"

// Shared "Coordinator(s): name, name" line for an event TILE, where the whole
// icon + label + names block is the trigger to ask a question about THIS
// event (routes server-side to the event's coordinators). Used by every
// hub/club event tile so the display + ask behaviour is identical everywhere
// (replaces the old per-hub one-offs). The standalone "Ask about this event"
// button is removed in favour of this — the row itself IS the ask affordance.
//
// Icon: the same QuestionIcon used on the top-nav Questions button
// (components/NavIcons.js) — reusing the canonical asset rather than a new
// glyph, per the standing "ESSENTIAL" icon-reuse rule.
//
// Tap target: the whole row (icon + label + every name), not just the names
// — Iain, 2026-09-09, after a mockup review found the names-only version
// read as a plain link with no visible connection to messaging. Names never
// break mid-word (each one is its own non-wrapping unit); the row wraps
// whole names onto a new line instead.
//
// stopPropagation is essential: tiles are tap-to-open, so tapping the row
// must open the ask modal WITHOUT also opening the tile's slide-out.
export default function EventCoordinators({ eventId, eventTitle, names, colour = "var(--amber)", style, contextType = "event" }) {
  const list = (names || []).filter(Boolean)
  if (!list.length) return null
  const ink = clubInk(colour) // readable on the light card background (no-op for dark colours)
  return (
    <div style={style}>
      <AskQuestion
        contextType={contextType}
        contextKey={eventId}
        contextLabel={eventTitle}
        colour={colour}
        trigger={(open) => (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); open() }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface2)" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none" }}
            style={{
              display: "flex", alignItems: "flex-start", gap: "0.5rem", width: "100%",
              textAlign: "left", background: "none", border: "none",
              padding: "0.3rem", margin: "-0.3rem", borderRadius: 10,
              fontFamily: "inherit", cursor: "pointer",
            }}>
            <span aria-hidden style={{
              flex: "none", width: 22, height: 22, borderRadius: "50%", marginTop: 1,
              background: colour, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <QuestionIcon size={12} />
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: "0.05rem", minWidth: 0 }}>
              <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-dim)" }}>
                Coordinator{list.length > 1 ? "s" : ""}
              </span>
              <span style={{ display: "flex", flexWrap: "wrap", columnGap: "0.3rem", rowGap: "0.05rem" }}>
                {list.map((name, i) => (
                  <span key={name} style={{ whiteSpace: "nowrap", fontWeight: 700, fontSize: "0.85rem", color: ink }}>
                    {name}{i < list.length - 1 ? "," : ""}
                  </span>
                ))}
              </span>
            </span>
          </button>
        )} />
    </div>
  )
}
