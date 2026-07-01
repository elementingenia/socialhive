"use client"
import { useState } from "react"

// Shared "Event Image" uploader + focal-point picker.
// Lives in the event create/edit form (not the booking modal) — image upload
// requires an existing event_id, so pass null/undefined until the event has
// been created at least once.
export default function EventImagePicker({ eventId, imageUrl, focalX, focalY, colour, getToken, onUpdated }) {
  const [uploading,     setUploading]     = useState(false)
  const [localImageUrl, setLocalImageUrl] = useState(imageUrl || null)
  const [localFocalX,   setLocalFocalX]   = useState(focalX ?? 50)
  const [localFocalY,   setLocalFocalY]   = useState(focalY ?? 50)

  function updateFocalFromPointer(e, el) {
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    setLocalFocalX(x); setLocalFocalY(y)
    return { x, y }
  }

  async function saveFocal(x, y) {
    const token = await getToken()
    await fetch("/api/coordinator", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event_id: eventId, action: "update_event", image_focal_x: x, image_focal_y: y }),
    })
    onUpdated?.()
  }

  function startFocalDrag(e) {
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    updateFocalFromPointer(e, el)
  }
  function dragFocal(e) {
    if (e.buttons !== 1) return
    updateFocalFromPointer(e, e.currentTarget)
  }
  function endFocalDrag(e) {
    const { x, y } = updateFocalFromPointer(e, e.currentTarget)
    saveFocal(x, y)
  }

  async function uploadImage(file) {
    setUploading(true)
    const token = await getToken()
    const fd = new FormData()
    fd.append("event_id", eventId)
    fd.append("file", file)
    const res = await fetch("/api/events/image", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    })
    const d = await res.json()
    setUploading(false)
    if (res.ok) {
      setLocalImageUrl(d.image_url)
      onUpdated?.()
    }
  }

  async function removeImage() {
    setUploading(true)
    const token = await getToken()
    const res = await fetch("/api/events/image", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event_id: eventId }),
    })
    setUploading(false)
    if (res.ok) {
      setLocalImageUrl(null)
      onUpdated?.()
    }
  }

  return (
    <div>
      {localImageUrl && (
        <>
          <div
            onPointerDown={startFocalDrag}
            onPointerMove={dragFocal}
            onPointerUp={endFocalDrag}
            style={{
              position: "relative", width: "100%", height: 160, borderRadius: 10,
              overflow: "hidden", marginBottom: 6, cursor: "crosshair", touchAction: "none",
            }}
          >
            <img
              src={localImageUrl}
              alt="Event"
              draggable={false}
              style={{
                width: "100%", height: "100%", objectFit: "cover",
                objectPosition: `${localFocalX}% ${localFocalY}%`, display: "block", pointerEvents: "none",
              }}
            />
            <div style={{
              position: "absolute", left: `${localFocalX}%`, top: `${localFocalY}%`,
              width: 18, height: 18, marginLeft: -9, marginTop: -9,
              borderRadius: "50%", border: "2px solid #fff", background: colour,
              boxShadow: "0 0 0 1px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.4)", pointerEvents: "none",
            }} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 8 }}>
            Drag the pin to set the focus point — keeps the important part of the photo visible when it's cropped to different shapes around the app.
          </div>
        </>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <label style={{
          flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${colour}`,
          color: colour, fontWeight: 700, fontSize: 13, cursor: uploading ? "not-allowed" : "pointer",
          textAlign: "center", opacity: uploading ? 0.6 : 1, fontFamily: "inherit",
        }}>
          {uploading ? "Uploading…" : localImageUrl ? "Replace" : "Upload Image"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: "none" }}
            disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }}
          />
        </label>
        {localImageUrl && (
          <button
            onClick={removeImage}
            disabled={uploading}
            type="button"
            style={{
              padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--surface2)", color: "var(--danger)", fontWeight: 700,
              fontSize: 13, cursor: uploading ? "not-allowed" : "pointer", fontFamily: "inherit",
            }}>Remove</button>
        )}
      </div>
    </div>
  )
}
