import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { resizeImage, MAX_AGE_SECONDS } from "@/lib/imageResize"
import {
  QUESTION_IMAGES_BUCKET, SIGNED_URL_TTL_SECONDS, validateImageSet,
} from "@/lib/questionImageRules"

// Server-side helpers for photos on In-App Questions. Service-role only --
// never import from the browser. Rules/limits live in lib/questionImageRules.js.

// Reads a question/reply POST body. Accepts multipart (text fields + up to
// three `images` files) or plain JSON (the pre-photos shape -- kept so an
// old cached bundle posting JSON still works). Returns { fields, files }.
export async function readMessageRequest(req) {
  const ct = req.headers.get("content-type") || ""
  if (ct.includes("multipart/form-data")) {
    const fd = await req.formData()
    const fields = {}
    for (const [k, v] of fd.entries()) if (typeof v === "string") fields[k] = v
    const files = fd.getAll("images").filter(f => f && typeof f !== "string")
    return { fields, files }
  }
  const fields = await req.json().catch(() => ({}))
  return { fields, files: [] }
}

// Validate + resize every image BEFORE anything is written, so a bad photo
// fails the whole send cleanly with nothing half-saved. Returns
// { error } or { processed: [{ buffer, contentType, ext }] }.
export async function prepareImages(files) {
  const err = validateImageSet(files.map(f => ({ type: f.type, size: f.size })))
  if (err) return { error: err }
  const processed = []
  for (const f of files) {
    try {
      processed.push(await resizeImage(Buffer.from(await f.arrayBuffer())))
    } catch (e) {
      return { error: e.isImageProcessingError ? e.message : "Could not process one of the photos." }
    }
  }
  return { processed }
}

// Upload the prepared images and record them against the question (and
// reply, if any). On any failure, removes whatever it already uploaded and
// returns { error } -- the caller then rolls back its own question/reply row.
export async function storeImages(processed, { questionId, replyId = null, memberId }) {
  if (!processed?.length) return { ok: true }
  const uploaded = []
  for (const img of processed) {
    const path = `${questionId}/${crypto.randomUUID()}.${img.ext}`
    const { error } = await supabaseAdmin.storage.from(QUESTION_IMAGES_BUCKET)
      .upload(path, img.buffer, { contentType: img.contentType, upsert: false, cacheControl: MAX_AGE_SECONDS })
    if (error) {
      await removeStoragePaths(uploaded)
      return { error: "Could not save the photos. Please try again." }
    }
    uploaded.push(path)
  }
  const rows = uploaded.map((storage_path, position) => ({
    question_id: questionId, reply_id: replyId, storage_path, position, uploaded_by: memberId,
  }))
  const { error: insErr } = await supabaseAdmin.from("question_images").insert(rows)
  if (insErr) {
    await removeStoragePaths(uploaded)
    return { error: "Could not save the photos. Please try again." }
  }
  return { ok: true }
}

export async function removeStoragePaths(paths) {
  if (!paths?.length) return
  await supabaseAdmin.storage.from(QUESTION_IMAGES_BUCKET).remove(paths)
}

// Every photo on a question, grouped for the thread view:
// { question: [{ url }], replies: { [replyId]: [{ url }] } }.
// URLs are signed (bucket is private) and expire after SIGNED_URL_TTL_SECONDS.
export async function loadThreadImages(questionId) {
  const { data: rows } = await supabaseAdmin.from("question_images")
    .select("reply_id, storage_path, position").eq("question_id", questionId)
    .order("position", { ascending: true })
  const out = { question: [], replies: {} }
  if (!rows?.length) return out
  const { data: signed } = await supabaseAdmin.storage.from(QUESTION_IMAGES_BUCKET)
    .createSignedUrls(rows.map(r => r.storage_path), SIGNED_URL_TTL_SECONDS)
  const urlByPath = Object.fromEntries((signed || []).filter(s => s.signedUrl).map(s => [s.path, s.signedUrl]))
  for (const r of rows) {
    const url = urlByPath[r.storage_path]
    if (!url) continue
    if (r.reply_id) (out.replies[r.reply_id] ||= []).push({ url })
    else out.question.push({ url })
  }
  return out
}

// Storage objects for a question, so DELETE can remove the files before the
// row cascade removes the question_images rows (the cascade can't reach
// Storage on its own).
export async function questionStoragePaths(questionId) {
  const { data } = await supabaseAdmin.from("question_images").select("storage_path").eq("question_id", questionId)
  return (data || []).map(r => r.storage_path)
}
