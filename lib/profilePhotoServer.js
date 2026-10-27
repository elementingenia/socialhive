// Server-side helpers for profile photos (see lib/profilePhoto.js for the
// rules). Kept apart from the pure module so the client bundle never pulls
// in the service-role client.
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { PHOTO_BUCKET, photoPathFromUrl, isProfilePhotoUrl, DEFAULT_AVATAR } from "@/lib/profilePhoto"

// Delete a stored photo file. Best effort: a leftover file only costs a few
// KB, so a Storage hiccup must never fail the resident's save.
export async function removeStoredPhoto(url) {
  const path = photoPathFromUrl(url)
  if (!path) return
  try { await supabaseAdmin.storage.from(PHOTO_BUCKET).remove([path]) } catch { /* ignore */ }
}

// Called wherever a member is made Private by someone other than their own
// Profile save (admin Contacts edit). Swaps a photo for the default drawn
// avatar and deletes the file.
export async function stripPhotoForPrivate(memberId) {
  const { data } = await supabaseAdmin.from("members").select("avatar_url").eq("id", memberId).maybeSingle()
  if (!isProfilePhotoUrl(data?.avatar_url)) return
  await supabaseAdmin.from("members").update({ avatar_url: DEFAULT_AVATAR }).eq("id", memberId)
  await removeStoredPhoto(data.avatar_url)
}
