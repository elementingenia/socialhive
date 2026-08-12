import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'
import { requireAdminOrAreaOwner } from '@/lib/areaAuth'

// Owner self-service club settings (Owner_SelfService_and_Library_Hub_Scope_v1
// Part A.3). Same fields ClubForm's save() used to write directly via the
// client (relying on admin-only RLS) — moved server-side so an Owner, not
// just an admin, can save. Uses the service role (bypasses RLS) with
// requireAdminOrAreaOwner doing the actual gating in application code, the
// same pattern as book-add/book-delete/clubs-notices this session.
//
// Creating a NEW club stays admin-only and still goes through the direct
// client insert in components/ClubForm.js — an Owner manages an existing
// area, they don't create new ones.

export async function PATCH(req) {
  const body = await req.json()
  const { club_id, ...fields } = body
  if (!club_id) return NextResponse.json({ error: 'club_id required' }, { status: 400 })

  const { error, status } = await requireAdminOrAreaOwner(req, 'club', club_id)
  if (error) return NextResponse.json({ error }, { status })

  const allowed = [
    'name', 'slug', 'description', 'welcome_text', 'colour', 'catalogue_module',
    'has_book_return', 'has_kit_return', 'has_theme', 'has_cost', 'bring_enabled',
    'single_signup', 'one_event_at_a_time',
  ]
  const payload = {}
  for (const k of allowed) if (fields[k] !== undefined) payload[k] = fields[k]

  const { error: updError } = await supabaseAdmin.from('clubs').update(payload).eq('id', club_id)
  if (updError) {
    const msg = updError.message.includes('duplicate') ? 'That slug is already taken' : updError.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Bring-categories sync — ported verbatim from ClubForm's previous
  // client-side logic (preserve existing ids so events that narrowed
  // themselves to specific categories don't silently lose that narrowing).
  const bringCats = Array.isArray(fields.bring_categories) ? fields.bring_categories : null
  if (bringCats) {
    if (fields.bring_enabled) {
      const { data: existingCats } = await supabaseAdmin.from('club_bring_categories').select('id').eq('club_id', club_id)
      const keepIds = new Set(bringCats.filter(c => c.id).map(c => c.id))
      const staleIds = (existingCats || []).filter(c => !keepIds.has(c.id)).map(c => c.id)
      if (staleIds.length) await supabaseAdmin.from('club_bring_categories').delete().in('id', staleIds)
      for (let i = 0; i < bringCats.length; i++) {
        const c = bringCats[i]
        if (c.id) await supabaseAdmin.from('club_bring_categories').update({ label: c.label, sort: i }).eq('id', c.id)
      }
      const newRows = bringCats.map((c, i) => ({ c, i })).filter(({ c }) => !c.id).map(({ c, i }) => ({ club_id, label: c.label, sort: i }))
      if (newRows.length) await supabaseAdmin.from('club_bring_categories').insert(newRows)
    } else {
      await supabaseAdmin.from('club_bring_categories').delete().eq('club_id', club_id)
    }
  }

  return NextResponse.json({ ok: true })
}
