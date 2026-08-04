"use client"
// Request Only acknowledgement modal (2026-08-04). Same shape as
// components/SameDateWarning.js's useSameDateWarning() -- ask() returns a
// Promise the caller awaits, resolved only by the single OK button, no
// backdrop-click dismiss and no auto-timeout. Iain, 2026-08-04: the toast
// this replaced auto-dismissed and was too easy to miss for something that
// needs to actually be actioned -- this forces an explicit acknowledgement
// instead, same as SameDateWarning already forces a Go back/Continue choice
// rather than a toast for a same-date clash.
import { useState, useCallback, useRef } from "react"

export function useRequestOnlyAcknowledge() {
  const [locationName, setLocationName] = useState(null) // string | null
  const resolveRef = useRef(null)

  const ask = useCallback((name) => new Promise((resolve) => {
    resolveRef.current = resolve
    setLocationName(name)
  }), [])

  function acknowledge() {
    setLocationName(null)
    resolveRef.current?.()
    resolveRef.current = null
  }

  const Modal = !locationName ? null : (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500,
      display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, padding: "1.25rem",
        maxWidth: 380, width: "100%", boxShadow: "0 12px 40px rgba(0,0,0,0.25)", borderTop: "4px solid var(--amber)" }}>
        <div style={{ fontWeight: 800, fontSize: "1rem", marginBottom: 8 }}>Request Only space</div>
        <div style={{ fontSize: "0.9rem", color: "var(--text-dim)", marginBottom: 18, lineHeight: 1.5 }}>
          <strong style={{ color: "var(--text)" }}>{locationName}</strong> is Request Only — confirm with the
          Ingenia Community Manager if you haven&apos;t already.
        </div>
        <button type="button" onClick={acknowledge}
          style={{ width: "100%", padding: "0.7rem", borderRadius: 10, border: "none",
            background: "var(--amber-dark)", color: "#fff", fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
          OK
        </button>
      </div>
    </div>
  )

  return { ask, Modal }
}
