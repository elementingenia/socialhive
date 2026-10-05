import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { resizeImage, MAX_AGE_SECONDS } from "@/lib/imageResize"
import { requireSwapMember } from "@/lib/swapServer"
import { MAX_PHOTOS, PHOTOS_BUCKET } from "@/lib/swap"

export const dynamic = "force-dynamic"

async function ownListing(listingId, memberId) {
  const { data } = await supa.from("swap_listings").select("id, member_id, main_photo_id, hidden_at").eq("id", listingId).maybeSingle()
  if (!data) return { error: "Listing not found", status: 404 }
  if (data.member_id !== memberId) return { error: "Only the person who listed this can change its photos", status: 403 }
  if (data.hidden_at) return { error: "An admin has taken this listing down.", status: 403 }
  return { listing: data }
}

// POST -- add one photo (multipart: listing_id, file). Resized server-side
// (lib/imageResize.js) before it reaches Storage; the client also shrinks it
// first (lib/clientImageResize.js) so it stays under Vercel's 4.5MB body
// limit. The first photo becomes the main photo automatically.
export async function POST(req) {
  const ctx = await requireSwapMember(req)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const formData = await req.formData()
  const listingId = formData.get("listing_id")
  const file = formData.get("file")
  if (!listingId || !file) return NextResponse.json({ error: "listing_id and file are required" }, { status: 400 })

  const own = await ownListing(listingId, ctx.member.id)
  if (own.error) return NextResponse.json({ error: own.error }, { status: own.status })

  const { count } = await supa.from("swap_listing_photos").select("id", { count: "exact", head: true }).eq("listing_id", listingId)
  if ((count || 0) >= MAX_PHOTOS) {
    return NextResponse.json({ error: `A listing can have at most ${MAX_PHOTOS} photos` }, { status: 400 })
  }

  let bytes, contentType, ext
  try {
    ({ buffer: bytes, contentType, ext } = await resizeImage(Buffer.from(await file.arrayBuffer())))
  } catch (err) {
    return NextResponse.json({ error: err.message || "Could not process that photo" }, { status: 400 })
  }

  const path = `${listingId}/${crypto.randomUUID()}.${ext}`
  const { error: upErr } = await supa.storage.from(PHOTOS_BUCKET).upload(path, bytes, { contentType, upsert: false, cacheControl: MAX_AGE_SECONDS })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  const { data: { publicUrl } } = supa.storage.from(PHOTOS_BUCKET).getPublicUrl(path)

  const { data: photo, error: insErr } = await supa.from("swap_listing_photos")
    .insert({ listing_id: listingId, url: publicUrl, storage_path: path, position: count || 0 })
    .select("id, url").single()
  if (insErr) {
    await supa.storage.from(PHOTOS_BUCKET).remove([path])
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }
  if (!own.listing.main_photo_id) {
    await supa.from("swap_listings").update({ main_photo_id: photo.id }).eq("id", listingId)
  }
  return NextResponse.json({ ok: true, photo, is_main: !own.listing.main_photo_id })
}

// DELETE -- remove one photo. If it was the main photo, the next one takes over.
export async function DELETE(req) {
  const ctx = await requireSwapMember(req)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { photo_id } = await req.json().catch(() => ({}))
  if (!photo_id) return NextResponse.json({ error: "photo_id required" }, { status: 400 })

  const { data: photo } = await supa.from("swap_listing_photos").select("id, listing_id, storage_path").eq("id", photo_id).maybeSingle()
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 })
  const own = await ownListing(photo.listing_id, ctx.member.id)
  if (own.error) return NextResponse.json({ error: own.error }, { status: own.status })

  const { error: delErr } = await supa.from("swap_listing_photos").delete().eq("id", photo_id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  if (photo.storage_path) await supa.storage.from(PHOTOS_BUCKET).remove([photo.storage_path])

  let mainPhotoId = own.listing.main_photo_id
  if (mainPhotoId === photo_id) {
    const { data: next } = await supa.from("swap_listing_photos").select("id").eq("listing_id", photo.listing_id).order("position").limit(1).maybeSingle()
    mainPhotoId = next?.id || null
    await supa.from("swap_listings").update({ main_photo_id: mainPhotoId }).eq("id", photo.listing_id)
  }
  return NextResponse.json({ ok: true, main_photo_id: mainPhotoId })
}
