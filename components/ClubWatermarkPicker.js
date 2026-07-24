"use client"
import { useState, useRef, useEffect, useCallback } from "react"
import { authedFetch } from "@/lib/getAuthToken"
import { WATERMARK_EDITOR_ASPECT, computeWatermarkTransform } from "@/lib/clubWatermark"

// Club watermark image uploader + pan/zoom editor (Club visual identity,
// Initiative 1 -- branch spike, reworked 2026-07-24 -- this becomes a feint
// background across the WHOLE club page, not a banner tile). Unlike
// EventImagePicker's single focal-point drag, this lets the admin upload
// EITHER a portrait or landscape photo and both move AND resize it so it
// always fully covers the space -- Iain's ask, 2026-07-24. Position/zoom
// auto-save on drag/slider release, same convention as EventImagePicker's
// focal point. Previewed here at full brightness (so it's actually
// possible to see what you're positioning) -- the live page fades it down
// to a faint watermark, it will NOT look this strong on the real page.
export default function ClubWatermarkPicker({ clubId, imageUrl, posX, posY, zoom, colour, onUpdated }) {
  const [uploading, setUploading]     = useState(false)
  const [localUrl,  setLocalUrl]      = useState(imageUrl || null)
  const [localPosX, setLocalPosX]     = useState(posX ?? 50)
  const [localPosY, setLocalPosY]     = useState(posY ?? 50)
  const [localZoom, setLocalZoom]     = useState(zoom ?? 1)
  const [natural,   setNatural]       = useState(null) // { w, h }
  const [containerSize, setContainerSize] = useState(null) // { w, h }
  const containerRef = useRef(null)
  const dragRef = useRef(null) // { startX, startY, startPosX, startPosY }

  useEffect(() => { setLocalUrl(imageUrl || null) }, [imageUrl])
  useEffect(() => { setLocalPosX(posX ?? 50); setLocalPosY(posY ?? 50); setLocalZoom(zoom ?? 1) }, [posX, posY, zoom, imageUrl])

  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect
      if (r) setContainerSize({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [localUrl])

  const transform = (natural && containerSize)
    ? computeWatermarkTransform({
        containerW: containerSize.w, containerH: containerSize.h,
        naturalW: natural.w, naturalH: natural.h,
        zoom: localZoom, posX: localPosX, posY: localPosY,
      })
    : null

  // Position/zoom go through the service-role /api/clubs/appearance route
  // (admin OR this club's owner -- lib/clubAuth.js), not a direct client
  // write -- clubs' RLS only allows admin writes (migration 045), and this
  // picker is now also used by Owners/Contacts via ClubAppearanceModal, who
  // RLS would otherwise silently block.
  async function saveTransform(nextPosX, nextPosY, nextZoom) {
    await authedFetch("/api/clubs/appearance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ club_id: clubId, image_pos_x: nextPosX, image_pos_y: nextPosY, image_zoom: nextZoom }),
    })
    onUpdated?.({ image_pos_x: nextPosX, image_pos_y: nextPosY, image_zoom: nextZoom })
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

  function onPointerDown(e) {
    if (!transform) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: localPosX, startPosY: localPosY }
  }
  function onPointerMove(e) {
    if (!dragRef.current || e.buttons !== 1 || !transform) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    const { maxOffX, maxOffY } = transform
    const nextPosX = maxOffX > 0 ? clamp(dragRef.current.startPosX - (dx * 50) / maxOffX, 0, 100) : 50
    const nextPosY = maxOffY > 0 ? clamp(dragRef.current.startPosY - (dy * 50) / maxOffY, 0, 100) : 50
    setLocalPosX(nextPosX); setLocalPosY(nextPosY)
  }
  function onPointerUp() {
    if (!dragRef.current) return
    dragRef.current = null
    saveTransform(localPosX, localPosY, localZoom)
  }

  function onZoomChange(e) {
    setLocalZoom(parseFloat(e.target.value))
  }
  function onZoomCommit() {
    saveTransform(localPosX, localPosY, localZoom)
  }

  async function uploadImage(file) {
    setUploading(true)
    const fd = new FormData()
    fd.append("club_id", clubId)
    fd.append("file", file)
    const res = await authedFetch("/api/clubs/image", { method: "POST", body: fd })
    const d = await res.json()
    setUploading(false)
    if (res.ok) {
      setLocalUrl(d.image_url)
      setLocalPosX(d.image_pos_x); setLocalPosY(d.image_pos_y); setLocalZoom(d.image_zoom)
      setNatural(null)
      onUpdated?.({ image_url: d.image_url, image_pos_x: d.image_pos_x, image_pos_y: d.image_pos_y, image_zoom: d.image_zoom })
    }
  }

  async function removeImage() {
    setUploading(true)
    const res = await authedFetch("/api/clubs/image", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ club_id: clubId }),
    })
    setUploading(false)
    if (res.ok) {
      setLocalUrl(null); setNatural(null)
      onUpdated?.({ image_url: null, image_pos_x: 50, image_pos_y: 50, image_zoom: 1 })
    }
  }

  return (
    <div>
      {localUrl && (
        <>
          <div
            ref={containerRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{
              position: "relative", width: "min(100%, 220px)", aspectRatio: WATERMARK_EDITOR_ASPECT,
              borderRadius: 10, overflow: "hidden", marginBottom: 8, margin: "0 auto 8px",
              cursor: "grab", touchAction: "none", background: "var(--surface2)",
              border: "1px solid var(--border)",
            }}
          >
            <img
              src={localUrl}
              alt="Club watermark"
              draggable={false}
              onLoad={e => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
              style={transform ? {
                position: "absolute", width: transform.width, height: transform.height,
                left: transform.left, top: transform.top, pointerEvents: "none", display: "block",
              } : { opacity: 0 }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-dim)", flexShrink: 0 }}>Zoom</span>
            <input
              type="range" min="1" max="3" step="0.05" value={localZoom}
              onChange={onZoomChange} onMouseUp={onZoomCommit} onTouchEnd={onZoomCommit}
              style={{ flex: 1 }}
            />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 8 }}>
            Drag the photo to reposition it, use Zoom to resize -- it always fills the space, portrait or landscape. Shown at full brightness so you can see it clearly; on the actual page it fades to a faint background behind everything.
          </div>
        </>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <label style={{
          flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${colour}`,
          color: colour, fontWeight: 700, fontSize: 13, cursor: uploading ? "not-allowed" : "pointer",
          textAlign: "center", opacity: uploading ? 0.6 : 1, fontFamily: "inherit",
        }}>
          {uploading ? "Uploading…" : localUrl ? "Replace" : "Upload Image"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: "none" }}
            disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }}
          />
        </label>
        {localUrl && (
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
