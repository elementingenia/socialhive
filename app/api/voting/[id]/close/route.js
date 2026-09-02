import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireVotingEventManage } from '@/lib/areaAuth'
import { computeVotingStatus } from '@/lib/voting'

export const dynamic = 'force-dynamic'

// POST /api/voting/[id]/close — manual early close for an Open event.
// Iain, 2026-09-03 round-4 review: "Once a user click OPEN for a voting
// event, the OPEN option should revert to CLOSE - leaving it as open is
// confusing." Before this, the ONLY way an Open vote became Closed was the
// scheduled closes_at time arriving -- there was no way for an admin/Owner/
// coordinator to end a vote early.
//
// Admin, this hub's Owner, or the event's own coordinator only (same gate
// as open/publish). Implemented as "bring closes_at forward to right now"
// rather than adding a separate status column or flag -- computeVotingStatus
// is deliberately always derived live from opened_at/closes_at/published_at
// (see lib/voting.js's header comment on why status is never stored), so
// this keeps that single source of truth intact instead of adding a second,
// parallel way to know an event is closed.
export async function POST(req, { params }) {
  const { error, status } = await requireVotingEventManage(req, params.id)
  if (error) return NextResponse.json({ error }, { status })

  const { data: event, error: eErr } = await supabaseAdmin
    .from('voting_events').select('*').eq('id', params.id).single()
  if (eErr || !event) return NextResponse.json({ error: 'Voting event not found' }, { status: 404 })

  if (computeVotingStatus(event) !== 'open') {
    return NextResponse.json({ error: 'Only an Open vote can be closed' }, { status: 400 })
  }

  const nowIso = new Date().toISOString()
  const { data: updated, error: updErr } = await supabaseAdmin
    .from('voting_events').update({ closes_at: nowIso }).eq('id', event.id).select().single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ event: { ...updated, status: computeVotingStatus(updated) } })
}
