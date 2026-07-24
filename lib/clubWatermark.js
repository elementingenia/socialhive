// Shared constants for the club watermark -- a feint background image that
// covers the whole club page between Header and BottomNav, not a banner
// tile (Club visual identity, Initiative 1 -- branch spike, reworked
// 2026-07-24 after Iain clarified the intended scope).
//
// The editor (ClubWatermarkPicker) previews the crop against a representative
// phone-portrait box, since that's how most residents will actually see it
// (this is a mobile-first community app) -- but the live render measures the
// real viewport, so the exact crop still varies a little by device, the same
// way any responsive full-bleed background does. WATERMARK_PAGE_OPACITY is
// shared so the editor preview and the live page fade the photo by the same
// amount and don't drift apart.
export const WATERMARK_EDITOR_ASPECT = "9 / 16"
export const WATERMARK_PAGE_OPACITY = 0.08

// Given a container's rendered size, an image's natural size, and the
// stored zoom/pos (0-100, same 0=left/top .. 100=right/bottom mental model
// as events' image_focal_x/y, just compounded with zoom here), returns the
// exact { width, height, left, top } to render the <img> at so it always
// fully covers the container -- used identically by the editor preview and
// the live page so what you crop is what residents see.
export function computeWatermarkTransform({ containerW, containerH, naturalW, naturalH, zoom, posX, posY }) {
  if (!containerW || !containerH || !naturalW || !naturalH) return null
  const baseScale = Math.max(containerW / naturalW, containerH / naturalH)
  const scale = baseScale * Math.max(1, zoom || 1)
  const width = naturalW * scale
  const height = naturalH * scale
  const maxOffX = Math.max(0, (width - containerW) / 2)
  const maxOffY = Math.max(0, (height - containerH) / 2)
  const fracX = ((posX ?? 50) - 50) / 50   // -1 .. 1
  const fracY = ((posY ?? 50) - 50) / 50
  const left = (containerW - width) / 2 - fracX * maxOffX
  const top  = (containerH - height) / 2 - fracY * maxOffY
  return { width, height, left, top, maxOffX, maxOffY }
}
