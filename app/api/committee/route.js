import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { requireAdminOrAreaOwner } from "@/lib/areaAuth"
import { notifyCommitteeSubscribers } from "@/lib/notifyAudience"
import { resizeImage, MAX_AGE_SECONDS } from "@/lib/imageResize"
import { resolveContentType } from "@/lib/mimeFallback"

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
//
// "Also file this in Documents" (Iain, 2026-09-08, see
// 101_committee_documents.sql) -- when the caller sends doc_category_id
// alongside an attachment, this route ALSO inserts a row into `documents`
// pointing at the same already-uploaded file (one upload, two references
// -- no second copy in Storage), tagged with source_committee_post_id so
// the Committee > Documents tab can find it. doc_title lets the poster
// give it a real document title distinct from the post's own content;
// falls back to the attachment's filename (extension stripped) if left
// blank.
//
// Word docs (.doc/.docx) are allowed here specifically because meeting
// minutes -- the main reason this "also file it" option exists -- are
// usually Word files, not PDFs/images (the original attachment allow-list
// was written before this Documents crossover existed and only covered
// what a "notice" attachment needed).
const ALLOWED_ATTACHMENT_TYPES = [
  "application/pdf", "image/jpeg", "image/png", "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]

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
  let content, pinned, attachmentUrl = null, attachmentName = null, attachmentFileType = null, attachmentFileSize = null
  let docCategoryId = null, docTitle = null

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData()
    content = formData.get("content")?.toString().trim()
    pinned  = formData.get("pinned") === "true"
    const file = formData.get("file")
    // "Also file this in Documents" fields -- only meaningful when a file
    // is actually attached; silently ignored otherwise (see header note).
    docCategoryId = formData.get("doc_category_id")?.toString().trim() || null
    docTitle      = formData.get("doc_title")?.toString().trim() || null

    if (file && typeof file !== "string") {
      // file.type can be an empty string for .doc/.docx on mobile Safari
      // (see lib/mimeFallback.js) -- resolve a real type BEFORE checking
      // the allow-list, or every docx attachment from an iPhone would be
      // wrongly rejected as "not a PDF/JPEG/PNG/WEBP" even though docx is
      // now allowed.
      const declaredType = resolveContentType(file.type, file.name)
      if (!ALLOWED_ATTACHMENT_TYPES.includes(declaredType)) {
        return NextResponse.json({ error: "Attachment must be a PDF, Word document, JPEG, PNG or WEBP" }, { status: 400 })
      }
      const bytes = await file.arrayBuffer()
      let buffer = Buffer.from(bytes)
      let ext = file.name.split(".").pop()
      let uploadContentType = declaredType

      if (declaredType?.startsWith("image/")) {
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
      attachmentFileType = uploadContentType
      attachmentFileSize = buffer.length
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

  // Only fires when there's both an attachment AND a nominated category --
  // same uploaded file, a second reference row, no second upload. A
  // failure here must not fail the post itself (the update is already
  // live); log and let the response still report success, matching how
  // notifyCommitteeSubscribers below is also treated as best-effort.
  let filedAsDocument = false
  if (attachmentUrl && docCategoryId) {
    const fallbackTitle = (attachmentName || "Document").replace(/\.[^.]+$/, "")
    const { error: docErr } = await supa.from("documents").insert({
      title: docTitle || fallbackTitle,
      category_id: docCategoryId,
      file_url: attachmentUrl,
      file_name: attachmentName,
      file_type: attachmentFileType,
      file_size: attachmentFileSize,
      uploaded_by: member.id,
      source_committee_post_id: post.id,
    })
    if (docErr) console.error("committee post: failed to also file attachment in Documents:", docErr.message)
    else filedAsDocument = true
  }

  const plain = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
  const snippet = plain.length > 90 ? plain.slice(0, 88) + "…" : plain
  const notified = await notifyCommitteeSubscribers(supa, null, "committee_post_added", `Committee update: ${snippet}`, "/committee", { excludeMemberId: member.id })

  return NextResponse.json({ ok: true, id: post.id, notified, filedAsDocument })
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
