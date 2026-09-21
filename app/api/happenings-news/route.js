import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { requireHappeningsNewsCreate } from "@/lib/happeningsNewsAuth"
import { isValidContentLength, MAX_CONTENT_LENGTH, originLabel } from "@/lib/happeningsNewsTier"

export const dynamic = "force-dynamic"

const POST_SELECT = "id, event_id, member_id, content, primary_photo_id, created_at, edited_at, " +
  "members(name), " +
  "events(id, title, event_date, event_time, hub_type, club_id, clubs!club_id(name, slug, colour)), " +
  "happenings_news_photos(id, url, position, is_primary, archived_at)"

function shapePost(row) {
  const photos = (row.happenings_news_photos || []).sort((a, b) => a.position - b.position)
  const primaryPhoto = photos.find(p => p.id === row.primary_photo_id) || photos[0] || null
  return {
    id: row.id,
    event_id: row.event_id,
    content: row.content,
    created_at: row.created_at,
    edited_at: row.edited_at,
    poster_name: row.members?.name || "A coordinator",
    event: row.events ? {
      id: row.events.id,
      title: row.events.title,
      event_date: row.events.event_date,
      event_time: row.events.event_time,
      hub_type: row.events.hub_type,
      club_id: row.events.club_id,
      club_name: row.events.clubs?.name || null,
      club_colour: row.events.clubs?.colour || null,
    } : null,
    origin_label: row.events ? originLabel({ hubType: row.events.hub_type, clubName: row.events.clubs?.name }) : null,
    primary_photo: primaryPhoto ? { id: primaryPhoto.id, url: primaryPhoto.url } : null,
    photo_count: photos.length,
    photos: photos.map(p => ({ id: p.id, url: p.url, position: p.position, is_primary: p.id === row.primary_photo_id, archived: !!p.archived_at })),
  }
}

// GET — the flat chronological feed (most recent first), any authenticated
// resident. ?limit=N for the Home tile (latest post only). Deliberately
// NOT grouped by hub/club server-side -- confirmed with Iain 2026-09-21
// ("news posts should be sorted in date and time order, not grouped in any
// other way") -- origin_label above is display metadata on each row, not a
// query-level grouping.
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 100)

  const { data, error } = await supa
    .from("happenings_news_posts")
    .select(POST_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ posts: (data || []).map(shapePost) })
}

// POST — create a post. Text only; photos are uploaded afterward via
// /api/happenings-news/photos (same "create the resource, then attach
// files to it" shape as event image upload) so a large multipart payload
// never blocks the initial create.
export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const { event_id, content } = body
  if (!event_id || !content) return NextResponse.json({ error: "event_id and content are required" }, { status: 400 })
  if (!isValidContentLength(content)) {
    return NextResponse.json({ error: `Article text must be between 1 and ${MAX_CONTENT_LENGTH} characters` }, { status: 400 })
  }

  const { error, status, member } = await requireHappeningsNewsCreate(req, event_id)
  if (error) return NextResponse.json({ error }, { status })

  const { data: post, error: insErr } = await supa
    .from("happenings_news_posts")
    .insert({ event_id, member_id: member.id, content: content.trim() })
    .select("id").single()

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: post.id })
}
