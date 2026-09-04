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
  // 'special' added 2026-09-04 -- Special Events (hub_type='special') was
  // cloned from Social's event form, including its own Event Image picker,
  // but this allowlist was never widened to match: every upload silently
  // 400'd ("Image upload isn't supported for this event type") with the
  // client swallowing the error (see EventImagePicker.js's uploadImage()),
  // so it looked like nothing happened at all -- Iain, 2026-09-04: "Event
  // Image does not upload after selecting from local files."
  if (event.hub_type === "social" || event.hub_type === "special") return true
  if (event.club_id) return true
  return event.hub_type === "movie" && !event.movie_id
}

// Split into two failure shapes rather than one collapsed "return null" --
// added 2026-09-04 after Iain reported a bare "Forbidden" on Event Image
// upload. An EXPIRED/invalid token (auth.getUser() failing) and a VALID,
// correctly-identified member who just isn't admin/EC on this event are two
// completely different situations, but this used to return the same `null`
// for both, which the caller turned into a flat 403. The client's
// authedFetch wrapper (lib/getAuthToken.js) already knows how to recover
// from a stale/expired token -- but only on a 401, since 403 means "you are
// who you say you are, and that's not enough" and retrying with a fresh
// token of the SAME identity would never help. Collapsing both into 403
// silently disabled that recovery path for the one case it's actually meant
// for -- exactly the "stale-token race" bug class already fixed multiple
// times elsewhere in this app (Coordinator View 2026-07-14, Profile
// 2026-08-20). Returns { unauthenticated: true } for a bad/expired token,
// { forbidden: true } for a real member with no standing on this event, or
// the member row on success.
async function getAdminOrEC(token, eventId) {
  if (!token) return { unauthenticated: true }
  const { data: { user }, error } = await supa.auth.getUser(token)
  if (error || !user) return { unauthenticated: true }
  const { data: member } = await supa.from("members").select("id, is_admin").eq("auth_id", user.id).single()
  // A valid, real Supabase Auth session with NO matching members row is a
  // distinct failure from "you're a resident but not this event's admin/EC"
  // -- added 2026-09-04 after "Forbidden" kept recurring for Iain even after
  // the 401/403 split fix below, on an account that should have been admin.
  // Both used to say the same bare "Forbidden", which made it impossible to
  // tell from the error message alone whether the account itself had lost
  // its members-table link (the same class of drift as the StuartG
  // auth_email bug) or was just correctly not this event's coordinator.
  if (!member) return { forbidden: true, reason: "No resident account is linked to this login." }
  if (member.is_admin) return member

  // Check if EC for this event
  // event_coordinators is a HISTORY table -- a coordinator swap doesn't
  // delete the old row, it stamps replaced_at on it and inserts a new one
  // (see event_coordinators.replaced_at/.replaced_by). This query used to
  // have no replaced_at filter and used .single(), which requires EXACTLY
  // one matching row -- so any event with more than one past coordinator
  // (a swap, a re-assignment) had multiple (event_id, member_id) rows and
  // .single() errored, silently turning a real, CURRENT coordinator into a
  // false "forbidden". Confirmed 2026-09-04: Scampi is Test Event's actual
  // active coordinator but had 5 historical event_coordinators rows, only
  // the most recent with replaced_at IS NULL -- admin worked (it never
  // reaches this query) while Scampi, the real EC, was blocked. Matches the
  // canonical pattern in lib/areaAuth.js's requireEventManage().
  const { data: ec } = await supa
    .from("event_coordinators")
    .select("id")
    .eq("event_id", eventId)
    .eq("member_id", member.id)
    .is("replaced_at", null)
    .maybeSingle()
  return ec ? member : { forbidden: true, reason: "You're not an admin or coordinator for this event." }
}

function authErrorResponse(result) {
  if (result?.unauthenticated) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  return NextResponse.json({ error: result?.reason || "Forbidden" }, { status: 403 })
}

// POST — upload image for an event
export async function POST(req) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  const formData = await req.formData()
  const eventId = formData.get("event_id")
  const file = formData.get("file")

  if (!eventId || !file) return NextResponse.json({ error: "event_id and file required" }, { status: 400 })

  const member = await getAdminOrEC(token, eventId)
  if (!member || member.unauthenticated || member.forbidden) return authErrorResponse(member)

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
  // Wrapped 2026-09-04: an unhandled throw here used to crash this whole
  // request into an opaque, empty-body 500 -- confirmed live, sharp
  // genuinely throws on a malformed/corrupt image buffer rather than
  // returning a clean error.
  const rawBytes = Buffer.from(await file.arrayBuffer())
  let bytes, contentType, ext
  try {
    ({ buffer: bytes, contentType, ext } = await resizeImage(rawBytes))
  } catch (err) {
    return NextResponse.json({ error: err.message || "Could not process that image" }, { status: 400 })
  }
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
  if (!member || member.unauthenticated || member.forbidden) return authErrorResponse(member)

  const { data: event } = await supa.from("events").select("image_url").eq("id", event_id).single()
  if (event?.image_url) {
    const oldPath = event.image_url.split("/event-images/").pop()?.split("?")[0]
    if (oldPath) await supa.storage.from("event-images").remove([oldPath])
  }

  const { error: ue } = await supa.from("events").update({ image_url: null }).eq("id", event_id)
  if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
