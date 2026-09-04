import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { resizeImage, MAX_AGE_SECONDS } from "@/lib/imageResize"

// Location image upload -- Social_Hive_Location_First_Booking_Scope_v2.md,
// item 6 (Iain, 2026-08-17). Admin-only (locations aren't owned by an EC/
// coordinator the way an event is, so there's no equivalent "or EC" case
// here -- unlike app/api/events/image/route.js, which this otherwise mirrors
// exactly: same upsert-by-fixed-path pattern, same cache-busting query param,
// same delete-old-file-before-upload-new-one behaviour).
//
// Requires a "location-images" bucket in Supabase Storage (public read),
// created the same way "event-images" was -- this route does not create it.

async function getAdmin(token) {
  const { data: { user }, error } = await supa.auth.getUser(token)
  if (error || !user) return null
  const { data: member } = await supa.from("members").select("id, is_admin").eq("auth_id", user.id).single()
  return member?.is_admin ? member : null
}

// POST — upload image for a location
export async function POST(req) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  const admin = await getAdmin(token)
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const formData = await req.formData()
  const locationId = formData.get("location_id")
  const file = formData.get("file")
  if (!locationId || !file) return NextResponse.json({ error: "location_id and file required" }, { status: 400 })

  const { data: location } = await supa.from("locations").select("id, image_url").eq("id", locationId).single()
  if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 })

  if (location.image_url) {
    const oldPath = location.image_url.split("/location-images/").pop()?.split("?")[0]
    if (oldPath) await supa.storage.from("location-images").remove([oldPath])
  }

  // Resize/re-encode before upload -- see lib/imageResize.js for why.
  const rawBytes = Buffer.from(await file.arrayBuffer())
  let bytes, contentType, ext
  try {
    ({ buffer: bytes, contentType, ext } = await resizeImage(rawBytes))
  } catch (err) {
    return NextResponse.json({ error: err.message || "Could not process that image" }, { status: 400 })
  }
  const path = `${locationId}/cover.${ext}`

  const { error: upErr } = await supa.storage
    .from("location-images")
    .upload(path, bytes, { contentType, upsert: true, cacheControl: MAX_AGE_SECONDS })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: { publicUrl } } = supa.storage.from("location-images").getPublicUrl(path)
  const imageUrl = `${publicUrl}?t=${Date.now()}`

  const { error: ue } = await supa.from("locations").update({ image_url: imageUrl }).eq("id", locationId)
  if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })

  return NextResponse.json({ ok: true, image_url: imageUrl })
}

// DELETE — remove image for a location
export async function DELETE(req) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  const admin = await getAdmin(token)
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { location_id } = await req.json()
  if (!location_id) return NextResponse.json({ error: "location_id required" }, { status: 400 })

  const { data: location } = await supa.from("locations").select("image_url").eq("id", location_id).single()
  if (location?.image_url) {
    const oldPath = location.image_url.split("/location-images/").pop()?.split("?")[0]
    if (oldPath) await supa.storage.from("location-images").remove([oldPath])
  }

  const { error: ue } = await supa.from("locations").update({ image_url: null }).eq("id", location_id)
  if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
