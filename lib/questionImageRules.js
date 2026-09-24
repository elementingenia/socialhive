// Pure rules for photos attached to In-App Questions (the initial question
// AND any reply in the thread -- Iain, 2026-09-25). No server/browser
// imports so it can be shared by AskQuestion.js, the Questions page, both
// /api/questions routes and the unit test.
//
// Sizing is done twice, on purpose:
//  1. In the browser (lib/clientImageResize.js) before upload -- a phone
//     photo is 3-5MB, three of them blow straight through Vercel's hard,
//     non-configurable 4.5MB function body limit (FUNCTION_PAYLOAD_TOO_LARGE
//     -- see BUG-040 / app/api/committee/route.js). Downscaling to
//     1600px JPEG first makes each photo a few hundred KB, so all three fit
//     in the one request that carries the question itself, and the upload is
//     quick on mobile data.
//  2. On the server (lib/imageResize.js, sharp) -- authoritative. The client
//     step can be skipped by an old cached bundle or a hand-crafted request,
//     so the server never trusts it: every image is re-encoded to 1600px
//     webp before it reaches Storage, same as every other upload route.

export const MAX_IMAGES_PER_MESSAGE = 3

// Bucket is PRIVATE (unlike event/news images): questions are a private
// channel, and a photo of the inside of someone's home shouldn't sit at a
// public URL. The thread GET hands out short-lived signed URLs instead.
export const QUESTION_IMAGES_BUCKET = "question-images"
export const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour -- long enough to read a thread

// Per-image ceiling on what the server will accept before resizing. The
// browser has already shrunk a normal photo to well under 1MB, so anything
// near this means the client step didn't run.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024

// What the browser step targets.
export const CLIENT_MAX_DIMENSION = 1600
export const CLIENT_JPEG_QUALITY = 0.85

// Whole-request guard, checked in the browser before sending so a resident
// gets a clear message instead of a platform 413. Kept under Vercel's 4.5MB
// with room for the text fields and multipart overhead.
export const MAX_TOTAL_UPLOAD_BYTES = 4 * 1024 * 1024

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"]

export function isAllowedImageType(type) {
  return ALLOWED_IMAGE_TYPES.includes(String(type || "").toLowerCase())
}

// Validates the list of files the server received. Returns an error string
// for the resident, or null if the set is fine. `files` = [{ type, size }].
export function validateImageSet(files) {
  const list = files || []
  if (list.length > MAX_IMAGES_PER_MESSAGE)
    return `You can attach up to ${MAX_IMAGES_PER_MESSAGE} photos.`
  for (const f of list) {
    if (!isAllowedImageType(f.type)) return "Only photos can be attached (JPEG, PNG, WebP, GIF or HEIC)."
    if (!f.size) return "One of the photos was empty. Please choose it again."
    if (f.size > MAX_IMAGE_BYTES) return "One of the photos is too large. Please choose a smaller one."
  }
  return null
}

// A message needs words or at least one photo -- "here's the photo you
// asked for" with no text is a legitimate reply.
export function hasContent(body, imageCount) {
  return !!String(body || "").trim() || (imageCount || 0) > 0
}

// " (2 photos)" suffix for notification text; empty when there are none.
export function photoSuffix(count) {
  if (!count) return ""
  return count === 1 ? " (1 photo)" : ` (${count} photos)`
}
