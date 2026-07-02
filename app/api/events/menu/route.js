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

  const { data: ec } = await supa
    .from("event_coordinators")
    .select("id")
    .eq("event_id", eventId)
    .eq("member_id", member.id)
    .single()
  return ec ? member : null
}

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"]

// POST — upload a menu document for an event (Dining option)
export async function POST(req) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  const formData = await req.formData()
  const eventId = formData.get("event_id")
  const file = formData.get("file")

  if (!eventId || !file) return NextResponse.json({ error: "event_id and file required" }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "File must be a PDF, JPEG, PNG or WEBP" }, { status: 400 })
  }

  const member = await getAdminOrEC(token, eventId)
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: event } = await supa.from("events").select("hub_type, menu_url").eq("id", eventId).single()
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 })
  if (event.hub_type !== "social") {
    return NextResponse.json({ error: "Menu upload only supported for social events" }, { status: 400 })
  }

  // Remove existing menu file if present
  if (event.menu_url) {
    const oldPath = event.menu_url.split("/event-menus/").pop()?.split("?")[0]
    if (oldPath) await supa.storage.from("event-menus").remove([oldPath])
  }

  const ext = file.name?.split(".").pop() || "pdf"
  const path = `${eventId}/menu.${ext}`
  const bytes = await file.arrayBuffer()

  const { error: upErr } = await supa.storage
    .from("event-menus")
    .upload(path, bytes, { contentType: file.type, upsert: true })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: { publicUrl } } = supa.storage.from("event-menus").getPublicUrl(path)
  const menuUrl = `${publicUrl}?t=${Date.now()}`

  const { error: ue } = await supa.from("events").update({
    menu_url: menuUrl,
    menu_file_name: file.name || null,
    menu_type: "file",
  }).eq("id", eventId)
  if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })

  return NextResponse.json({ ok: true, menu_url: menuUrl, menu_file_name: file.name || null })
}

// DELETE — remove the menu file for an event (also used when switching text <-> file, or clearing)
export async function DELETE(req) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  const { event_id } = await req.json()
  if (!event_id) return NextResponse.json({ error: "event_id required" }, { status: 400 })

  const member = await getAdminOrEC(token, event_id)
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: event } = await supa.from("events").select("menu_url").eq("id", event_id).single()
  if (event?.menu_url) {
    const oldPath = event.menu_url.split("/event-menus/").pop()?.split("?")[0]
    if (oldPath) await supa.storage.from("event-menus").remove([oldPath])
  }

  const { error: ue } = await supa.from("events").update({
    menu_url: null, menu_file_name: null, menu_type: null,
  }).eq("id", event_id)
  if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
