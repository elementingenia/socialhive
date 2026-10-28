"use client"

// Shared "something is happening, please wait" feedback for Happenings News
// (Iain, 2026-10-29: a button label changing to "Please wait…" was too easy
// to miss -- residents thought nothing was happening. Same look for
// uploading photos, removing a photo and deleting a post, for consistency).
// Plain rgba tints of the Happenings News amber (#b45309), not color-mix()
// -- older iPads (Safari < 16.2) don't support color-mix.
const AMBER = "var(--happenings-news)"
const TINT = "rgba(180, 83, 9, 0.12)"
const RING = "rgba(180, 83, 9, 0.25)"

export function WorkingSpinner({ size = 30, thickness = 4 }) {
  return (
    <span aria-hidden="true" style={{
      flexShrink: 0, display: "inline-block", width: size, height: size, borderRadius: "50%",
      border: `${thickness}px solid ${RING}`, borderTopColor: AMBER, animation: "spin 0.8s linear infinite",
    }} />
  )
}

// title: bold first line. note: smaller second line. done/total: optional
// progress bar (only shown when total > 1).
export default function WorkingPanel({ title, note, done, total, style }) {
  const showBar = typeof total === "number" && total > 1
  return (
    <div role="status" aria-live="polite" style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "0.85rem 1rem", borderRadius: 12, border: `2px solid ${AMBER}`, background: TINT,
      ...style,
    }}>
      <WorkingSpinner />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text)" }}>{title}</div>
        {note && <div style={{ fontSize: "0.85rem", color: "var(--text)", marginTop: 2 }}>{note}</div>}
        {showBar && (
          <div style={{ marginTop: 8, height: 8, borderRadius: 4, background: "var(--surface2)", overflow: "hidden" }}>
            <div style={{ width: `${Math.round(((done || 0) / total) * 100)}%`, height: "100%",
              background: AMBER, transition: "width 0.3s ease" }} />
          </div>
        )}
      </div>
    </div>
  )
}

export const WORKING_TINT = TINT
