import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireVotingEventManage } from '@/lib/areaAuth'
import { computeVotingStatus } from '@/lib/voting'
import { notifyAllActiveMembers } from '@/lib/notifyAudience'

export const dynamic = 'force-dynamic'

// POST /api/voting/[id]/open — the manual Draft -> Open transition (Iain,
// 2026-09-02: "OPEN VOTING as a manual option", not a scheduled go-live).
// Admin or this hub's Owner only. Requires closes_at to already be set --
// Open->Closed is a live time comparison (lib/voting.js's
// computeVotingStatus), so there's nothing to auto-close against otherwise.
//
// Broadcasts to every active member the instant a vote opens (Iain,
// 2026-09-04: "A Vote should broadcast to all when it is set to OPEN") --
// deliberately NOT on create/Draft (a Draft may sit unpublished for days
// while it's being set up) and NOT on close/publish (Voting had no
// notifications at all until now; Special Events/Social broadcast on
// CREATE since an event needs attention from the whole community the
// moment it exists, but a vote's actionable moment is when it's actually
// open to cast a ballot, not when someone starts drafting it).
//
// voting_events is its own table, not the shared `events` table
// notifications.event_id references (see migration 023) -- so event_id
// stays null here, same as bar_reconciled. NotificationsDrawer.js's
// targetForNotif() routes this type to /voting directly by type, the same
// pattern already used for question_* types with no event_id.
export async function POST(req, { params }) {
  const { error, status, member } = await requireVotingEventManage(req, params.id)
  if (error) return NextResponse.json({ error }, { status })

  const { data: event, error: eErr } = await supabaseAdmin
    .from('voting_events').select('*').eq('id', params.id).single()
  if (eErr || !event) return NextResponse.json({ error: 'Voting event not found' }, { status: 404 })

  if (computeVotingStatus(event) !== 'draft') {
    return NextResponse.json({ error: 'Only a Draft event can be opened' }, { status: 400 })
  }

  // closes_at can be set on this same call (the create-form UI doesn't ask
  // for it up front, since a Draft may sit unopened for a while) or must
  // already be on the row -- either way it's required before opening.
  const body = await req.json().catch(() => ({}))
  const closesAt = body.closes_at || event.closes_at
  if (!closesAt) {
    return NextResponse.json({ error: 'Set a closing date/time before opening this vote' }, { status: 400 })
  }
  if (new Date(closesAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Closing date/time must be in the future' }, { status: 400 })
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('voting_events').update({ opened_at: new Date().toISOString(), closes_at: closesAt }).eq('id', event.id).select().single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  const closesFmt = new Date(closesAt).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  await notifyAllActiveMembers(supabaseAdmin, null, 'voting_opened',
    `Voting is now open: "${event.title}" — closes ${closesFmt}`, { excludeMemberId: member?.id })

  return NextResponse.json({ event: { ...updated, status: computeVotingStatus(updated) } })
}
