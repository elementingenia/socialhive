"use client"
import { CLIENT_MAX_DIMENSION, CLIENT_JPEG_QUALITY, MAX_IMAGE_BYTES, isAllowedImageType } from "@/lib/questionImageRules"

// Browser-side downscale before upload (see lib/questionImageRules.js for why
// sizing happens here AND on the server). Draws the photo onto a canvas at
// most CLIENT_MAX_DIMENSION on its long edge and re-encodes as JPEG, turning
// a 3-5MB phone photo into a few hundred KB.
//
// EXIF orientation: createImageBitmap's imageOrientation:"from-image" (and
// modern browsers' default <img> decode) apply it, so a portrait phone photo
// stays upright. The server's sharp .rotate() is the backstop.
//
// Returns a File (JPEG). If this browser can't decode the photo (e.g. HEIC on
// a non-Apple device), falls back to the original file when it's an allowed
// type and small enough for the server to handle; otherwise throws with a
// message a resident can act on.
export async function resizeForUpload(file) {
  let decoded = null
  try {
    decoded = await decode(file)
  } catch {
    if (isAllowedImageType(file.type) && file.size <= MAX_IMAGE_BYTES) return file
    throw new Error("That photo couldn't be read. Try a different one, or save it as a JPEG first.")
  }

  const { source, width, height } = decoded
  const scale = Math.min(1, CLIENT_MAX_DIMENSION / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement("canvas")
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext("2d")
  // White base so a transparent PNG doesn't turn black as a JPEG.
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h)
  ctx.drawImage(source, 0, 0, w, h)
  decoded.close()

  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", CLIENT_JPEG_QUALITY))
  if (!blob) {
    if (file.size <= MAX_IMAGE_BYTES) return file
    throw new Error("That photo couldn't be prepared. Try a different one.")
  }
  const base = (file.name || "photo").replace(/\.[^.]+$/, "")
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" })
}

// Returns { source, width, height, close } -- source is anything drawImage takes.
async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" })
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close?.() }
    } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file)
  const img = await new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = url
  }).catch(e => { URL.revokeObjectURL(url); throw e })
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
}
