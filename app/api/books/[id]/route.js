import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from 'next/server'
import { requireAdminOrAreaOwner } from '@/lib/areaAuth'

// Book Library delete — admin OR this hub's Owner, per the Owner
// self-service model (Owner_SelfService_and_Library_Hub_Scope_v1 Part A).
// Movies' equivalent (app/api/movies/[id]/route.js) is still admin-only —
// left as a follow-up, not retrofitted here, see PR description.
export async function DELETE(req, { params }) {
  const { error, status } = await requireAdminOrAreaOwner(req, 'hub', 'library')
  if (error) return NextResponse.json({ error }, { status })

  const { id } = params

  // Delete associated loans first (no CASCADE assumed beyond FK ON DELETE
  // CASCADE already set in migration 080, but explicit delete keeps this
  // route correct even if that changes).
  await supabaseAdmin.from('book_loans').delete().eq('book_id', id)

  const { error: delError } = await supabaseAdmin.from('books').delete().eq('id', id)
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
