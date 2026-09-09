import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'
import { resizeImage, MAX_AGE_SECONDS } from '@/lib/imageResize'
import { resolveContentType } from '@/lib/mimeFallback'
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_MB } from '@/lib/attachmentLimits'
import { isAreaOwner } from '@/lib/areaAuth'
async function getAdminMember(token) {
  if (!token) return null
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data } = await supabaseAdmin
    .from('members').select('id, is_admin').eq('auth_id', user.id).single()
  return data?.is_admin ? data : null
}

// Resolves a member for the upload path only: admin (any category), OR a
// Committee hub Owner uploading specifically to "Committee Meetings"
// (Social_Hive_Committee_Notice_Board_Scope_v3_FINAL decision 5, 2026-09-07).
// Everywhere else in this route (PATCH/DELETE, and every other category)
// stays admin-only, unchanged -- a Committee Owner does not thereby gain
// upload rights to General Documents or Policy Documents.
async function getUploadMember(token, categoryId) {
  if (!token) return null
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: member } = await supabaseAdmin
    .from('members').select('id, is_admin').eq('auth_id', user.id).single()
  if (!member) return null
  if (member.is_admin) return member

  if (categoryId) {
    const { data: category } = await supabaseAdmin
      .from('document_categories').select('name').eq('id', categoryId).maybeSingle()
    if (category && category.name.toLowerCase() === 'committee meetings' && await isAreaOwner(member.id, 'hub', 'committee')) {
      return member
    }
  }
  return null
}

// POST — upload file + insert document record.
//
// Two paths, split by file type (added 2026-09-08, same pattern and same
// reasoning as app/api/committee/route.js's header comment -- read that
// one first if this looks unfamiliar):
//   - IMAGE: multipart form-data straight through this function, resized/
//     re-encoded server-side first (lib/imageResize.js), same as always.
//   - Everything else (PDF/Word): JSON action:"sign"/"complete". This form
//     originally claimed "max 10MB" in its own UI text with NOTHING actually
//     enforcing it anywhere -- and Vercel's hard, non-configurable 4.5MB
//     function-body limit meant a direct multipart upload could never have
//     honoured that promise for a 5-10MB file even if we wanted it to. The
//     signed-upload flow is what makes the limit a real, working one
//     instead of a number nobody checked -- still needed even now the
//     limit itself has been tightened to 4MB (below the old 4.5MB Vercel
//     ceiling), since this same route also serves images resized in-band.
//
// MAX_ATTACHMENT_BYTES (lib/attachmentLimits.js) is enforced here too, not
// just client-side -- never trust the browser alone for a hard reject.
export async function POST(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => ({}))

    if (body.action === 'sign') {
      const { file_name: fileName, content_type: rawType, file_size: fileSize, category_id: categoryId } = body
      const declaredType = resolveContentType(rawType, fileName)
      if (declaredType.startsWith('image/')) {
        return NextResponse.json({ error: 'Image uploads use the direct path, not the signed-upload flow' }, { status: 400 })
      }
      if (typeof fileSize === 'number' && fileSize > MAX_ATTACHMENT_BYTES) {
        return NextResponse.json({ error: `Files over ${MAX_ATTACHMENT_MB}MB are not supported.` }, { status: 400 })
      }
      const member = await getUploadMember(token, categoryId)
      if (!member) return NextResponse.json({ error: 'Admins, or Committee Owners uploading to Committee Meetings, only' }, { status: 403 })

      const ext = fileName?.split('.').pop() || 'pdf'
      const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { data, error: signErr } = await supabaseAdmin.storage
        .from('community-docs').createSignedUploadUrl(path)
      if (signErr) return NextResponse.json({ error: signErr.message }, { status: 500 })
      return NextResponse.json({ path: data.path, token: data.token, content_type: declaredType })
    }

    if (body.action === 'complete') {
      const { path, file_name: fileName, content_type: rawType, title, description, category_id: categoryId, file_size: fileSize } = body
      if (!path || !title?.trim()) return NextResponse.json({ error: 'path and title required' }, { status: 400 })

      const member = await getUploadMember(token, categoryId)
      if (!member) return NextResponse.json({ error: 'Admins, or Committee Owners uploading to Committee Meetings, only' }, { status: 403 })

      const declaredType = resolveContentType(rawType, fileName)
      const { data: { publicUrl } } = supabaseAdmin.storage.from('community-docs').getPublicUrl(path)

      const { data: doc, error: dbErr } = await supabaseAdmin.from('documents').insert({
        title: title.trim(),
        description: description?.trim() || null,
        category_id: categoryId || null,
        file_url: publicUrl,
        file_name: fileName || null,
        file_type: declaredType,
        file_size: typeof fileSize === 'number' ? fileSize : null,
        uploaded_by: member.id,
      }).select().single()
      if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
      return NextResponse.json(doc)
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  // Multipart form-data -- images only (see header comment above).
  const formData = await req.formData()
  const file        = formData.get('file')
  const title       = formData.get('title')?.trim()
  const description = formData.get('description')?.trim() || null
  const categoryId  = formData.get('category_id') || null

  const member = await getUploadMember(token, categoryId)
  if (!member) return NextResponse.json({ error: 'Admins, or Committee Owners uploading to Committee Meetings, only' }, { status: 403 })

  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 })
  if (!file)  return NextResponse.json({ error: 'File required' }, { status: 400 })

  // file.type is frequently an EMPTY STRING for .doc/.docx on mobile
  // Safari -- see lib/mimeFallback.js's header comment for the exact
  // failure this caused (an empty Content-Type header rejected by
  // undici, surfaced to the resident as "The string did not match the
  // expected pattern."). Derive a real MIME from the extension whenever
  // the browser didn't give us one, instead of passing it through blind.
  const declaredType = resolveContentType(file.type, file.name)
  if (!declaredType.startsWith('image/')) {
    return NextResponse.json({ error: 'Non-image files must go through the signed-upload flow' }, { status: 400 })
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: `Files over ${MAX_ATTACHMENT_MB}MB are not supported.` }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  let buffer          = Buffer.from(bytes)
  let ext             = file.name.split('.').pop()
  let resolvedFileType = declaredType

  try {
    const resized = await resizeImage(buffer)
    buffer = resized.buffer
    resolvedFileType = resized.contentType
    ext = resized.ext
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Could not process that image' }, { status: 400 })
  }

  const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  const { error: upErr } = await supabaseAdmin.storage
    .from('community-docs').upload(path, buffer, { contentType: resolvedFileType, cacheControl: MAX_AGE_SECONDS })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('community-docs').getPublicUrl(path)

  const { data: doc, error: dbErr } = await supabaseAdmin.from('documents').insert({
    title,
    description,
    category_id: categoryId || null,
    file_url: publicUrl,
    file_name: file.name,
    file_type: resolvedFileType,
    file_size: buffer.length,
    uploaded_by: member.id,
  }).select().single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json(doc)
}

// PATCH — toggle active
export async function PATCH(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const member = await getAdminMember(token)
  if (!member) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('documents').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE
export async function DELETE(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const member = await getAdminMember(token)
  if (!member) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('documents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
