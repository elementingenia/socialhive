"use client"
// Small profile picture circle (Iain, 2026-10-27) -- the same 30px size as
// the avatar in the Header's account pill. Shows, in order:
//   a profile photo  -> tappable, opens a bigger view
//   a drawn avatar   -> not tappable (nothing more to see)
//   neither          -> initials circle (plain circle for a masked resident)
import { useState } from "react"
import { createPortal } from "react-dom"
import { isProfilePhotoUrl, initialsOf } from "@/lib/profilePhoto"

const ENLARGED = 240

export default function ProfileAvatar({ src, name, size = 30 }) {
  const [open, setOpen] = useState(false)
  const isPhoto = isProfilePhotoUrl(src)
  const circle = {
    width: size, height: size, borderRadius: "50%", flexShrink: 0,
    border: "1.5px solid var(--border)", boxSizing: "border-box",
  }

  if (!src) {
    const initials = initialsOf(name)
    return (
      <span aria-hidden="true" style={{
        ...circle, display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: "var(--surface2)", color: "var(--text-dim)",
        fontSize: Math.round(size * 0.38), fontWeight: 700, lineHeight: 1,
      }}>{initials}</span>
    )
  }

  const img = <img src={src} alt="" loading="lazy" style={{ ...circle, objectFit: "cover", display: "block" }} />
  if (!isPhoto) return img

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={`See ${name || "this resident"}'s photo`}
        style={{ padding: 0, border: "none", background: "none", cursor: "pointer", lineHeight: 0, borderRadius: "50%", flexShrink: 0 }}>
        {img}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div onClick={() => setOpen(false)} role="dialog" aria-label={name ? `${name}'s photo` : "Photo"} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 600,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "var(--surface)", borderRadius: 16, padding: "14px 16px 16px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 10, maxWidth: "100%",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, width: ENLARGED }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, lineHeight: 1, color: "var(--text-dim)" }}>×</button>
            </div>
            <img src={src} alt={name ? `${name}'s photo` : "Photo"} style={{
              width: ENLARGED, height: ENLARGED, maxWidth: "70vw", maxHeight: "70vw",
              borderRadius: 12, objectFit: "cover", display: "block",
            }} />
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
