import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminOrAreaOwner, resolveMember, isAreaOwner } from '@/lib/areaAuth'
import { computeSurveyStatus, canSeeResults } from '@/lib/surveys'

export const dynamic = 'force-dynamic'

// GET /api/surveys — list surveys, most recent first, status computed live
// (never trust a stored column — see lib/surveys.js). Any authenticated
// resident can list, same convention as app/api/voting/route.js -- Draft
// surveys are included in the list (visible to everyone, same as Voting
// already does; the frontend gates what's actually actionable per status
// and canManageEvent). Per-survey detail/respond/results access is
// enforced in [id]/route.js and its sub-routes, not here.
export async function GET(req) {
  const { error, status, member } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })

  const { data, error: qErr } = await supabaseAdmin
    .from('surveys')
    .select('id, title, description, eligibility_mode, anonymous, results_visibility_outcome, results_visibility_turnout, coordinator_id, opened_at, closes_at, published_at, created_at, archived')
    .eq('archived', false)
    .order('created_at', { ascending: false })
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  const canManage = !!member.is_admin || await isAreaOwner(member.id, 'hub', 'surveys')

  const coordinatorIds = [...new Set(data.map(s => s.coordinator_id).filter(Boolean))]
  const coordinatorNames = {}
  if (coordinatorIds.length > 0) {
    const { data: coords } = await supabaseAdmin.from('members').select('id, name').in('id', coordinatorIds)
    for (const c of coords || []) coordinatorNames[c.id] = c.name
  }

  // Response-count ("turnout"), same shape as Voting's votesCast --
  // gated per-survey by results_visibility_turnout AND coordinator-only
  // (Change Request #3 -- canSeeResults's isCoordinator, never a blanket
  // admin/owner bypass). Only SUBMITTED responses count -- an in-progress
  // draft isn't a completed response yet.
  const turnoutEligibleIds = data
    .filter(s => computeSurveyStatus(s) !== 'draft' && canSeeResults(s, { field: 'results_visibility_turnout', isCoordinator: !!s.coordinator_id && s.coordinator_id === member.id }))
    .map(s => s.id)
  const responsesCountById = {}
  if (turnoutEligibleIds.length > 0) {
    const { data: respRows } = await supabaseAdmin
      .from('survey_responses').select('survey_id').in('survey_id', turnoutEligibleIds).not('submitted_at', 'is', null)
    for (const row of respRows || []) {
      responsesCountById[row.survey_id] = (responsesCountById[row.survey_id] || 0) + 1
    }
  }

  const surveys = data.map(s => ({
    ...s,
    status: computeSurveyStatus(s),
    canManageEvent: canManage || (!!s.coordinator_id && s.coordinator_id === member.id),
    coordinatorName: s.coordinator_id ? (coordinatorNames[s.coordinator_id] || null) : null,
    responsesCount: turnoutEligibleIds.includes(s.id) ? (responsesCountById[s.id] || 0) : null,
  }))
  return NextResponse.json({ surveys, isAdmin: !!member.is_admin, canManage })
}

// POST /api/surveys — create a new survey (Draft) + its items (questions
// attached from the bank, each with its own required flag and order) in
// one call. Admin or this hub's Owner only.
export async function POST(req) {
  const { error, status, member } = await requireAdminOrAreaOwner(req, 'hub', 'surveys')
  if (error) return NextResponse.json({ error }, { status })

  const body = await req.json().catch(() => ({}))
  const {
    title, description, eligibility_mode, anonymous,
    results_visibility_outcome, results_visibility_turnout,
    coordinator_id, closes_at, items,
  } = body

  if (!title || !String(title).trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'At least one question is required' }, { status: 400 })
  }
  const questionIds = items.map(i => i?.question_id).filter(Boolean)
  if (questionIds.length !== items.length || new Set(questionIds).size !== questionIds.length) {
    return NextResponse.json({ error: 'Every item needs a valid, unique question_id' }, { status: 400 })
  }

  // Confirm every referenced question actually exists (and isn't archived --
  // an archived question shouldn't be attachable to a NEW survey, though it
  // stays readable on any survey it was already attached to before archiving).
  const { data: questions, error: qErr } = await supabaseAdmin
    .from('survey_questions').select('id, archived').in('id', questionIds)
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
  const foundIds = new Set((questions || []).map(q => q.id))
  const missing = questionIds.filter(id => !foundIds.has(id))
  if (missing.length > 0) return NextResponse.json({ error: 'One or more questions were not found' }, { status: 400 })
  const archivedUsed = (questions || []).filter(q => q.archived).map(q => q.id)
  if (archivedUsed.length > 0) {
    return NextResponse.json({ error: 'One or more selected questions are archived and can\'t be added to a new survey' }, { status: 400 })
  }

  const { data: survey, error: insErr } = await supabaseAdmin
    .from('surveys')
    .insert({
      title: String(title).trim(),
      description: description || null,
      eligibility_mode: eligibility_mode === 'per_household' ? 'per_household' : 'per_resident',
      anonymous: !!anonymous,
      results_visibility_outcome: results_visibility_outcome === 'admin_only' ? 'admin_only' : 'residents',
      results_visibility_turnout: results_visibility_turnout === 'admin_only' ? 'admin_only' : 'residents',
      coordinator_id: coordinator_id || null,
      closes_at: closes_at || null,
      created_by: member.id,
    })
    .select()
    .single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  const itemRows = items.map((it, i) => ({
    survey_id: survey.id,
    question_id: it.question_id,
    sort_order: i,
    required: !!it.required,
  }))
  const { error: itemErr } = await supabaseAdmin.from('survey_items').insert(itemRows)
  if (itemErr) {
    // roll back the survey so a failed items-insert doesn't leave an orphaned Draft
    await supabaseAdmin.from('surveys').delete().eq('id', survey.id)
    return NextResponse.json({ error: itemErr.message }, { status: 500 })
  }

  return NextResponse.json({ survey: { ...survey, status: computeSurveyStatus(survey) } }, { status: 201 })
}
