import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { resizeImage, MAX_AGE_SECONDS } from "@/lib/imageResize"
import { requireAdminOrAreaOwner, requireVotingEventManage } from "@/lib/areaAuth"
import { VOTING_CHOICE_IMAGE_PREFIX } from "@/lib/voting"

// Voting option image upload (Iain, 2026-10-22: "Need to be able to upload
// an image for voting options"). Uploads only -- the returned URL is saved
// onto the option when the vote is created or edited (POST /api/voting,
// PATCH /api/voting/[id]), which is also where images are locked to Draft
// and where replaced/removed images are deleted from Storage.
//
// Who: with ?event_id, anyone who can manage that vote (admin, Voting Owner,
// any of its coordinators). Without one (the create form, before the vote
// exists), whoever can create a vote (admin or Voting Owner).
//
// Same bucket and resize as the vote's own cover image
// (app/api/voting/[id]/image/route.js). The browser shrinks the photo first
// (lib/clientImageResize.js) so it stays under Vercel's 4.5MB body limit.
export const dynamic = "force-dynamic"

export async function POST(req) {
  const eventId = new URL(req.url).searchParams.get("event_id")
  const auth = eventId
    ? await requireVotingEventManage(req, eventId)
    : await requireAdminOrAreaOwner(req, "hub", "voting")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let file
  try {
    file = (await req.formData()).get("file")
  } catch {
    return NextResponse.json({ error: "Could not read the upload" }, { status: 400 })
  }
  if (!file || typeof file.arrayBuffer !== "function") return NextResponse.json({ error: "file required" }, { status: 400 })

  let bytes, contentType, ext
  try {
    ({ buffer: bytes, contentType, ext } = await resizeImage(Buffer.from(await file.arrayBuffer())))
  } catch (err) {
    return NextResponse.json({ error: err.message || "Could not process that image" }, { status: 400 })
  }

  const path = `${VOTING_CHOICE_IMAGE_PREFIX}${randomUUID()}.${ext}`
  const { error: upErr } = await supa.storage
    .from("event-images")
    .upload(path, bytes, { contentType, upsert: false, cacheControl: MAX_AGE_SECONDS })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: { publicUrl } } = supa.storage.from("event-images").getPublicUrl(path)
  return NextResponse.json({ ok: true, image_url: publicUrl })
}
