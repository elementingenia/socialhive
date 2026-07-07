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

// PATCH — replace a member's extra category assignments (Residents is implicit, never stored here)
export async function PATCH(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const admin = await getAdminMember(token)
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { member_id, category_ids } = await req.json()
  if (!member_id) return NextResponse.json({ error: 'member_id required' }, { status: 400 })

  await supabaseAdmin.from('member_categories').delete().eq('member_id', member_id)
  if (category_ids?.length) {
    await supabaseAdmin.from('member_categories').insert(
      category_ids.map(cid => ({ member_id, category_id: cid }))
    )
  }
  return NextResponse.json({ ok: true })
}
