import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'
import { isBuiltInCategory } from "@/lib/contactCategories"
async function getAdminMember(token) {
  if (!token) return null
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data } = await supabaseAdmin.from('members').select('id, is_admin').eq('auth_id', user.id).single()
  return data?.is_admin ? data : null
}

export async function POST(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const member = await getAdminMember(token)
  if (!member) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('contact_categories').insert({ name: name.trim(), display_order: 99 }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH — toggle whether residents can send an in-app Question to this
// category. Necessary but not sufficient: the category also needs at least one
// member with an app login before it is ever offered (lib/questionRouting.js's
// askableCategories()). Residents is seeded false by migration 065.
export async function PATCH(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const member = await getAdminMember(token)
  if (!member) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id, askable } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (typeof askable !== 'boolean') return NextResponse.json({ error: 'askable must be true or false' }, { status: 400 })

  const { error } = await supabaseAdmin.from('contact_categories').update({ askable }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — only allowed when the category has no contacts or members assigned
export async function DELETE(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const member = await getAdminMember(token)
  if (!member) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: cat } = await supabaseAdmin.from('contact_categories').select('name').eq('id', id).single()
  if (isBuiltInCategory(cat?.name)) {
    return NextResponse.json({ error: 'Residents is a built-in category and cannot be deleted' }, { status: 400 })
  }

  const [{ count: contactCount }, { count: memberCount }] = await Promise.all([
    supabaseAdmin.from('contact_category_members').select('*', { count: 'exact', head: true }).eq('category_id', id),
    supabaseAdmin.from('member_categories').select('*', { count: 'exact', head: true }).eq('category_id', id),
  ])
  const total = (contactCount || 0) + (memberCount || 0)
  if (total > 0) {
    return NextResponse.json({ error: `Category has ${total} contact${total === 1 ? '' : 's'} assigned — remove them first` }, { status: 409 })
  }

  const { error } = await supabaseAdmin.from('contact_categories').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
