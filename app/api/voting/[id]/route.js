import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveMember } from '@/lib/areaAuth'
import { computeVotingStatus, canSeeResults, tallyBallots, isEligibleToVote } from '@/lib/voting'

export const dynamic = 'force-dynamic'

// GET /api/voting/[id] — event + choices + the viewer's own eligibility/
// participation state, plus results IF the event is Closed/Published AND
// the relevant visibility toggle allows it for this viewer. Never returns
// voting_ballots joined to any member — results are always a tally.
export async function GET(req, { params }) {
  const { error, status, member } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })

  const { data: event, error: eErr } = await supabaseAdmin
    .from('voting_events').select('*').eq('id', params.id).single()
  if (eErr || !event) return NextResponse.json({ error: 'Voting event not found' }, { status: 404 })

  const { data: choices, error: cErr } = await supabaseAdmin
    .from('voting_choices')
    .select('id, label, description, candidate_member_id, sort_order')
    .eq('voting_event_id', event.id)
    .order('sort_order')
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  const votingStatus = computeVotingStatus(event)

  const { data: myParticipation } = await supabaseAdmin
    .from('voting_participation').select('id, cast_at')
    .eq('voting_event_id', event.id).eq('member_id', member.id).maybeSingle()

  let eligibility = { eligible: true }
  if (!myParticipation && event.eligibility_mode === 'per_household') {
    const { data: participants } = await supabaseAdmin
      .from('voting_participation')
      .select('member_id, member:members!member_id(house_number)')
      .eq('voting_event_id', event.id)
    const flat = (participants || []).map(p => ({ member_id: p.member_id, house_number: p.member?.house_number }))
    eligibility = isEligibleToVote(event, member, flat)
  }

  let turnout = null
  let results = null
  const showTurnout = ['closed', 'published'].includes(votingStatus) && canSeeResults(event, { field: 'results_visibility_turnout', isAdmin: member.is_admin })
  const showOutcome = ['closed', 'published'].includes(votingStatus) && canSeeResults(event, { field: 'results_visibility_outcome', isAdmin: member.is_admin })

  if (showTurnout) {
    const { count } = await supabaseAdmin
      .from('voting_participation').select('id', { count: 'exact', head: true }).eq('voting_event_id', event.id)
    turnout = { votesCast: count || 0 }
  }
  if (showOutcome) {
    const { data: ballots } = await supabaseAdmin
      .from('voting_ballots').select('choice_id').eq('voting_event_id', event.id)
    const tally = tallyBallots(ballots || [])
    results = choices.map(c => ({ choice_id: c.id, label: c.label, votes: tally.get(c.id) || 0 }))
  }

  return NextResponse.json({
    event: { ...event, status: votingStatus },
    choices,
    isAdmin: !!member.is_admin,
    myParticipation: myParticipation ? { votedAt: myParticipation.cast_at } : null,
    eligibility,
    turnout,
    results,
  })
}
