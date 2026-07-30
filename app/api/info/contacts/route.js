import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'
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
  if (!category_ids?.length) return NextResponse.json({ error: 'At least one category required' }, { status: 400 })

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

// PATCH — update a standalone contact (by id) OR a resident's contact-card
// overrides (by member_id — the linked contacts row is created on first
// edit if it doesn't exist yet). Also handles is_admin/hide_name, which are
// members-table fields, when member_id is supplied.
export async function PATCH(req) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  const admin = await getAdminMember(token)
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id, member_id, name, category_ids, is_admin, hide_name, ...updates } = await req.json()
  if (!id && !member_id) return NextResponse.json({ error: 'id or member_id required' }, { status: 400 })

  let targetId = id

  if (!targetId) {
    const { data: existing } = await supabaseAdmin
      .from('contacts').select('id').eq('member_id', member_id).maybeSingle()
    if (existing) {
      targetId = existing.id
    } else {
      const { data: memberRow } = await supabaseAdmin
        .from('members').select('name').eq('id', member_id).single()
      const { data: created, error: createErr } = await supabaseAdmin
        .from('contacts')
        .insert({ member_id, name: memberRow?.name || 'Resident', active: true })
        .select('id').single()
      if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 })
      targetId = created.id
    }
  }

  // FIELD OWNERSHIP (Iain, 2026-07-27 -- supersedes the 2026-07-08 split and
  // the 2026-07-26 phone/name lock). The stable principle:
  //
  //   Identity      -> self-service ONLY: name, username.
  //   Contact detail-> DUAL-EDIT: email, house_number, phone (resident from
  //                    their Profile, or an admin from the contact card).
  //
  // `username` is never accepted here at all: the Supabase Auth email is
  // derived from it (`<username>@thesocialhive.internal`), so changing it
  // would orphan the Auth user and lock the resident out.
  //
  // CRITICAL: for a member-linked resident these three fields must be written
  // to `members`, NOT onto the contacts row. Migration 030 established that a
  // member-linked contacts row's own name/email/house_number are never trusted
  // or displayed -- the app always overlays live members.*. Writing them to
  // `contacts` would report success and change nothing on screen.
  // `name` joins the dual-edit set (Iain, 2026-07-29). It was self-service only
  // on the reasoning that a person owns their own name -- but that only holds
  // when they typed it. With ~100 accounts being created FOR residents by an
  // admin, the admin is the one who entered the name, and was left unable to
  // correct their own typo. Same last-write-wins, no locking.
  const MEMBER_OWNED = ['email', 'house_number', 'phone', 'name']

  // Standalone contact: every field, including name, lives on the contacts row.
  if (!member_id && name !== undefined) updates.name = name
  // Member-linked: fold name into `updates` so the MEMBER_OWNED sweep below
  // redirects it to the members table (writing it to the contacts row would
  // report success and change nothing -- migration 030's overlay rule).
  if (member_id && name !== undefined) updates.name = name

  let memberFieldUpdates = {}
  if (member_id) {
    for (const f of MEMBER_OWNED) {
      if (updates[f] !== undefined) {
        memberFieldUpdates[f] = typeof updates[f] === 'string'
          ? (updates[f].trim() || null)
          : updates[f]
        delete updates[f]   // never let a stale copy land on the contacts row
      }
    }
  }

  if (Object.keys(updates).length) {
    const { error } = await supabaseAdmin.from('contacts').update(updates).eq('id', targetId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (member_id && Object.keys(memberFieldUpdates).length) {
    const { error } = await supabaseAdmin.from('members').update(memberFieldUpdates).eq('id', member_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (category_ids !== undefined) {
    if (!category_ids.length) return NextResponse.json({ error: 'At least one category required' }, { status: 400 })
    await supabaseAdmin.from('contact_category_members').delete().eq('contact_id', targetId)
    await supabaseAdmin.from('contact_category_members').insert(
      category_ids.map(cid => ({ contact_id: targetId, category_id: cid }))
    )
  }

  // Account flags -- admin-only, no Profile equivalent. Contact details
  // (including name, as of 2026-07-29) are handled by memberFieldUpdates above.
  if (member_id && (is_admin !== undefined || hide_name !== undefined)) {
    const memberUpdates = {}
    if (is_admin !== undefined) memberUpdates.is_admin = is_admin
    if (hide_name !== undefined) memberUpdates.hide_name = hide_name
    const { error } = await supabaseAdmin.from('members').update(memberUpdates).eq('id', member_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: targetId })
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
