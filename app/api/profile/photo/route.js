import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { resizeProfilePhoto, MAX_AGE_SECONDS } from "@/lib/imageResize"
import { PHOTO_BUCKET, DEFAULT_AVATAR, isProfilePhotoUrl } from "@/lib/profilePhoto"
import { removeStoredPhoto } from "@/lib/profilePhotoServer"
export const dynamic = "force-dynamic"

// Profile photo upload / removal (Iain, 2026-10-27). The resident's own photo
// only -- there is no admin path to set someone else's.
//
// The browser shrinks the photo before sending it (ProfileSlideOver), so the
// request stays well under Vercel's 4.5MB body limit; this route then crops
// it to a 320px square webp (lib/imageResize.js) so what's stored is tiny.

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

async function getMember(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "")
  if (!token) return { unauthenticated: true }
  const { data: { user }, error } = await supa.auth.getUser(token)
  if (error || !user) return { unauthenticated: true }
  const { data: member } = await supa.from("members").select("id, avatar_url, hide_name").eq("auth_id", user.id).maybeSingle()
  if (!member) return { forbidden: true }
  return member
}

function authError(m) {
  if (m.unauthenticated) return NextResponse.json({ error: "Please sign in again." }, { status: 401 })
  if (m.forbidden) return NextResponse.json({ error: "No resident account is linked to this login." }, { status: 403 })
  return null
}

export async function POST(req) {
  const member = await getMember(req)
  const bad = authError(member)
  if (bad) return bad
  if (member.hide_name) {
    return NextResponse.json({ error: "Your profile is set to Private, so a photo can't be added. Turn off Private first, or choose a drawn avatar." }, { status: 400 })
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get("file")
  if (!file || typeof file === "string") return NextResponse.json({ error: "No photo received." }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "That photo is too large. Try a smaller one." }, { status: 400 })

  let resized
  try {
    resized = await resizeProfilePhoto(Buffer.from(await file.arrayBuffer()))
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }

  // A fresh path per upload, so the long cache life can never show an old photo.
  const path = `${member.id}/${Date.now()}.${resized.ext}`
  const { error: upErr } = await supa.storage.from(PHOTO_BUCKET).upload(path, resized.buffer, {
    contentType: resized.contentType, cacheControl: MAX_AGE_SECONDS, upsert: false,
  })
  if (upErr) return NextResponse.json({ error: "Could not save the photo. Please try again." }, { status: 500 })

  const { data: { publicUrl } } = supa.storage.from(PHOTO_BUCKET).getPublicUrl(path)
  const { error: dbErr } = await supa.from("members").update({ avatar_url: publicUrl }).eq("id", member.id)
  if (dbErr) {
    await supa.storage.from(PHOTO_BUCKET).remove([path])
    return NextResponse.json({ error: "Could not save the photo. Please try again." }, { status: 500 })
  }
  if (isProfilePhotoUrl(member.avatar_url)) await removeStoredPhoto(member.avatar_url)

  return NextResponse.json({ avatar_url: publicUrl, bytes: resized.buffer.length })
}

// Remove the photo. The resident goes back to the default drawn avatar
// (they can pick a different one in the same panel).
export async function DELETE(req) {
  const member = await getMember(req)
  const bad = authError(member)
  if (bad) return bad
  if (!isProfilePhotoUrl(member.avatar_url)) return NextResponse.json({ avatar_url: member.avatar_url || null })
  const { error } = await supa.from("members").update({ avatar_url: DEFAULT_AVATAR }).eq("id", member.id)
  if (error) return NextResponse.json({ error: "Could not remove the photo. Please try again." }, { status: 500 })
  await removeStoredPhoto(member.avatar_url)
  return NextResponse.json({ avatar_url: DEFAULT_AVATAR })
}
