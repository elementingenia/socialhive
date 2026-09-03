import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"


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

async function removeExistingMenuFile(event) {
  if (!event?.menu_url) return
  const oldPath = event.menu_url.split("/event-menus/").pop()?.split("?")[0]
  if (oldPath) await supa.storage.from("event-menus").remove([oldPath])
}

// POST — upload a menu document for an event (Dining option).
//
// Two-step signed-upload flow (added 2026-09-03, BUG-040): a raw multipart
// POST straight through this route used to hand the whole file to our own
// Vercel function, which silently 413s (FUNCTION_PAYLOAD_TOO_LARGE) on any
// request body over Vercel's hard, non-configurable 4.5MB limit -- confirmed
// against Vercel's own docs, not assumed. The "event-menus" Storage bucket
// itself allows up to 10MB (checked directly via the Storage API), so the
// real ceiling was Vercel's function body limit, not anything Supabase- or
// app-imposed. Fixed by having the browser upload the file bytes straight
// to Supabase Storage using a short-lived signed upload URL -- the file
// never passes through this function at all, so Vercel's request-body limit
// doesn't apply; only the small JSON action payloads below do.
//
// action: "sign"     -> mint a signed upload slot for this event's menu file
// action: "complete" -> called after the browser has uploaded to that slot;
//                       resolves the public URL and updates the event row
export async function POST(req) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  const contentType = req.headers.get("content-type") || ""

  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}))
    const { event_id: eventId, action } = body
    if (!eventId || !action) return NextResponse.json({ error: "event_id and action required" }, { status: 400 })

    const member = await getAdminOrEC(token, eventId)
    if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { data: event } = await supa.from("events").select("hub_type, menu_url").eq("id", eventId).single()
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 })
    if (event.hub_type !== "social") {
      return NextResponse.json({ error: "Menu upload only supported for social events" }, { status: 400 })
    }

    if (action === "sign") {
      const { file_name: fileName, content_type: fileType } = body
      if (!ALLOWED_TYPES.includes(fileType)) {
        return NextResponse.json({ error: "File must be a PDF, JPEG, PNG or WEBP" }, { status: 400 })
      }
      await removeExistingMenuFile(event)

      const ext = fileName?.split(".").pop() || "pdf"
      const path = `${eventId}/menu.${ext}`
      const { data, error: signErr } = await supa.storage
        .from("event-menus")
        .createSignedUploadUrl(path, { upsert: true })
      if (signErr) return NextResponse.json({ error: signErr.message }, { status: 500 })

      return NextResponse.json({ path: data.path, token: data.token })
    }

    if (action === "complete") {
      const { path, file_name: fileName } = body
      if (!path) return NextResponse.json({ error: "path required" }, { status: 400 })

      const { data: { publicUrl } } = supa.storage.from("event-menus").getPublicUrl(path)
      const menuUrl = `${publicUrl}?t=${Date.now()}`

      const { error: ue } = await supa.from("events").update({
        menu_url: menuUrl,
        menu_file_name: fileName || null,
        menu_type: "file",
      }).eq("id", eventId)
      if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })

      return NextResponse.json({ ok: true, menu_url: menuUrl, menu_file_name: fileName || null })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  }

  // Legacy direct-multipart path -- kept for any caller not yet on the
  // signed-upload flow. Still subject to Vercel's 4.5MB function body
  // limit, which is exactly the ceiling the flow above exists to avoid.
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

  await removeExistingMenuFile(event)

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
  await removeExistingMenuFile(event)

  const { error: ue } = await supa.from("events").update({
    menu_url: null, menu_file_name: null, menu_type: null,
  }).eq("id", event_id)
  if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
