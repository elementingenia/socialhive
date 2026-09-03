import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { resizeImage, MAX_AGE_SECONDS } from "@/lib/imageResize"
import { requireVotingEventManage } from "@/lib/areaAuth"

// Voting Hub — event image (round-5 review, Iain 2026-09-03: "Voting event
// should have an image upload option like other events throughout the
// system"). Mirrors app/api/events/image/route.js's contract (resize/
// re-encode, cache-bust, strip the `?t=` query string before removing the
// old file so a re-upload doesn't orphan it) but targets voting_events
// instead of events, since that table lives outside the shared events
// table entirely and needs its own auth check (requireVotingEventManage --
// admin, Voting Owner, or this specific event's own coordinator, the same
// primitive the rest of this hub already uses, not getAdminOrEC's
// event_coordinators lookup, which doesn't apply here). Reuses the
// existing "event-images" Storage bucket under a voting/ path prefix
// rather than provisioning a second bucket for what's functionally the
// same kind of asset.
export const dynamic = "force-dynamic"

// POST — upload image for a voting event
export async function POST(req, { params }) {
  const { error, status } = await requireVotingEventManage(req, params.id)
  if (error) return NextResponse.json({ error }, { status })

  const formData = await req.formData()
  const file = formData.get("file")
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 })

  const { data: event } = await supa.from("voting_events").select("image_url").eq("id", params.id).single()
  if (!event) return NextResponse.json({ error: "Voting event not found" }, { status: 404 })

  if (event.image_url) {
    const oldPath = event.image_url.split("/event-images/").pop()?.split("?")[0]
    if (oldPath) await supa.storage.from("event-images").remove([oldPath])
  }

  const rawBytes = Buffer.from(await file.arrayBuffer())
  const { buffer: bytes, contentType, ext } = await resizeImage(rawBytes)
  const path = `voting/${params.id}/cover.${ext}`

  const { error: upErr } = await supa.storage
    .from("event-images")
    .upload(path, bytes, { contentType, upsert: true, cacheControl: MAX_AGE_SECONDS })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: { publicUrl } } = supa.storage.from("event-images").getPublicUrl(path)
  const imageUrl = `${publicUrl}?t=${Date.now()}`

  const { error: ue } = await supa.from("voting_events")
    .update({ image_url: imageUrl, image_focal_x: 50, image_focal_y: 50 })
    .eq("id", params.id)
  if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })

  return NextResponse.json({ ok: true, image_url: imageUrl })
}

// DELETE — remove image for a voting event
export async function DELETE(req, { params }) {
  const { error, status } = await requireVotingEventManage(req, params.id)
  if (error) return NextResponse.json({ error }, { status })

  const { data: event } = await supa.from("voting_events").select("image_url").eq("id", params.id).single()
  if (event?.image_url) {
    const oldPath = event.image_url.split("/event-images/").pop()?.split("?")[0]
    if (oldPath) await supa.storage.from("event-images").remove([oldPath])
  }

  const { error: ue } = await supa.from("voting_events").update({ image_url: null }).eq("id", params.id)
  if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
