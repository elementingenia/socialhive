import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { requireHappeningsNewsManage } from "@/lib/happeningsNewsAuth"
import { isValidContentLength, MAX_CONTENT_LENGTH, PHOTOS_BUCKET } from "@/lib/happeningsNewsTier"

export const dynamic = "force-dynamic"

const POST_SELECT = "id, event_id, member_id, content, primary_photo_id, created_at, edited_at, " +
  "members(name), " +
  "events(id, title, event_date, event_time, hub_type, club_id, clubs!club_id(name, colour)), " +
  "happenings_news_photos(id, url, storage_path, position, is_primary, archived_at)"

// GET — single post, full detail (for the slide-out + carousel). Any
// authenticated resident, same read policy as the list route.
export async function GET(req, { params }) {
  const { id } = await params
  const { data: row, error } = await supa.from("happenings_news_posts").select(POST_SELECT).eq("id", id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: "Post not found" }, { status: 404 })

  const photos = (row.happenings_news_photos || []).sort((a, b) => a.position - b.position)
  return NextResponse.json({
    id: row.id,
    event_id: row.event_id,
    content: row.content,
    created_at: row.created_at,
    edited_at: row.edited_at,
    poster_name: row.members?.name || "A coordinator",
    poster_member_id: row.member_id,
    event: row.events,
    primary_photo_id: row.primary_photo_id,
    photos: photos.map(p => ({ id: p.id, url: p.url, position: p.position, is_primary: p.id === row.primary_photo_id, archived: !!p.archived_at })),
  })
}

// PATCH — edit content, and/or re-nominate the primary photo. Same
// admin/Owner/EC gate as create (requireHappeningsNewsManage).
export async function PATCH(req, { params }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { content, primary_photo_id } = body

  const { error, status } = await requireHappeningsNewsManage(req, id)
  if (error) return NextResponse.json({ error }, { status })

  const update = { edited_at: new Date().toISOString() }
  if (content !== undefined) {
    if (!isValidContentLength(content)) {
      return NextResponse.json({ error: `Article text must be between 1 and ${MAX_CONTENT_LENGTH} characters` }, { status: 400 })
    }
    update.content = content.trim()
  }
  if (primary_photo_id !== undefined) {
    if (primary_photo_id) {
      const { data: photo } = await supa.from("happenings_news_photos").select("id").eq("id", primary_photo_id).eq("post_id", id).maybeSingle()
      if (!photo) return NextResponse.json({ error: "That photo doesn't belong to this post" }, { status: 400 })
    }
    update.primary_photo_id = primary_photo_id || null
  }

  const { error: updErr } = await supa.from("happenings_news_posts").update(update).eq("id", id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — remove the post entirely (not archive -- a real delete). Removes
// every photo's Storage object first so nothing is orphaned, same care
// events/image's DELETE already takes for a single cover image.
export async function DELETE(req, { params }) {
  const { id } = await params
  const { error, status } = await requireHappeningsNewsManage(req, id)
  if (error) return NextResponse.json({ error }, { status })

  const { data: photos } = await supa.from("happenings_news_photos").select("storage_path").eq("post_id", id)
  const paths = (photos || []).map(p => p.storage_path).filter(Boolean)
  if (paths.length) await supa.storage.from(PHOTOS_BUCKET).remove(paths)

  const { error: delErr } = await supa.from("happenings_news_posts").delete().eq("id", id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
