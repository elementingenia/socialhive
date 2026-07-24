import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { requireAdminOrClubOwner } from "@/lib/clubAuth"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Club watermark image upload/remove. Widened 2026-07-24 from admin-only to
// admin-or-this-club's-owner (lib/clubAuth.js) -- Iain's ask: Club
// Contacts/Owners should be able to set their own club's background, not
// just admins. Reuses the existing "event-images" storage bucket rather
// than provisioning a new one, under a clubs/ prefix so the two never
// collide.

// POST — upload/replace a club's watermark image. Resets pan/zoom to centred
// defaults on every new upload -- an old crop position almost never makes
// sense against a differently-shaped new photo, and leaving it stale would
// silently mis-crop the new image until someone notices and re-adjusts it.
export async function POST(req) {
  const formData = await req.formData()
  const clubId = formData.get("club_id")
  const file = formData.get("file")
  if (!clubId || !file) return NextResponse.json({ error: "club_id and file required" }, { status: 400 })

  const { error, status } = await requireAdminOrClubOwner(req, clubId)
  if (error) return NextResponse.json({ error }, { status })

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
  const { club_id } = await req.json()
  if (!club_id) return NextResponse.json({ error: "club_id required" }, { status: 400 })

  const { error, status } = await requireAdminOrClubOwner(req, club_id)
  if (error) return NextResponse.json({ error }, { status })

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
