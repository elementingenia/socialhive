import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { resizeImage, MAX_AGE_SECONDS } from "@/lib/imageResize"


// Which events carry their own image.
//   social          — always has
//   any club event  — always has
//   Movies          — ONLY a free-text showing (no movie_id). A film screening
//                     uses the film's poster, so an upload would be ignored.
// Shared by POST and DELETE deliberately: when this lived inline in POST only,
// the two could have drifted.
function canCarryImage(event) {
  if (!event) return false
  if (event.hub_type === "social") return true
  if (event.club_id) return true
  return event.hub_type === "movie" && !event.movie_id
}

async function getAdminOrEC(token, eventId) {
  const { data: { user }, error } = await supa.auth.getUser(token)
  if (error || !user) return null
  const { data: member } = await supa.from("members").select("id, is_admin").eq("auth_id", user.id).single()
  if (!member) return null
  if (member.is_admin) return member

  // Check if EC for this event
  const { data: ec } = await supa
    .from("event_coordinators")
    .select("id")
    .eq("event_id", eventId)
    .eq("member_id", member.id)
    .single()
  return ec ? member : null
}

// POST — upload image for an event
export async function POST(req) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  const formData = await req.formData()
  const eventId = formData.get("event_id")
  const file = formData.get("file")

  if (!eventId || !file) return NextResponse.json({ error: "event_id and file required" }, { status: 400 })

  const member = await getAdminOrEC(token, eventId)
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Social events and club events both carry an image (a club event's picture
  // is its theme cue — Iain 2026-07-18).
  //
  // Movies USED to be excluded here because a screening took its picture from
  // the film poster. That stopped being true on 2026-07-31: a Movies event can
  // now be a free-text SHOWING with no film — an AFL Grand Final — and its
  // uploaded image IS the poster. A film screening is still excluded, because
  // it has one already.
  const { data: event } = await supa.from("events").select("hub_type, club_id, movie_id, image_url").eq("id", eventId).single()
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 })
  if (!canCarryImage(event)) {
    return NextResponse.json({ error: "Image upload isn't supported for this event type" }, { status: 400 })
  }

  // Delete existing image if present. Must strip the `?t=` cache-busting
  // query string before removing -- without this, remove() is given a key
  // that never matches a real object (silently no-ops), and the old file
  // is orphaned in Storage forever every time the cover's extension
  // changes on re-upload. Confirmed as the root cause of 2 real orphaned
  // files in production (2026-08-23) -- DELETE below already had this
  // fix; POST never did.
  if (event.image_url) {
    const oldPath = event.image_url.split("/event-images/").pop()?.split("?")[0]
    if (oldPath) await supa.storage.from("event-images").remove([oldPath])
  }

  // Resize/re-encode before upload -- see lib/imageResize.js for why.
  const rawBytes = Buffer.from(await file.arrayBuffer())
  const { buffer: bytes, contentType, ext } = await resizeImage(rawBytes)
  const path = `${eventId}/cover.${ext}`

  const { error: upErr } = await supa.storage
    .from("event-images")
    .upload(path, bytes, { contentType, upsert: true, cacheControl: MAX_AGE_SECONDS })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: { publicUrl } } = supa.storage.from("event-images").getPublicUrl(path)

  // Cache-bust the URL
  const imageUrl = `${publicUrl}?t=${Date.now()}`

  const { error: ue } = await supa.from("events").update({ image_url: imageUrl }).eq("id", eventId)
  if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })

  return NextResponse.json({ ok: true, image_url: imageUrl })
}

// DELETE — remove image for an event
export async function DELETE(req) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  const { event_id } = await req.json()
  if (!event_id) return NextResponse.json({ error: "event_id required" }, { status: 400 })

  const member = await getAdminOrEC(token, event_id)
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: event } = await supa.from("events").select("image_url").eq("id", event_id).single()
  if (event?.image_url) {
    const oldPath = event.image_url.split("/event-images/").pop()?.split("?")[0]
    if (oldPath) await supa.storage.from("event-images").remove([oldPath])
  }

  const { error: ue } = await supa.from("events").update({ image_url: null }).eq("id", event_id)
  if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
