import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { shrinkImageForArchive } from "@/lib/imageResize"
import { isPostDueForArchive, PHOTOS_BUCKET } from "@/lib/happeningsNewsTier"

// This route reads/writes photos.archived_at and re-processes Storage
// objects it may have just touched -- must never be served stale. See
// app/api/cron/book-return-check/route.js for the same reasoning.
export const dynamic = "force-dynamic"

// Daily catch-all: shrinks every not-yet-archived photo on a post that has
// aged past hub_settings.happenings_news_archive_days (30/90/150, one
// hub-wide setting) down to a small thumbnail, and stamps archived_at.
// Text is never touched -- Iain, 2026-09-21: "Archive means reduce images
// to min possible size... and retain text." The ORIGINAL storage_path/url
// is reused (upsert in place) so nothing else in the app (the post's own
// photo rows, any cached URL) needs to change when a post archives.
//
// Auth: same CRON_SECRET bearer pattern as every other cron route in this
// app (see vercel.json) -- fails closed if unconfigured.
export async function GET(req) {
  const configuredSecret = process.env.CRON_SECRET
  if (!configuredSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 })
  }
  const auth = req.headers.get("authorization") || ""
  if (auth !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const { data: settings } = await supa.from("hub_settings").select("happenings_news_archive_days").eq("hub_type", "happenings_news").maybeSingle()
  const archiveDays = settings?.happenings_news_archive_days || 90

  // Only posts old enough could possibly be due -- narrows the row scan
  // before doing the exact per-post check in JS (same reasoning as
  // book-return-check's own note on why simple JS filtering beat a
  // dotted-path PostgREST filter here).
  const cutoff = new Date(Date.now() - archiveDays * 24 * 60 * 60 * 1000).toISOString()
  const { data: candidatePosts, error } = await supa
    .from("happenings_news_posts")
    .select("id, created_at, happenings_news_photos(id, storage_path, archived_at)")
    .lte("created_at", cutoff)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let postsProcessed = 0, photosShrunk = 0, photoErrors = 0

  for (const post of candidatePosts || []) {
    if (!isPostDueForArchive(post.created_at, archiveDays)) continue
    const pending = (post.happenings_news_photos || []).filter(p => !p.archived_at && p.storage_path)
    if (!pending.length) continue
    postsProcessed++

    for (const photo of pending) {
      try {
        const { data: blob, error: dlErr } = await supa.storage.from(PHOTOS_BUCKET).download(photo.storage_path)
        if (dlErr || !blob) { photoErrors++; continue }
        const buffer = Buffer.from(await blob.arrayBuffer())
        const { buffer: shrunk, contentType } = await shrinkImageForArchive(buffer)
        const { error: upErr } = await supa.storage.from(PHOTOS_BUCKET).upload(photo.storage_path, shrunk, { contentType, upsert: true })
        if (upErr) { photoErrors++; continue }
        await supa.from("happenings_news_photos").update({ archived_at: new Date().toISOString() }).eq("id", photo.id)
        photosShrunk++
      } catch {
        photoErrors++
      }
    }
  }

  return NextResponse.json({ ok: true, archive_days: archiveDays, posts_processed: postsProcessed, photos_shrunk: photosShrunk, photo_errors: photoErrors })
}
