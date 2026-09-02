import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminOrAreaOwner } from '@/lib/areaAuth'
import { computeVotingStatus, householdAnomalyReport } from '@/lib/voting'

export const dynamic = 'force-dynamic'

// GET /api/voting/[id]/publish — the Closed-review safety net (Iain,
// 2026-09-02): before publishing, surface "houses with more than one vote
// cast" for a per_household event, so a human catches anything the
// normalization + UNIQUE constraint missed. Admin/Owner only -- this reads
// voting_participation with member/house_number attached, which is
// identifiable data by design (see migration 088), so it must never be
// exposed to a resident.
export async function GET(req, { params }) {
  const { error, status } = await requireAdminOrAreaOwner(req, 'hub', 'voting')
  if (error) return NextResponse.json({ error }, { status })

  const { data: event, error: eErr } = await supabaseAdmin
    .from('voting_events').select('*').eq('id', params.id).single()
  if (eErr || !event) return NextResponse.json({ error: 'Voting event not found' }, { status: 404 })

  const { data: participants, error: pErr } = await supabaseAdmin
    .from('voting_participation')
    .select('member_id, member:members!member_id(house_number, name, display_name)')
    .eq('voting_event_id', event.id)
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  const flat = (participants || []).map(p => ({ member_id: p.member_id, house_number: p.member?.house_number }))
  const anomalies = householdAnomalyReport(event, flat)

  // attach readable names for the admin review screen (identifiable data,
  // never sent to a resident-facing endpoint)
  const byId = new Map((participants || []).map(p => [p.member_id, p.member]))
  const annotated = anomalies.map(a => ({
    ...a,
    members: a.memberIds.map(id => ({ id, name: byId.get(id)?.display_name || byId.get(id)?.name || 'Unknown' })),
  }))

  return NextResponse.json({ status: computeVotingStatus(event), anomalies: annotated })
}

// POST /api/voting/[id]/publish — the manual Closed -> Published action.
// Admin/Owner only. Deliberately does NOT block on anomalies existing --
// the anomaly report (GET, above) is a human checkpoint, not an automatic
// gate; an admin who's reviewed it and decided to proceed anyway can.
export async function POST(req, { params }) {
  const { error, status } = await requireAdminOrAreaOwner(req, 'hub', 'voting')
  if (error) return NextResponse.json({ error }, { status })

  const { data: event, error: eErr } = await supabaseAdmin
    .from('voting_events').select('*').eq('id', params.id).single()
  if (eErr || !event) return NextResponse.json({ error: 'Voting event not found' }, { status: 404 })

  if (computeVotingStatus(event) !== 'closed') {
    return NextResponse.json({ error: 'Only a Closed event can be published' }, { status: 400 })
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('voting_events').update({ published_at: new Date().toISOString() }).eq('id', event.id).select().single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ event: { ...updated, status: computeVotingStatus(updated) } })
}
