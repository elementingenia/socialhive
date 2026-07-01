import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function getAdminMember(token) {
  if (!token) return null
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data } = await supabaseAdmin
    .from('members').select('id, is_admin').eq('auth_id', user.id).single()
  return data?.is_admin ? data : null
}

// POST — add contact
export async function POST(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const member = await getAdminMember(token)
  if (!member) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { name, title, phone, email, house_number, category_ids } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const { data: contact, error } = await supabaseAdmin.from('contacts').insert({
    name: name.trim(),
    title: title?.trim() || null,
    phone: phone?.trim() || null,
    email: email?.trim() || null,
    house_number: house_number?.trim() || null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (category_ids?.length) {
    await supabaseAdmin.from('contact_category_members').insert(
      category_ids.map(cid => ({ contact_id: contact.id, category_id: cid }))
    )
  }
  return NextResponse.json(contact)
}

// PATCH — update contact + categories
export async function PATCH(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const member = await getAdminMember(token)
  if (!member) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id, category_ids, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  if (Object.keys(updates).length) {
    const { error } = await supabaseAdmin.from('contacts').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (category_ids !== undefined) {
    await supabaseAdmin.from('contact_category_members').delete().eq('contact_id', id)
    if (category_ids.length) {
      await supabaseAdmin.from('contact_category_members').insert(
        category_ids.map(cid => ({ contact_id: id, category_id: cid }))
      )
    }
  }
  return NextResponse.json({ ok: true })
}

// DELETE
export async function DELETE(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const member = await getAdminMember(token)
  if (!member) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('contacts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
