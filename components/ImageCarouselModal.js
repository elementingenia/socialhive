"use client"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

// Multi-image carousel modal -- genuinely new in this app (Iain, 2026-09-21:
// "a grid of the images, clicking an image opens it in another modal which
// functions as a carousel of all images in the post with user being able to
// CLOSE - MOVE BACK - MOVE FORWARD"). The only prior lightbox in this repo
// (components/LocationScheduleView.js's ImageLightbox) is single-image with
// no prev/next -- confirmed by reading it, not assumed -- so this is a new
// component, not an extension of that one. `photos` is the post's full
// ordered photo array, `startIndex` is which one was tapped in the grid.
function Portal({ children }) {
  if (typeof document === "undefined") return null
  return createPortal(children, document.body)
}

export default function ImageCarouselModal({ photos, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex)

  useEffect(() => { setIndex(startIndex) }, [startIndex])

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft") setIndex(i => (i - 1 + photos.length) % photos.length)
      if (e.key === "ArrowRight") setIndex(i => (i + 1) % photos.length)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [photos.length, onClose])

  if (!photos?.length) return null
  const photo = photos[index]
  const hasMultiple = photos.length > 1

  return (
    <Portal>
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 700,
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1.25rem",
      }}>
        <button onClick={onClose} aria-label="Close" style={{
          position: "absolute", top: 16, right: 16, width: 40, height: 40, borderRadius: "50%",
          background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: "1.3rem",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}>✕</button>

        {hasMultiple && (
          <button onClick={() => setIndex(i => (i - 1 + photos.length) % photos.length)} aria-label="Previous photo" style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.15)",
            border: "none", color: "#fff", fontSize: "1.4rem", cursor: "pointer",
          }}>‹</button>
        )}

        <img src={photo.url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8, objectFit: "contain" }} />

        {hasMultiple && (
          <button onClick={() => setIndex(i => (i + 1) % photos.length)} aria-label="Next photo" style={{
            position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
            width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.15)",
            border: "none", color: "#fff", fontSize: "1.4rem", cursor: "pointer",
          }}>›</button>
        )}

        {hasMultiple && (
          <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
            color: "#fff", fontSize: "0.8rem", fontWeight: 600, background: "rgba(0,0,0,0.4)",
            padding: "0.3rem 0.75rem", borderRadius: 999 }}>
            {index + 1} / {photos.length}
          </div>
        )}
      </div>
    </Portal>
  )
}
