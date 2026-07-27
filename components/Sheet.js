"use client"
import { createPortal } from "react-dom"

// The app's canonical bottom sheet. Extracted from ResidentEditPanel.js
// (2026-07-27) so it can be used without pulling the whole admin resident-edit
// form into a bundle -- AskQuestion is on Home, which every resident loads.
// ResidentEditPanel re-exports it, so no existing import path changed.
//
// Reuse this rather than hand-rolling a bottom sheet: a bespoke copy drifts on
// z-index, max-height, corner radius and -- the one that actually bites -- the
// Portal. Without the Portal a sheet renders inside whatever transformed or
// positioned ancestor it happens to sit in (Home's grid has position:relative),
// which is how the stacking-context close-button bug happened before.

// Root-level portal -- same pattern already used by EventSlideOut.js's Toast
// (fixed 2026-07-14 for an identical bug class: Cancel Booking's confirm
// dialog rendered off-screen because it inherited a scrolled/positioned
// ancestor instead of the real viewport). Sheet needed the same fix
// 2026-07-24: a caller (ClubHome.js) wraps its own content in
// `position: relative; z-index: 1` for an unrelated reason (keeping page
// content above a fixed background layer), which creates a NEW stacking
// context -- so a Sheet rendered inline deep inside it got capped at
// z-index 1 for stacking purposes, no matter what z-index Sheet itself
// declared, and BottomNav (z-index 100, rendered as a page-level sibling)
// painted straight over it. Portaling to document.body takes Sheet
// completely out of any such ancestor's stacking context, so its own
// z-index (200) is compared directly against page-level chrome as
// intended, regardless of where in the component tree it's opened from.
function Portal({ children }) {
  if (typeof document === "undefined") return null
  return createPortal(children, document.body)
}


// Close/Cancel is never something you have to go hunting for. `footer` is
// an optional second sticky bar pinned to the BOTTOM, for callers that want
// a persistent Save/Done/Cancel action row instead of relying on the header
// X alone -- opt-in, so existing callers (Info>Contacts, Info>Documents)
// are unaffected unless they choose to pass one.
export function Sheet({ open, onClose, title, footer, children }) {
  if (!open) return null
  return (
    <Portal>
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 640, maxHeight: "88vh", overflowY: "auto",
        background: "var(--surface)", borderTopLeftRadius: 20, borderTopRightRadius: 20,
        boxSizing: "border-box",
      }}>
        <div style={{
          position: "sticky", top: 0, zIndex: 2, background: "var(--surface)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "1.25rem 1.25rem 0.85rem", borderBottom: "1px solid var(--border)",
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
        }}>
          <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text)" }}>{title}</div>
          <button onClick={onClose} aria-label="Close" style={{
            background: "none", border: "none", fontSize: "1.3rem", color: "var(--text-dim)",
            cursor: "pointer", lineHeight: 1, padding: 4, fontFamily: "inherit",
          }}>✕</button>
        </div>
        <div style={{ padding: "1.1rem 1.25rem", paddingBottom: footer ? "1.1rem" : "2rem" }}>
          {children}
        </div>
        {footer && (
          <div style={{
            position: "sticky", bottom: 0, zIndex: 2, background: "var(--surface)",
            borderTop: "1px solid var(--border)", padding: "0.75rem 1.25rem",
            paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
            borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
    </Portal>
  )
}
