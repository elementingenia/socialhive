"use client"
import { useState } from "react"
import { supabase } from "@/lib/supabase"

// Location Image uploader + focal-point picker -- Admin > Locations.
// Social_Hive_Location_First_Booking_Scope_v2.md item 6 (Iain, 2026-08-17).
// Mirrors EventImagePicker.js's shape exactly (upload/replace/remove, drag-
// to-set focal point), swapped to /api/locations/image and a direct
// `locations` table update for the focal point -- LocationRow already saves
// its other fields the same direct-supabase-update way (admin-only RLS),
// so this doesn't need its own PATCH route the way the event picker does
// (which goes through /api/coordinator because an event's update path is
// EC-gated, not admin-only).
export default function LocationImagePicker({ locationId, imageUrl, focalX, focalY, colour, getToken, onUpdated }) {
  const [uploading, setUploading] = useState(false)
  const [localImageUrl, setLocalImageUrl] = useState(imageUrl || null)
  const [localFocalX, setLocalFocalX] = useState(focalX ?? 50)
  const [localFocalY, setLocalFocalY] = useState(focalY ?? 50)

  function updateFocalFromPointer(e, el) {
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    setLocalFocalX(x); setLocalFocalY(y)
    return { x, y }
  }

  async function saveFocal(x, y) {
    await supabase.from("locations").update({ image_focal_x: x, image_focal_y: y }).eq("id", locationId)
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
    fd.append("location_id", locationId)
    fd.append("file", file)
    const res = await fetch("/api/locations/image", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd })
    const d = await res.json()
    setUploading(false)
    if (res.ok) { setLocalImageUrl(d.image_url); onUpdated?.() }
  }

  async function removeImage() {
    setUploading(true)
    const token = await getToken()
    const res = await fetch("/api/locations/image", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ location_id: locationId }),
    })
    setUploading(false)
    if (res.ok) { setLocalImageUrl(null); onUpdated?.() }
  }

  return (
    <div>
      {localImageUrl && (
        <>
          <div
            onPointerDown={startFocalDrag} onPointerMove={dragFocal} onPointerUp={endFocalDrag}
            style={{ position: "relative", width: "100%", height: 140, borderRadius: 10, overflow: "hidden", marginBottom: 6, cursor: "crosshair", touchAction: "none" }}
          >
            <img src={localImageUrl} alt="Location" draggable={false}
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${localFocalX}% ${localFocalY}%`, display: "block", pointerEvents: "none" }} />
            <div style={{
              position: "absolute", left: `${localFocalX}%`, top: `${localFocalY}%`,
              width: 18, height: 18, marginLeft: -9, marginTop: -9, borderRadius: "50%", border: "2px solid #fff",
              background: colour, boxShadow: "0 0 0 1px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.4)", pointerEvents: "none",
            }} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 8 }}>
            Drag the pin to set the focus point.
          </div>
        </>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <label style={{
          flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${colour}`, color: colour, fontWeight: 700,
          fontSize: 13, cursor: uploading ? "not-allowed" : "pointer", textAlign: "center", opacity: uploading ? 0.6 : 1, fontFamily: "inherit",
        }}>
          {uploading ? "Uploading…" : localImageUrl ? "Replace" : "Upload Image"}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: "none" }}
            disabled={uploading} onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }} />
        </label>
        {localImageUrl && (
          <button onClick={removeImage} disabled={uploading} type="button" style={{
            padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)",
            color: "var(--danger)", fontWeight: 700, fontSize: 13, cursor: uploading ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}>Remove</button>
        )}
      </div>
    </div>
  )
}
