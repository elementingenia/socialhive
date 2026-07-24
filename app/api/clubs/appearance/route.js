import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { requireAdminOrClubOwner } from "@/lib/clubAuth"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Club appearance (colour + watermark pan/zoom) -- Iain, 2026-07-24: a
// standalone control, admins and this club's Owners/Contacts only, separate
// from the full Admin > Club Manager form. Image upload/remove still goes
// through /api/clubs/image (Storage write needs its own route); this one
// covers the plain-column fields: colour, image_pos_x, image_pos_y,
// image_zoom. Kept as a single small PATCH rather than folding into
// /api/clubs/image so ClubWatermarkPicker's drag/zoom auto-save and a
// colour swatch click both go through the same lightweight call.
export async function PATCH(req) {
  const body = await req.json()
  const { club_id, colour, image_pos_x, image_pos_y, image_zoom } = body
  if (!club_id) return NextResponse.json({ error: "club_id required" }, { status: 400 })

  const { error, status } = await requireAdminOrClubOwner(req, club_id)
  if (error) return NextResponse.json({ error }, { status })

  const patch = {}
  if (colour !== undefined) patch.colour = colour
  if (image_pos_x !== undefined) patch.image_pos_x = image_pos_x
  if (image_pos_y !== undefined) patch.image_pos_y = image_pos_y
  if (image_zoom !== undefined) patch.image_zoom = image_zoom
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  const { error: ue } = await supa.from("clubs").update(patch).eq("id", club_id)
  if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })

  return NextResponse.json({ ok: true, ...patch })
}
