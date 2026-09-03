import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveMember } from '@/lib/areaAuth'
import { computeVotingStatus, isEligibleToVote, validateSelfVote, validateBallotSelection } from '@/lib/voting'

export const dynamic = 'force-dynamic'

// POST /api/voting/[id]/vote — cast a ballot. Any eligible resident.
//
// Write order matters for the anonymity guarantee:
//   1. voting_participation row (identifiable) -- this is what the UNIQUE
//      constraint uses to hard-block a second vote, closing the race
//      condition an application-level "have they voted" check alone can't.
//   2. voting_ballots row(s) (anonymous) -- ONE independent row per selected
//      choice for a multi-select vote, never one row holding a set. See
//      migration 088's comment block for why.
// If step 2 fails after step 1 succeeded, the participation row is rolled
// back so a member is never left "marked as voted" with no ballot recorded.
export async function POST(req, { params }) {
  const { error, status, member } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })

  const { data: event, error: eErr } = await supabaseAdmin
    .from('voting_events').select('*').eq('id', params.id).single()
  if (eErr || !event) return NextResponse.json({ error: 'Voting event not found' }, { status: 404 })

  if (computeVotingStatus(event) !== 'open') {
    return NextResponse.json({ error: 'Voting is not currently open for this event' }, { status: 400 })
  }

  const { data: choices, error: cErr } = await supabaseAdmin
    .from('voting_choices').select('id, candidate_member_id').eq('voting_event_id', event.id)
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
  const allChoiceIds = choices.map(c => c.id)

  if (event.eligibility_mode === 'per_household') {
    const { data: participants } = await supabaseAdmin
      .from('voting_participation')
      .select('member_id, member:members!member_id(house_number)')
      .eq('voting_event_id', event.id)
    const flat = (participants || []).map(p => ({ member_id: p.member_id, house_number: p.member?.house_number }))
    const eligibility = isEligibleToVote(event, member, flat)
    if (!eligibility.eligible) return NextResponse.json({ error: eligibility.reason }, { status: 403 })
  }

  const body = await req.json()
  const selectedChoiceIds = Array.isArray(body.choice_ids) ? body.choice_ids : []

  const shapeCheck = validateBallotSelection(event, selectedChoiceIds, allChoiceIds)
  if (!shapeCheck.ok) return NextResponse.json({ error: shapeCheck.reason }, { status: 400 })

  const selfCheck = validateSelfVote(event, member, selectedChoiceIds, choices)
  if (!selfCheck.ok) return NextResponse.json({ error: selfCheck.reason }, { status: 400 })

  const { error: partErr } = await supabaseAdmin
    .from('voting_participation').insert({ voting_event_id: event.id, member_id: member.id })
  if (partErr) {
    if (partErr.code === '23505') { // unique_violation
      return NextResponse.json({ error: 'You have already voted in this ballot' }, { status: 409 })
    }
    return NextResponse.json({ error: partErr.message }, { status: 500 })
  }

  const ballotRows = selectedChoiceIds.map(choice_id => ({ voting_event_id: event.id, choice_id }))
  const { error: ballotErr } = await supabaseAdmin.from('voting_ballots').insert(ballotRows)
  if (ballotErr) {
    await supabaseAdmin.from('voting_participation').delete().eq('voting_event_id', event.id).eq('member_id', member.id)
    return NextResponse.json({ error: 'Could not record your ballot -- please try again' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
