import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'
import { resizeImage, MAX_AGE_SECONDS } from '@/lib/imageResize'
async function getAdminMember(token) {
  if (!token) return null
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data } = await supabaseAdmin
    .from('members').select('id, is_admin').eq('auth_id', user.id).single()
  return data?.is_admin ? data : null
}

// POST — upload file + insert document record
export async function POST(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const member = await getAdminMember(token)
  if (!member) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const formData = await req.formData()
  const file        = formData.get('file')
  const title       = formData.get('title')?.trim()
  const description = formData.get('description')?.trim() || null
  const categoryId  = formData.get('category_id') || null

  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 })
  if (!file)  return NextResponse.json({ error: 'File required' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  let buffer      = Buffer.from(bytes)
  let ext         = file.name.split('.').pop()
  let contentType = file.type

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
