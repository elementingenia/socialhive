// Profile photos (Iain, 2026-10-27). A resident can upload a photo of
// themselves instead of choosing one of the drawn avatars. Both live in the
// same column, members.avatar_url -- a photo is just an avatar_url that
// points at the profile-photos Storage bucket instead of /avatars/.
//
// Rules agreed with Iain:
//   - Uploading is the resident's choice, so a photo is shown to everyone.
//   - A Private (hide_name) resident cannot have a photo at all. If someone
//     with a photo turns Private on, the photo is removed and they get a
//     drawn avatar instead (DEFAULT_AVATAR unless they choose another).
//   - Residents with no picture show an initials circle in Contacts.
//
// Pure -- no I/O -- so it is safe on both client and server and unit tested
// (tests/unit/profilePhoto.test.mjs).

export const PHOTO_BUCKET = "profile-photos"

export const DRAWN_AVATARS = Array.from({ length: 12 }, (_, i) => `/avatars/avatar_${String(i + 1).padStart(2, "0")}.svg`)
export const DEFAULT_AVATAR = DRAWN_AVATARS[0]

export function isDrawnAvatar(url) {
  return typeof url === "string" && DRAWN_AVATARS.includes(url)
}

// True only for a file in our own profile-photos bucket. Matching the bucket
// path (not just "any http URL") means an arbitrary outside URL can never be
// treated as -- or deleted as -- one of our photos.
export function isProfilePhotoUrl(url) {
  return typeof url === "string" && url.includes(`/storage/v1/object/public/${PHOTO_BUCKET}/`)
}

// Storage object path ("<member id>/<timestamp>.webp") from a public URL.
export function photoPathFromUrl(url) {
  if (!isProfilePhotoUrl(url)) return null
  const path = url.split(`/storage/v1/object/public/${PHOTO_BUCKET}/`)[1]
  return path ? path.split("?")[0] : null
}

// What a Profile save may set avatar_url to. Photos are only ever set by the
// upload route, so a save may keep the photo already stored, pick a drawn
// avatar, or clear it -- never point at some other URL.
export function avatarUrlAllowed(next, current) {
  if (next === null || next === "") return true
  if (isDrawnAvatar(next)) return true
  return isProfilePhotoUrl(next) && next === current
}

// The avatar_url to store after a save. A Private resident can't keep a
// photo: it falls back to a drawn avatar.
export function resolveAvatarForSave({ next, hideName }) {
  if (hideName && isProfilePhotoUrl(next)) return DEFAULT_AVATAR
  return next || null
}

// Up to two initials for the "no picture" circle. "Resident" (a masked
// Private resident) gets none -- a plain circle, so nothing is implied.
export function initialsOf(name) {
  const clean = (name || "").trim()
  if (!clean || clean === "Resident") return ""
  const words = clean.split(/\s+/).filter(w => /[A-Za-z]/.test(w))
  if (!words.length) return ""
  const first = words[0].match(/[A-Za-z]/)[0]
  const last = words.length > 1 ? words[words.length - 1].match(/[A-Za-z]/)[0] : ""
  return (first + last).toUpperCase()
}
