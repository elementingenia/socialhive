import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Club watermark image upload/remove — admin-only (there's no EC concept for
// a club as a whole, unlike an event; Club Manager is already admin-gated).
// Reuses the existing "event-images" storage bucket rather than provisioning
// a new one, under a clubs/ prefix so the two never collide.
async function requireAdmin(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "")
  if (!token) return { error: "Unauthenticated", status: 401 }
  const { data: { user } } = await supa.auth.getUser(token)
  if (!user) return { error: "Unauthenticated", status: 401 }
  const { data: member } = await supa.from("members").select("id, is_admin").eq("auth_id", user.id).maybeSingle()
  if (!member?.is_admin) return { error: "Admin only", status: 403 }
  return { member }
}

// POST — upload/replace a club's watermark image. Resets pan/zoom to centred
// defaults on every new upload -- an old crop position almost never makes
// sense against a differently-shaped new photo, and leaving it stale would
// silently mis-crop the new image until someone notices and re-adjusts it.
export async function POST(req) {
  const { error, status } = await requireAdmin(req)
  if (error) return NextResponse.json({ error }, { status })

  const formData = await req.formData()
  const clubId = formData.get("club_id")
  const file = formData.get("file")
  if (!clubId || !file) return NextResponse.json({ error: "club_id and file required" }, { status: 400 })

  const { data: club } = await supa.from("clubs").select("id, image_url").eq("id", clubId).single()
  if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 })

  if (club.image_url) {
    const oldPath = club.image_url.split("/event-images/").pop()?.split("?")[0]
    if (oldPath) await supa.storage.from("event-images").remove([oldPath])
  }

  const ext = file.name?.split(".").pop() || "jpg"
  const path = `clubs/${clubId}/cover.${ext}`
  const bytes = await file.arrayBuffer()

  const { error: upErr } = await supa.storage
    .from("event-images")
    .upload(path, bytes, { contentType: file.type, upsert: true })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: { publicUrl } } = supa.storage.from("event-images").getPublicUrl(path)
  const imageUrl = `${publicUrl}?t=${Date.now()}`

  const { error: ue } = await supa.from("clubs")
    .update({ image_url: imageUrl, image_pos_x: 50, image_pos_y: 50, image_zoom: 1 })
    .eq("id", clubId)
  if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })

  return NextResponse.json({ ok: true, image_url: imageUrl, image_pos_x: 50, image_pos_y: 50, image_zoom: 1 })
}

// DELETE — remove a club's watermark image entirely.
export async function DELETE(req) {
  const { error, status } = await requireAdmin(req)
  if (error) return NextResponse.json({ error }, { status })

  const { club_id } = await req.json()
  if (!club_id) return NextResponse.json({ error: "club_id required" }, { status: 400 })

  const { data: club } = await supa.from("clubs").select("image_url").eq("id", club_id).single()
  if (club?.image_url) {
    const oldPath = club.image_url.split("/event-images/").pop()?.split("?")[0]
    if (oldPath) await supa.storage.from("event-images").remove([oldPath])
  }

  const { error: ue } = await supa.from("clubs")
    .update({ image_url: null, image_pos_x: 50, image_pos_y: 50, image_zoom: 1 })
    .eq("id", club_id)
  if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
