import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveMember, isAreaOwner, requireVotingEventManage } from '@/lib/areaAuth'
import { computeVotingStatus, canSeeResults, tallyBallots, isEligibleToVote, normalizeCoordinatorIds, validateClosesAt, cleanChoiceImageUrl, choiceImageStoragePath } from '@/lib/voting'
import { votingCoordinatorsByEvent, setVotingCoordinators } from '@/lib/votingCoordinators'

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
    .select('id, label, description, candidate_member_id, image_url, sort_order')
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
  // Iain, 2026-09-03 round-5 review: "I would think number of votes
  // already cast would be a useful data point to show at all times even
  // when tile is in closed state" -- turnout (a plain count, not who or
  // what anyone voted) is now visible from Open onward, not just once the
  // vote has ended. Outcome stays Closed/Published only -- showing partial
  // results mid-vote could sway later voters, a real concern Iain never
  // raised changing, so that gate is untouched.
  //
  // Change Request #3, 2026-09-08: results visibility is coordinator-only
  // (Iain: "Only the assigned event coordinator/s should see results. NOT
  // Admins/Owners.") -- no blanket admin/owner bypass. See lib/voting.js's
  // canSeeResults() for the full rationale.
  const coordinators = (await votingCoordinatorsByEvent([event.id]))[event.id] || []
  const isCoordinator = coordinators.some(c => c.id === member.id)
  const showTurnout = votingStatus !== 'draft' && canSeeResults(event, { field: 'results_visibility_turnout', isCoordinator })
  const showOutcome = ['closed', 'published'].includes(votingStatus) && canSeeResults(event, { field: 'results_visibility_outcome', isCoordinator })

  if (showTurnout) {
    const { count } = await supabaseAdmin
      .from('voting_participation').select('id', { count: 'exact', head: true }).eq('voting_event_id', event.id)
    turnout = { votesCast: count || 0 }
  }
  if (showOutcome) {
    const { data: ballots } = await supabaseAdmin
      .from('voting_ballots').select('choice_id').eq('voting_event_id', event.id)
    const tally = tallyBallots(ballots || [])
    results = choices.map(c => ({ choice_id: c.id, label: c.label, image_url: c.image_url || null, votes: tally.get(c.id) || 0 }))
  }

  const canManage = !!member.is_admin || await isAreaOwner(member.id, 'hub', 'voting')
  const canManageEvent = canManage || isCoordinator

  return NextResponse.json({
    event: { ...event, status: votingStatus },
    choices,
    isAdmin: !!member.is_admin,
    canManage,
    canManageEvent,
    coordinators,
    myParticipation: myParticipation ? { votedAt: myParticipation.cast_at } : null,
    eligibility,
    turnout,
    results,
  })
}

// PATCH /api/voting/[id] — edit an existing event. Admin, this hub's Owner,
// or the event's own assigned Coordinator (lib/areaAuth.js's new
// requireVotingEventManage) -- Iain, 2026-09-02 review: "When an event is in
// draft or open once created there is no Edit option for the Admin/Owner/EC."
//
// Draft: full edit, including eligibility_mode/vote_mode/choices -- nothing
// has been voted on yet, so nothing to protect.
// Open: metadata-only edit (title/description/closes_at/coordinators/
// visibility toggles). eligibility_mode, vote_mode, max_selections,
// allow_self_vote, and choices are locked once a vote is open -- changing
// the ballot shape or the eligibility rule mid-vote would invalidate
// whatever's already been cast, and choices are referenced by
// voting_ballots rows by the time anyone's voted.
// Closed/Published: no edits at all -- the vote is over.
export async function PATCH(req, { params }) {
  const { error, status, member } = await requireVotingEventManage(req, params.id)
  if (error) return NextResponse.json({ error }, { status })

  const { data: event, error: eErr } = await supabaseAdmin
    .from('voting_events').select('*').eq('id', params.id).single()
  if (eErr || !event) return NextResponse.json({ error: 'Voting event not found' }, { status: 404 })

  const votingStatus = computeVotingStatus(event)
  if (votingStatus === 'closed' || votingStatus === 'published') {
    return NextResponse.json({ error: 'This vote has already closed and can no longer be edited' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const patch = {}

  if (body.title !== undefined) {
    if (!String(body.title || '').trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    patch.title = String(body.title).trim()
  }
  if (body.description !== undefined) patch.description = body.description ? String(body.description).trim() : null
  let coordIds = null
  if (body.coordinator_ids !== undefined) {
    coordIds = normalizeCoordinatorIds(body.coordinator_ids)
    if (coordIds.length === 0) return NextResponse.json({ error: 'Choose at least one coordinator' }, { status: 400 })
  }
  if (body.results_visibility_outcome !== undefined) {
    patch.results_visibility_outcome = body.results_visibility_outcome === 'admin_only' ? 'admin_only' : 'residents'
  }
  if (body.results_visibility_turnout !== undefined) {
    patch.results_visibility_turnout = body.results_visibility_turnout === 'admin_only' ? 'admin_only' : 'residents'
  }
  if (body.image_focal_x !== undefined) patch.image_focal_x = Number(body.image_focal_x) || 50
  if (body.image_focal_y !== undefined) patch.image_focal_y = Number(body.image_focal_y) || 50
  if (body.closes_at !== undefined) {
    // Required (Iain, 2026-10-22) -- can be moved, not cleared.
    const closesErr = validateClosesAt(body.closes_at)
    if (closesErr) return NextResponse.json({ error: closesErr }, { status: 400 })
    patch.closes_at = new Date(body.closes_at).toISOString()
  }

  // Draft-only fields -- ballot shape isn't real yet, safe to change.
  if (votingStatus === 'draft') {
    if (body.eligibility_mode !== undefined) {
      patch.eligibility_mode = body.eligibility_mode === 'per_household' ? 'per_household' : 'per_resident'
    }
    if (body.vote_mode !== undefined) patch.vote_mode = body.vote_mode === 'multi' ? 'multi' : 'single'
    if (body.max_selections !== undefined) {
      patch.max_selections = (body.vote_mode === 'multi' || event.vote_mode === 'multi') ? (body.max_selections || null) : null
    }
    if (body.allow_self_vote !== undefined) patch.allow_self_vote = body.allow_self_vote !== false

    if (Array.isArray(body.choices)) {
      const cleanChoices = body.choices
        .filter(c => c && String(c.label || '').trim())
        .map((c, i) => ({
          voting_event_id: event.id,
          label: String(c.label).trim(),
          description: c.description || null,
          candidate_member_id: c.candidate_member_id || null,
          image_url: cleanChoiceImageUrl(c.image_url, process.env.NEXT_PUBLIC_SUPABASE_URL),
          sort_order: i,
        }))
      if (cleanChoices.length < 2) return NextResponse.json({ error: 'At least two choices are required' }, { status: 400 })
      // Option images no longer used by any choice are removed from Storage
      // so a replaced or deleted picture doesn't linger.
      const { data: oldChoices } = await supabaseAdmin.from('voting_choices').select('image_url').eq('voting_event_id', event.id)
      const keep = new Set(cleanChoices.map(c => choiceImageStoragePath(c.image_url)).filter(Boolean))
      const stale = (oldChoices || []).map(c => choiceImageStoragePath(c.image_url)).filter(p => p && !keep.has(p))
      // Draft only, so no voting_ballots rows can reference the old choice
      // ids yet -- safe to replace wholesale rather than diff/patch.
      const { error: delErr } = await supabaseAdmin.from('voting_choices').delete().eq('voting_event_id', event.id)
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
      const { error: insErr } = await supabaseAdmin.from('voting_choices').insert(cleanChoices)
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
      if (stale.length) await supabaseAdmin.storage.from('event-images').remove(stale)
    }
  } else if (body.eligibility_mode !== undefined || body.vote_mode !== undefined || body.choices !== undefined || body.allow_self_vote !== undefined) {
    return NextResponse.json({ error: 'Voting rules and choices can only be changed while this vote is still a Draft' }, { status: 400 })
  }

  if (coordIds) {
    const coordErr = await setVotingCoordinators(event.id, coordIds, member?.id)
    if (coordErr) return NextResponse.json({ error: coordErr }, { status: 500 })
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ event: { ...event, status: votingStatus } })

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('voting_events').update(patch).eq('id', event.id).select().single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ event: { ...updated, status: computeVotingStatus(updated) } })
}

// DELETE /api/voting/[id] — cancel/abandon a vote. Admin, this hub's
// Owner, or the event's own assigned Coordinator (same gate as PATCH).
// Iain, 2026-09-03 round-5 review: "Still no option to abandon the vote
// event or cancel it when in draft state (or when open with no votes
// cast)." Allowed while Draft (nothing has happened yet) or while Open
// PROVIDED zero residents have voted so far -- the real participation
// count is checked directly here, not read off the viewer's own
// (visibility-gated) turnout figure, so a coordinator who can't see the
// turnout count still gets an accurate accept/reject rather than a
// false "looks safe" from their own restricted view. Once anyone has
// voted, or once the vote is Closed/Published, cancelling is refused --
// abandoning a vote with real responses (even Closed-but-unpublished
// ones) would silently discard something residents actually did.
// Soft-deletes via `archived`, the same convention voting_events already
// uses in the list route's `.eq('archived', false)` filter, rather than
// a hard delete -- keeps the row (and its choices/participation/ballots,
// which for an allowed cancellation are always empty anyway) around for
// audit rather than destroying it outright.
export async function DELETE(req, { params }) {
  const { error, status } = await requireVotingEventManage(req, params.id)
  if (error) return NextResponse.json({ error }, { status })

  const { data: event, error: eErr } = await supabaseAdmin
    .from('voting_events').select('*').eq('id', params.id).single()
  if (eErr || !event) return NextResponse.json({ error: 'Voting event not found' }, { status: 404 })

  const votingStatus = computeVotingStatus(event)
  if (votingStatus === 'closed' || votingStatus === 'published') {
    return NextResponse.json({ error: 'This vote has already closed and can no longer be cancelled' }, { status: 400 })
  }

  if (votingStatus === 'open') {
    const { count } = await supabaseAdmin
      .from('voting_participation').select('id', { count: 'exact', head: true }).eq('voting_event_id', event.id)
    if ((count || 0) > 0) {
      return NextResponse.json({ error: 'This vote already has responses and can no longer be cancelled' }, { status: 400 })
    }
  }

  const { error: updErr } = await supabaseAdmin.from('voting_events').update({ archived: true }).eq('id', event.id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

