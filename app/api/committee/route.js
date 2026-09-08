import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { requireAdminOrAreaOwner } from "@/lib/areaAuth"
import { notifyCommitteeSubscribers } from "@/lib/notifyAudience"
import { resizeImage, MAX_AGE_SECONDS } from "@/lib/imageResize"

// Committee Notice Board -- see supabase/migrations/097_committee_hub.sql
// for the full decision log. One post type (rich text + optional single
// attachment), Owner/admin create+manage, broadcast-to-all-except-opted-out
// notifications.
//
// POST accepts BOTH a plain JSON body (no attachment) and multipart
// form-data (attachment present) -- same direct-upload pattern
// app/api/info/documents/route.js already uses for the same
// 'community-docs' bucket (small PDFs/images well under Vercel's 4.5MB
// function-body limit, so the signed-upload two-step used for event menus
// isn't needed here).

const ALLOWED_ATTACHMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"]

// GET — list, any authenticated resident (RLS already limits this to
// authenticated reads; this route just adds the pinned-first ordering).
export async function GET() {
  const { data, error } = await supa
    .from("committee_posts")
    .select("id, content, attachment_url, attachment_name, pinned, created_by, created_at, members(name)")
    .eq("archived", false)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ posts: data || [] })
}

// POST — create a post. Owner/admin only.
export async function POST(req) {
  const { error, status, member } = await requireAdminOrAreaOwner(req, "hub", "committee")
  if (error) return NextResponse.json({ error }, { status })

  const contentType = req.headers.get("content-type") || ""
  let content, pinned, attachmentUrl = null, attachmentName = null

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData()
    content = formData.get("content")?.toString().trim()
    pinned  = formData.get("pinned") === "true"
    const file = formData.get("file")

    if (file && typeof file !== "string") {
      if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
        return NextResponse.json({ error: "Attachment must be a PDF, JPEG, PNG or WEBP" }, { status: 400 })
      }
      const bytes = await file.arrayBuffer()
      let buffer = Buffer.from(bytes)
      let ext = file.name.split(".").pop()
      let uploadContentType = file.type

      if (file.type?.startsWith("image/")) {
        try {
          const resized = await resizeImage(buffer)
          buffer = resized.buffer
          uploadContentType = resized.contentType
          ext = resized.ext
        } catch (err) {
          return NextResponse.json({ error: err.message || "Could not process that image" }, { status: 400 })
        }
      }

      const path = `committee/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supa.storage
        .from("community-docs").upload(path, buffer, { contentType: uploadContentType, cacheControl: MAX_AGE_SECONDS })
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

      const { data: { publicUrl } } = supa.storage.from("community-docs").getPublicUrl(path)
      attachmentUrl = publicUrl
      attachmentName = file.name
    }
  } else {
    const body = await req.json().catch(() => ({}))
    content = body.content?.trim()
    pinned = !!body.pinned
  }

  if (!content) return NextResponse.json({ error: "content required" }, { status: 400 })

  const { data: post, error: insError } = await supa.from("committee_posts")
    .insert({ content, pinned: !!pinned, attachment_url: attachmentUrl, attachment_name: attachmentName, created_by: member.id })
    .select("id").single()
  if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })

  const plain = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
  const snippet = plain.length > 90 ? plain.slice(0, 88) + "…" : plain
  const notified = await notifyCommitteeSubscribers(supa, null, "committee_post_added", `Committee update: ${snippet}`, "/committee", { excludeMemberId: member.id })

  return NextResponse.json({ ok: true, id: post.id, notified })
}

// PATCH — edit content/pinned, or toggle archive. Owner/admin only.
export async function PATCH(req) {
  const { id, content, pinned, archived } = await req.json()
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { error, status } = await requireAdminOrAreaOwner(req, "hub", "committee")
  if (error) return NextResponse.json({ error }, { status })

  const update = {}
  if (content !== undefined) update.content = content
  if (pinned !== undefined) update.pinned = !!pinned
  if (archived !== undefined) update.archived = !!archived

  const { error: upErr } = await supa.from("committee_posts").update(update).eq("id", id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — archive (never a hard delete, same convention as club_notices).
export async function DELETE(req) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { error, status } = await requireAdminOrAreaOwner(req, "hub", "committee")
  if (error) return NextResponse.json({ error }, { status })

  const { error: delError } = await supa.from("committee_posts").update({ archived: true }).eq("id", id)
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
