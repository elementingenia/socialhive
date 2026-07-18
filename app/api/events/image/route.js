import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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
  // is its theme cue — Iain 2026-07-18). Movies use the film poster instead.
  const { data: event } = await supa.from("events").select("hub_type, club_id, image_url").eq("id", eventId).single()
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 })
  if (event.hub_type !== "social" && !event.club_id) {
    return NextResponse.json({ error: "Image upload isn't supported for this event type" }, { status: 400 })
  }

  // Delete existing image if present
  if (event.image_url) {
    const oldPath = event.image_url.split("/event-images/").pop()
    if (oldPath) await supa.storage.from("event-images").remove([oldPath])
  }

  const ext = file.name?.split(".").pop() || "jpg"
  const path = `${eventId}/cover.${ext}`
  const bytes = await file.arrayBuffer()

  const { error: upErr } = await supa.storage
    .from("event-images")
    .upload(path, bytes, { contentType: file.type, upsert: true })

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
