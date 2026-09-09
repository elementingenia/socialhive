import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { requireAdminOrAreaOwner } from "@/lib/areaAuth"
import { notifyCommitteeSubscribers } from "@/lib/notifyAudience"
import { resizeImage, MAX_AGE_SECONDS } from "@/lib/imageResize"
import { resolveContentType } from "@/lib/mimeFallback"
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_MB } from "@/lib/attachmentLimits"

// Committee Notice Board -- see supabase/migrations/097_committee_hub.sql
// for the full decision log. One post type (rich text + optional single
// attachment), Owner/admin create+manage, broadcast-to-all-except-opted-out
// notifications.
//
// POST accepts THREE shapes:
//   - plain JSON body, no attachment
//   - multipart form-data, an IMAGE attachment (still resized server-side
//     via lib/imageResize.js before it ever reaches Storage, so it stays
//     well under Vercel's function body limit -- see below)
//   - JSON action:"sign"/"complete", a PDF/Word attachment
//
// Why PDFs/Word docs get a different path (added 2026-09-08, evidence, not
// a guess): a resident's attached .docx failed with "The string did not
// match the expected pattern." -- Storage's own rejection of a bad header,
// see lib/mimeFallback.js -- but fixing that surfaced the REAL failure
// underneath once the MIME issue was resolved: a raw multipart POST to
// this route hands the whole file to our own Vercel function, which hard-
// 413s (FUNCTION_PAYLOAD_TOO_LARGE, non-configurable, confirmed against
// Vercel's own docs) on any request body over 4.5MB -- exactly the same
// failure already diagnosed and fixed for event menus (BUG-040, see
// app/api/events/menu/route.js's header comment). A "resident guide"
// .docx is exactly the kind of file that can land in that danger zone,
// unlike the small notice-attachment PDFs this route was originally sized
// around. Fixed the same way BUG-040 was: the browser uploads the file
// bytes straight to Supabase Storage via a short-lived signed URL, so the
// file itself never passes through this function -- only the small JSON
// action payloads below do. Images are NOT moved onto this path: they're
// resized/re-encoded to webp server-side first (bandwidth reasons, see
// lib/imageResize.js), which requires the bytes to actually reach this
// function -- so they stay on the original small-body multipart route,
// same residual "a resident's un-resized 4.5MB+ original could still
// 413" risk every other image-upload route in this app already carries,
// not a new gap introduced here.
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

// Shared tail end of creating a post, used by every attachment path above
// (none, resized image, or signed-upload PDF/Word) -- one insert + one
// optional "also file in Documents" insert + one notify, instead of three
// near-duplicate copies.
async function finishCommitteePost(member, { content, pinned, attachmentUrl, attachmentName, attachmentFileType, attachmentFileSize, docCategoryId, docTitle }) {
  const { data: post, error: insError } = await supa.from("committee_posts")
    .insert({ content, pinned: !!pinned, attachment_url: attachmentUrl || null, attachment_name: attachmentName || null, created_by: member.id })
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

// POST — create a post, or (JSON action:"sign"/"complete") the two-step
// signed-upload flow for a PDF/Word attachment. Owner/admin only.
export async function POST(req) {
  const { error, status, member } = await requireAdminOrAreaOwner(req, "hub", "committee")
  if (error) return NextResponse.json({ error }, { status })

  const contentType = req.headers.get("content-type") || ""

  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}))

    // Signed-upload flow -- PDF/Word attachments only (see header
    // comment). action:"sign" mints the upload slot; action:"complete"
    // is called once the browser has already uploaded the bytes straight
    // to Storage, and does everything the old multipart branch used to do
    // after the upload (resolve public URL, create the post + optional
    // Documents row).
    if (body.action === "sign") {
      const declaredType = resolveContentType(body.content_type, body.file_name)
      if (!ALLOWED_ATTACHMENT_TYPES.includes(declaredType) || declaredType.startsWith("image/")) {
        return NextResponse.json({ error: "This upload path is for PDF/Word attachments only" }, { status: 400 })
      }
      if (typeof body.file_size === "number" && body.file_size > MAX_ATTACHMENT_BYTES) {
        return NextResponse.json({ error: `Files over ${MAX_ATTACHMENT_MB}MB are not supported.` }, { status: 400 })
      }
      const ext = body.file_name?.split(".").pop() || "pdf"
      const path = `committee/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { data, error: signErr } = await supa.storage
        .from("community-docs").createSignedUploadUrl(path)
      if (signErr) return NextResponse.json({ error: signErr.message }, { status: 500 })
      return NextResponse.json({ path: data.path, token: data.token, content_type: declaredType })
    }

    if (body.action === "complete") {
      const { path, file_name: fileName, content_type: contentTypeRaw, content, pinned, doc_category_id: docCategoryId, doc_title: docTitle } = body
      if (!path || !content?.trim()) return NextResponse.json({ error: "path and content required" }, { status: 400 })

      const { data: { publicUrl } } = supa.storage.from("community-docs").getPublicUrl(path)
      return finishCommitteePost(member, {
        content: content.trim(), pinned,
        attachmentUrl: publicUrl, attachmentName: fileName || null,
        attachmentFileType: resolveContentType(contentTypeRaw, fileName),
        attachmentFileSize: null, // not known without a second round-trip to Storage -- not shown anywhere in the UI, so not worth it
        docCategoryId: docCategoryId?.trim() || null,
        docTitle: docTitle?.trim() || null,
      })
    }

    // Plain JSON post, no attachment at all.
    const content = body.content?.trim()
    if (!content) return NextResponse.json({ error: "content required" }, { status: 400 })
    return finishCommitteePost(member, { content, pinned: !!body.pinned, attachmentUrl: null, attachmentName: null })
  }

  // Multipart form-data -- no attachment, or an IMAGE attachment (resized
  // server-side, see header comment for why this is the one type that
  // stays on the direct-through-the-function path).
  const formData = await req.formData()
  const content = formData.get("content")?.toString().trim()
  const pinned  = formData.get("pinned") === "true"
  const file = formData.get("file")
  const docCategoryId = formData.get("doc_category_id")?.toString().trim() || null
  const docTitle      = formData.get("doc_title")?.toString().trim() || null

  let attachmentUrl = null, attachmentName = null, attachmentFileType = null, attachmentFileSize = null

  if (file && typeof file !== "string") {
    const declaredType = resolveContentType(file.type, file.name)
    if (!declaredType.startsWith("image/")) {
      return NextResponse.json({ error: "Non-image attachments must go through the signed-upload flow" }, { status: 400 })
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: `Files over ${MAX_ATTACHMENT_MB}MB are not supported.` }, { status: 400 })
    }
    const bytes = await file.arrayBuffer()
    let buffer = Buffer.from(bytes)
    let ext = file.name.split(".").pop()
    let uploadContentType = declaredType

    try {
      const resized = await resizeImage(buffer)
      buffer = resized.buffer
      uploadContentType = resized.contentType
      ext = resized.ext
    } catch (err) {
      return NextResponse.json({ error: err.message || "Could not process that image" }, { status: 400 })
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

  if (!content) return NextResponse.json({ error: "content required" }, { status: 400 })

  return finishCommitteePost(member, {
    content, pinned, attachmentUrl, attachmentName, attachmentFileType, attachmentFileSize,
    docCategoryId, docTitle,
  })
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
