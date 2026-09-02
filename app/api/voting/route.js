import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminOrAreaOwner, resolveMember, isAreaOwner } from '@/lib/areaAuth'
import { computeVotingStatus } from '@/lib/voting'

export const dynamic = 'force-dynamic'

// GET /api/voting — list events, most recent first, with status computed
// live (never trust a stored column — see lib/voting.js). Any authenticated
// resident can list; per-event detail/results visibility is enforced in
// [id]/route.js, not here.
export async function GET(req) {
  const { error, status, member } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })

  const { data, error: qErr } = await supabaseAdmin
    .from('voting_events')
    .select('id, title, description, eligibility_mode, vote_mode, max_selections, allow_self_vote, results_visibility_outcome, results_visibility_turnout, coordinator_id, opened_at, closes_at, published_at, created_at, archived')
    .eq('archived', false)
    .order('created_at', { ascending: false })
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  const canManage = !!member.is_admin || await isAreaOwner(member.id, 'hub', 'voting')
  // Per-event edit rights: the hub-wide canManage above, OR this specific
  // event's own assigned coordinator (Iain, 2026-09-02 review: "There is no
  // event coordinator option which should be in scope" -- a coordinator
  // needs to see Edit on their own event even if they're not a Voting Owner).
  const events = data.map(e => ({
    ...e,
    status: computeVotingStatus(e),
    canManageEvent: canManage || (!!e.coordinator_id && e.coordinator_id === member.id),
  }))
  return NextResponse.json({ events, isAdmin: !!member.is_admin, canManage })
}

// POST /api/voting — create a new event (Draft) + its choices in one call.
// Admin or this hub's Owner only (lib/areaAuth.js's requireAdminOrAreaOwner,
// contextType 'hub', contextKey 'voting' — same primitive every other hub's
// event-creation route uses).
export async function POST(req) {
  const { error, status, member } = await requireAdminOrAreaOwner(req, 'hub', 'voting')
  if (error) return NextResponse.json({ error }, { status })

  const body = await req.json()
  const {
    title, description, eligibility_mode, vote_mode, max_selections,
    allow_self_vote, results_visibility_outcome, results_visibility_turnout,
    coordinator_id, closes_at, choices,
  } = body

  if (!title || !String(title).trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  if (!Array.isArray(choices) || choices.length < 2) return NextResponse.json({ error: 'At least two choices are required' }, { status: 400 })
  if (vote_mode === 'multi' && max_selections != null && Number(max_selections) < 1) {
    return NextResponse.json({ error: 'Max selections must be at least 1' }, { status: 400 })
  }

  const { data: event, error: insErr } = await supabaseAdmin
    .from('voting_events')
    .insert({
      title: String(title).trim(),
      description: description || null,
      eligibility_mode: eligibility_mode === 'per_household' ? 'per_household' : 'per_resident',
      vote_mode: vote_mode === 'multi' ? 'multi' : 'single',
      max_selections: vote_mode === 'multi' ? (max_selections || null) : null,
      allow_self_vote: allow_self_vote !== false,
      results_visibility_outcome: results_visibility_outcome === 'admin_only' ? 'admin_only' : 'residents',
      results_visibility_turnout: results_visibility_turnout === 'admin_only' ? 'admin_only' : 'residents',
      coordinator_id: coordinator_id || null,
      closes_at: closes_at || null,
      created_by: member.id,
    })
    .select()
    .single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  const choiceRows = choices
    .filter(c => c && String(c.label || '').trim())
    .map((c, i) => ({
      voting_event_id: event.id,
      label: String(c.label).trim(),
      description: c.description || null,
      candidate_member_id: c.candidate_member_id || null,
      sort_order: i,
    }))
  const { error: choiceErr } = await supabaseAdmin.from('voting_choices').insert(choiceRows)
  if (choiceErr) {
    // roll back the event so a failed choice-insert doesn't leave an orphaned Draft
    await supabaseAdmin.from('voting_events').delete().eq('id', event.id)
    return NextResponse.json({ error: choiceErr.message }, { status: 500 })
  }

  return NextResponse.json({ event: { ...event, status: computeVotingStatus(event) } }, { status: 201 })
}
