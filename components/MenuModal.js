"use client"
import { createPortal } from "react-dom"
import { bbToHtml } from "@/components/RichEditor"
import { clubTextOn } from "@/lib/clubColours"

// Menu/Additional Info viewer (Social, Special Events, Groups & Clubs).
// Moved out of EventSlideOut.js (2026-10-07) so the event tile's
// Menu/View Details pill (MenuButton) opens exactly the same viewer as the
// booking modal. Portalled to document.body so it centres on the viewport
// even inside EventSlideOut's transformed panel.
function Portal({ children }) {
  if (typeof document === "undefined") return null
  return createPortal(children, document.body)
}

/** True when the event has a menu/details worth showing. */
export function hasMenu(event) {
  return !!(event?.has_dining && ((event.menu_type === "text" && event.menu_text) || (event.menu_type === "file" && event.menu_url)))
}

export default function MenuModal({ event, colour, onClose }) {
  const isPdf = event.menu_type === "file" && /\.pdf($|\?)/i.test(event.menu_url || "")
  const isImageFile = event.menu_type === "file" && !isPdf

  return (
    <Portal>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 600,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 480,
          maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "14px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0,
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Menu</div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, lineHeight: 1, color: "var(--text-dim)" }}>×</button>
          </div>
          <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
            {event.menu_type === "text" && (
              <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: bbToHtml(event.menu_text, colour) }} />
            )}
            {isPdf && (
              <iframe src={event.menu_url} title="Menu" style={{ width: "100%", height: "60vh", border: "none", borderRadius: 8 }} />
            )}
            {isImageFile && (
              <img src={event.menu_url} alt="Menu" style={{ width: "100%", borderRadius: 8, display: "block" }} />
            )}
          </div>
          {event.menu_type === "file" && event.menu_url && (
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
              <a href={event.menu_url} download={event.menu_file_name || "menu"} target="_blank" rel="noreferrer"
                style={{ display: "block", textAlign: "center", padding: "10px", borderRadius: 10, background: colour, color: clubTextOn(colour), fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
                Download
              </a>
            </div>
          )}
        </div>
      </div>
    </Portal>
  )
}
