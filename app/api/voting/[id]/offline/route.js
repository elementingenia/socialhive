import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireVotingEventManage } from '@/lib/areaAuth'
import { computeVotingStatus, validateOfflineVotes } from '@/lib/voting'

export const dynamic = 'force-dynamic'

// Paper & proxy votes (migration 149, Iain 2026-11-04). Coordinator, admin
// or Voting Owner only (requireVotingEventManage) -- this returns who voted
// and how, which is identifiable data, so it must never be resident-facing.
// Only allowed once the vote is Closed and before it's Published: app
// voting has stopped, so nobody can vote in the app after being counted
// on paper.

async function loadState(eventId) {
  const [{ data: participants, error: pErr }, { data: counts, error: cErr }, { data: residents, error: rErr }] = await Promise.all([
    supabaseAdmin.from('voting_participation').select('member_id, method').eq('voting_event_id', eventId),
    supabaseAdmin.from('voting_offline_counts').select('choice_id, votes').eq('voting_event_id', eventId),
    supabaseAdmin.from('members').select('id, name, display_name, house_number')
      .eq('status', 'active').eq('is_test', false).order('name'),
  ])
  if (pErr || cErr || rErr) return { error: (pErr || cErr || rErr).message }
  return { participants: participants || [], counts: counts || [], residents: residents || [] }
}

// GET -- current offline set + the resident list for the picker.
export async function GET(req, { params }) {
  const { error, status } = await requireVotingEventManage(req, params.id)
  if (error) return NextResponse.json({ error }, { status })

  const { data: event, error: eErr } = await supabaseAdmin
    .from('voting_events').select('*').eq('id', params.id).single()
  if (eErr || !event) return NextResponse.json({ error: 'Voting event not found' }, { status: 404 })

  const state = await loadState(event.id)
  if (state.error) return NextResponse.json({ error: state.error }, { status: 500 })

  const methodById = new Map(state.participants.map(p => [p.member_id, p.method]))
  let recordedByName = null
  if (event.offline_recorded_by) {
    const { data: by } = await supabaseAdmin.from('members').select('name, display_name').eq('id', event.offline_recorded_by).maybeSingle()
    recordedByName = by?.display_name || by?.name || null
  }

  return NextResponse.json({
    status: computeVotingStatus(event),
    residents: state.residents.map(m => ({
      id: m.id,
      name: m.display_name || m.name || 'Resident',
      house_number: m.house_number || null,
      votedInApp: methodById.get(m.id) === 'app',
    })),
    offlineMemberIds: state.participants.filter(p => p.method === 'offline').map(p => p.member_id),
    counts: Object.fromEntries(state.counts.map(c => [c.choice_id, c.votes])),
    note: event.offline_note || '',
    recordedAt: event.offline_recorded_at || null,
    recordedByName,
  })
}

// PUT -- replace the whole offline set: { member_ids, counts: {choice_id: n}, note }.
export async function PUT(req, { params }) {
  const { error, status, member } = await requireVotingEventManage(req, params.id)
  if (error) return NextResponse.json({ error }, { status })

  const { data: event, error: eErr } = await supabaseAdmin
    .from('voting_events').select('*').eq('id', params.id).single()
  if (eErr || !event) return NextResponse.json({ error: 'Voting event not found' }, { status: 404 })

  if (computeVotingStatus(event) !== 'closed') {
    return NextResponse.json({ error: 'Paper and proxy votes can only be added once voting has closed, before results are published.' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const memberIds = Array.isArray(body.member_ids) ? body.member_ids : []

  const { data: choices, error: chErr } = await supabaseAdmin
    .from('voting_choices').select('id').eq('voting_event_id', event.id)
  if (chErr) return NextResponse.json({ error: chErr.message }, { status: 500 })

  const [{ data: members, error: mErr }, { data: appRows, error: aErr }] = await Promise.all([
    memberIds.length
      ? supabaseAdmin.from('members').select('id, name, display_name, house_number').in('id', memberIds).eq('status', 'active')
      : Promise.resolve({ data: [] }),
    supabaseAdmin.from('voting_participation')
      .select('member_id, member:members!member_id(house_number)')
      .eq('voting_event_id', event.id).eq('method', 'app'),
  ])
  if (mErr || aErr) return NextResponse.json({ error: (mErr || aErr).message }, { status: 500 })

  const check = validateOfflineVotes(event, {
    memberIds,
    counts: body.counts,
    choiceIds: (choices || []).map(c => c.id),
    members: (members || []).map(m => ({ id: m.id, name: m.display_name || m.name, house_number: m.house_number })),
    appParticipants: (appRows || []).map(r => ({ member_id: r.member_id, house_number: r.member?.house_number })),
  })
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 })

  const note = typeof body.note === 'string' ? body.note.slice(0, 1000) : ''
  const { error: rpcErr } = await supabaseAdmin.rpc('record_offline_votes', {
    p_event_id: event.id,
    p_member_ids: check.memberIds,
    p_counts: Object.entries(check.counts).map(([choice_id, votes]) => ({ choice_id, votes })),
    p_note: note,
    p_by: member.id,
  })
  if (rpcErr) {
    if (rpcErr.code === '23505') {
      return NextResponse.json({ error: 'One of these residents has already voted, so can\'t be counted again.' }, { status: 409 })
    }
    return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
