import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"


// Same auth/authz split as app/api/events/image/route.js (added
// 2026-09-04) -- an expired token and a valid-but-unauthorised member used
// to both collapse into a flat 403 "Forbidden", which silently disabled
// authedFetch's stale-token retry (it only fires on 401). See that file's
// comment for the full history.
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
    if (!member || member.unauthenticated || member.forbidden) return authErrorResponse(member)

    const { data: event } = await supa.from("events").select("hub_type, menu_url").eq("id", eventId).single()
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 })
    // 'special' added 2026-09-04 -- Special Events cloned this same Menu/
    // Additional Info UI from Social's event form, but this allowlist was
    // never widened to match, so any attempt 400'd (surfaced via setError,
    // unlike Event Image's silent version of the same class of bug).
    if (event.hub_type !== "social" && event.hub_type !== "special") {
      return NextResponse.json({ error: "Menu upload only supported for Social Hive and Special Events" }, { status: 400 })
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
  if (!member || member.unauthenticated || member.forbidden) return authErrorResponse(member)

  const { data: event } = await supa.from("events").select("hub_type, menu_url").eq("id", eventId).single()
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 })
  if (event.hub_type !== "social" && event.hub_type !== "special") {
    return NextResponse.json({ error: "Menu upload only supported for Social Hive and Special Events" }, { status: 400 })
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
  if (!member || member.unauthenticated || member.forbidden) return authErrorResponse(member)

  const { data: event } = await supa.from("events").select("menu_url").eq("id", event_id).single()
  await removeExistingMenuFile(event)

  const { error: ue } = await supa.from("events").update({
    menu_url: null, menu_file_name: null, menu_type: null,
  }).eq("id", event_id)
  if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
