import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { requireHappeningsNewsManage } from "@/lib/happeningsNewsAuth"
import { resizeImage, MAX_AGE_SECONDS } from "@/lib/imageResize"
import { MAX_PHOTOS_PER_POST, PHOTOS_BUCKET } from "@/lib/happeningsNewsTier"

export const dynamic = "force-dynamic"

// POST — upload one photo onto an existing post. Multipart, mirrors
// app/api/events/image/route.js: resize server-side (lib/imageResize.js)
// before it ever reaches Storage. The FIRST photo added to a post is
// auto-nominated as the primary/headline photo (so a post with exactly one
// photo never sits with no headline chosen) -- the EC can re-nominate any
// time via PATCH /api/happenings-news/[id].
export async function POST(req) {
  const formData = await req.formData()
  const postId = formData.get("post_id")
  const file = formData.get("file")
  if (!postId || !file) return NextResponse.json({ error: "post_id and file are required" }, { status: 400 })

  const { error, status, post } = await requireHappeningsNewsManage(req, postId)
  if (error) return NextResponse.json({ error }, { status })

  const { count } = await supa.from("happenings_news_photos").select("id", { count: "exact", head: true }).eq("post_id", postId)
  if ((count || 0) >= MAX_PHOTOS_PER_POST) {
    return NextResponse.json({ error: `A post can have at most ${MAX_PHOTOS_PER_POST} photos` }, { status: 400 })
  }

  const rawBytes = Buffer.from(await file.arrayBuffer())
  let bytes, contentType, ext
  try {
    ({ buffer: bytes, contentType, ext } = await resizeImage(rawBytes))
  } catch (err) {
    return NextResponse.json({ error: err.message || "Could not process that image" }, { status: 400 })
  }

  const path = `${postId}/${crypto.randomUUID()}.${ext}`
  const { error: upErr } = await supa.storage.from(PHOTOS_BUCKET).upload(path, bytes, { contentType, upsert: false, cacheControl: MAX_AGE_SECONDS })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: { publicUrl } } = supa.storage.from(PHOTOS_BUCKET).getPublicUrl(path)
  const url = `${publicUrl}?t=${Date.now()}`

  const { data: photo, error: insErr } = await supa
    .from("happenings_news_photos")
    .insert({ post_id: postId, url, storage_path: path, position: count || 0 })
    .select("id").single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  if (!count) {
    await supa.from("happenings_news_posts").update({ primary_photo_id: photo.id }).eq("id", postId)
  }

  return NextResponse.json({ ok: true, id: photo.id, url })
}

// DELETE — remove one photo. If it was the post's nominated primary, the
// next remaining photo (lowest position) is auto-promoted so a post never
// silently loses its headline photo without the EC choosing a new one.
export async function DELETE(req) {
  const { photo_id } = await req.json().catch(() => ({}))
  if (!photo_id) return NextResponse.json({ error: "photo_id required" }, { status: 400 })

  const { data: photo } = await supa.from("happenings_news_photos").select("id, post_id, storage_path").eq("id", photo_id).maybeSingle()
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 })

  const { error, status } = await requireHappeningsNewsManage(req, photo.post_id)
  if (error) return NextResponse.json({ error }, { status })

  const { data: post } = await supa.from("happenings_news_posts").select("primary_photo_id").eq("id", photo.post_id).maybeSingle()

  if (photo.storage_path) await supa.storage.from(PHOTOS_BUCKET).remove([photo.storage_path])
  const { error: delErr } = await supa.from("happenings_news_photos").delete().eq("id", photo_id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (post?.primary_photo_id === photo_id) {
    const { data: next } = await supa.from("happenings_news_photos").select("id").eq("post_id", photo.post_id).order("position").limit(1).maybeSingle()
    await supa.from("happenings_news_posts").update({ primary_photo_id: next?.id || null }).eq("id", photo.post_id)
  }

  return NextResponse.json({ ok: true })
}
