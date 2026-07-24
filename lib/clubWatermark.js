// Shared constant for the club watermark banner (Club visual identity,
// Initiative 1 -- branch spike, 2026-07-24). The editor (ClubWatermarkPicker)
// and the live render (ClubHome) MUST use the same aspect ratio, or a crop
// set in the editor won't match what residents actually see. Single source
// here so the two can't drift apart.
export const WATERMARK_ASPECT = "3 / 1"

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
