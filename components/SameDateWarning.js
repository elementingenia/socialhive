"use client"
// Same-date soft warning (Event Clash / Space Booking, §5) -- a styled in-app
// modal instead of the browser's native confirm(), which showed the raw
// deployment URL and "says" chrome (Iain, 2026-07-23: "rather not see this at
// all"). ask(events) returns a Promise<boolean> resolved by the user's choice,
// so callers can `if (!await ask(list)) return` exactly like confirm() did.
import { useState, useCallback, useRef } from "react"

export function useSameDateWarning() {
  const [conflict, setConflict] = useState(null) // array of {id, title, hub_type} | null
  const resolveRef = useRef(null)

  const ask = useCallback((events) => new Promise((resolve) => {
    resolveRef.current = resolve
    setConflict(events)
  }), [])

  function respond(v) {
    setConflict(null)
    resolveRef.current?.(v)
    resolveRef.current = null
  }

  const Modal = !conflict ? null : (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500,
      display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, padding: "1.25rem",
        maxWidth: 380, width: "100%", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ fontWeight: 800, fontSize: "1rem", marginBottom: 8 }}>Already something on this date</div>
        <div style={{ fontSize: "0.9rem", color: "var(--text-dim)", marginBottom: 18, lineHeight: 1.5 }}>
          {conflict.map(e => e.title).join(", ")} {conflict.length === 1 ? "is" : "are"} already scheduled that day.
          You can still go ahead if that's fine.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => respond(false)}
            style={{ flex: 1, padding: "0.65rem", borderRadius: 10, border: "1px solid var(--border)",
              background: "var(--surface)", color: "var(--text)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
            Go back
          </button>
          <button type="button" onClick={() => respond(true)}
            style={{ flex: 1, padding: "0.65rem", borderRadius: 10, border: "none",
              background: "var(--danger)", color: "#fff", fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
            Continue anyway
          </button>
        </div>
      </div>
    </div>
  )

  return { ask, Modal }
}
