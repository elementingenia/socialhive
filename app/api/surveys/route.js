import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminOrAreaOwner, resolveMember, isAreaOwner } from '@/lib/areaAuth'
import { computeSurveyStatus, canSeeResults } from '@/lib/surveys'

export const dynamic = 'force-dynamic'

// Replace a survey's whole coordinator set -- exact mirror of
// app/api/social/route.js's writeCoordinators, scoped to survey_coordinators
// instead of event_coordinators (104_survey_coordinators.sql). Soft-replaces
// (never hard-deletes) the currently-active rows so history isn't lost, then
// inserts one fresh row per id in the new set. Called on both create and
// PATCH edit -- same "wholesale replace" semantics as this route already
// uses for survey_items.
async function writeCoordinators(surveyId, coordinatorIds, actorId) {
  await supabaseAdmin
    .from('survey_coordinators')
    .update({ replaced_at: new Date().toISOString(), replaced_by: actorId })
    .eq('survey_id', surveyId)
    .is('replaced_at', null)

  if (coordinatorIds?.length) {
    const rows = coordinatorIds.map(mid => ({
      survey_id: surveyId,
      member_id: mid,
      assigned_by: actorId,
    }))
    await supabaseAdmin.from('survey_coordinators').insert(rows)
  }
}

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
    .select('id, title, description, eligibility_mode, anonymous, results_visibility_outcome, results_visibility_turnout, opened_at, closes_at, published_at, created_at, archived')
    .eq('archived', false)
    .order('created_at', { ascending: false })
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  const canManage = !!member.is_admin || await isAreaOwner(member.id, 'hub', 'surveys')

  const surveyIds = data.map(s => s.id)
  // Multiple coordinators per survey (survey_coordinators,
  // 104_survey_coordinators.sql -- replaces the old single coordinator_id
  // column, same join-table pattern every event-based hub already uses).
  const coordIdsBySurvey = {}
  const coordNamesBySurvey = {}
  if (surveyIds.length > 0) {
    const { data: ecRows } = await supabaseAdmin
      .from('survey_coordinators')
      .select('survey_id, member_id, members!member_id(name)')
      .in('survey_id', surveyIds)
      .is('replaced_at', null)
    for (const ec of ecRows || []) {
      ;(coordIdsBySurvey[ec.survey_id] = coordIdsBySurvey[ec.survey_id] || []).push(ec.member_id)
      if (ec.members?.name) {
        ;(coordNamesBySurvey[ec.survey_id] = coordNamesBySurvey[ec.survey_id] || []).push(ec.members.name)
      }
    }
  }

  // Response-count ("turnout"), same shape as Voting's votesCast --
  // gated per-survey by results_visibility_turnout AND coordinator-only
  // (Change Request #3 -- canSeeResults's isCoordinator, never a blanket
  // admin/owner bypass). Only SUBMITTED responses count -- an in-progress
  // draft isn't a completed response yet.
  const turnoutEligibleIds = data
    .filter(s => computeSurveyStatus(s) !== 'draft' && canSeeResults(s, { field: 'results_visibility_turnout', isCoordinator: (coordIdsBySurvey[s.id] || []).includes(member.id) }))
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
    canManageEvent: canManage || (coordIdsBySurvey[s.id] || []).includes(member.id),
    coordinatorNames: coordNamesBySurvey[s.id] || [],
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
    coordinator_ids, closes_at, items,
  } = body

  if (!title || !String(title).trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  // At least one coordinator is required -- same rule as every event-based
  // hub's coordinator_ids validation (e.g. app/api/social/route.js POST).
  if (!Array.isArray(coordinator_ids) || coordinator_ids.length === 0) {
    return NextResponse.json({ error: 'At least one coordinator is required' }, { status: 400 })
  }
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
    .from('survey_questions').select('id, type, archived').in('id', questionIds)
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
  const foundIds = new Set((questions || []).map(q => q.id))
  const missing = questionIds.filter(id => !foundIds.has(id))
  if (missing.length > 0) return NextResponse.json({ error: 'One or more questions were not found' }, { status: 400 })
  const archivedUsed = (questions || []).filter(q => q.archived).map(q => q.id)
  if (archivedUsed.length > 0) {
    return NextResponse.json({ error: 'One or more selected questions are archived and can\'t be added to a new survey' }, { status: 400 })
  }
  // allow_comment only makes sense for a type that isn't already a freeform
  // field itself -- see lib/surveys.js's canQuestionHaveComment.
  const typeById = Object.fromEntries((questions || []).map(q => [q.id, q.type]))
  const commentOnFreeText = items.filter(it => it.allow_comment && typeById[it.question_id] === 'free_text')
  if (commentOnFreeText.length > 0) {
    return NextResponse.json({ error: 'Free text questions already are a comment field — they can\'t also allow a separate comment' }, { status: 400 })
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
    allow_comment: !!it.allow_comment,
  }))
  const { error: itemErr } = await supabaseAdmin.from('survey_items').insert(itemRows)
  if (itemErr) {
    // roll back the survey so a failed items-insert doesn't leave an orphaned Draft
    await supabaseAdmin.from('surveys').delete().eq('id', survey.id)
    return NextResponse.json({ error: itemErr.message }, { status: 500 })
  }

  await writeCoordinators(survey.id, coordinator_ids, member.id)

  return NextResponse.json({ survey: { ...survey, status: computeSurveyStatus(survey) } }, { status: 201 })
}
