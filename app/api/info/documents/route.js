import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'
import { resizeImage, MAX_AGE_SECONDS } from '@/lib/imageResize'
import { resolveContentType } from '@/lib/mimeFallback'
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

// POST — upload file + insert document record
export async function POST(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')

  const formData = await req.formData()
  const file        = formData.get('file')
  const title       = formData.get('title')?.trim()
  const description = formData.get('description')?.trim() || null
  const categoryId  = formData.get('category_id') || null

  const member = await getUploadMember(token, categoryId)
  if (!member) return NextResponse.json({ error: 'Admins, or Committee Owners uploading to Committee Meetings, only' }, { status: 403 })

  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 })
  if (!file)  return NextResponse.json({ error: 'File required' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  let buffer      = Buffer.from(bytes)
  let ext         = file.name.split('.').pop()
  // file.type is frequently an EMPTY STRING for .doc/.docx on mobile
  // Safari -- see lib/mimeFallback.js's header comment for the exact
  // failure this caused (an empty Content-Type header rejected by
  // undici, surfaced to the resident as "The string did not match the
  // expected pattern."). Derive a real MIME from the extension whenever
  // the browser didn't give us one, instead of passing it through blind.
  let contentType = resolveContentType(file.type, file.name)

  // Resize/re-encode images only -- PDFs and other document types pass
  // through untouched. See lib/imageResize.js for why this exists.
  if (file.type?.startsWith('image/')) {
    try {
      const resized = await resizeImage(buffer)
      buffer = resized.buffer
      contentType = resized.contentType
      ext = resized.ext
    } catch (err) {
      return NextResponse.json({ error: err.message || 'Could not process that image' }, { status: 400 })
    }
  }

  const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  const { error: upErr } = await supabaseAdmin.storage
    .from('community-docs').upload(path, buffer, { contentType, cacheControl: MAX_AGE_SECONDS })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('community-docs').getPublicUrl(path)

  const { data: doc, error: dbErr } = await supabaseAdmin.from('documents').insert({
    title,
    description,
    category_id: categoryId || null,
    file_url: publicUrl,
    file_name: file.name,
    file_type: contentType,
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
