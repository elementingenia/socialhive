import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminOrAreaOwner } from '@/lib/areaAuth'
import { computeVotingStatus } from '@/lib/voting'

export const dynamic = 'force-dynamic'

// POST /api/voting/[id]/open — the manual Draft -> Open transition (Iain,
// 2026-09-02: "OPEN VOTING as a manual option", not a scheduled go-live).
// Admin or this hub's Owner only. Requires closes_at to already be set --
// Open->Closed is a live time comparison (lib/voting.js's
// computeVotingStatus), so there's nothing to auto-close against otherwise.
export async function POST(req, { params }) {
  const { error, status } = await requireAdminOrAreaOwner(req, 'hub', 'voting')
  if (error) return NextResponse.json({ error }, { status })

  const { data: event, error: eErr } = await supabaseAdmin
    .from('voting_events').select('*').eq('id', params.id).single()
  if (eErr || !event) return NextResponse.json({ error: 'Voting event not found' }, { status: 404 })

  if (computeVotingStatus(event) !== 'draft') {
    return NextResponse.json({ error: 'Only a Draft event can be opened' }, { status: 400 })
  }
  if (!event.closes_at) {
    return NextResponse.json({ error: 'Set a closing date/time before opening this vote' }, { status: 400 })
  }
  if (new Date(event.closes_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Closing date/time must be in the future' }, { status: 400 })
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('voting_events').update({ opened_at: new Date().toISOString() }).eq('id', event.id).select().single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ event: { ...updated, status: computeVotingStatus(updated) } })
}
