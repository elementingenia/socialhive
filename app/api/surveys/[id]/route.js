import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveMember, isAreaOwner, requireSurveyManage } from '@/lib/areaAuth'
import { computeSurveyStatus, canSeeResults, isEligibleForSurvey } from '@/lib/surveys'

export const dynamic = 'force-dynamic'

// Replace a survey's whole coordinator set -- exact mirror of
// app/api/surveys/route.js's writeCoordinators (which mirrors
// app/api/social/route.js's own copy in turn) -- duplicated per-route rather
// than shared, same convention this file already follows elsewhere (e.g.
// lib/surveys.js's normalizeHouseNumber comment on why small
// dependency-free helpers get their own copy instead of an import).
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

// GET /api/surveys/[id] — survey + its questions/choices (in item order) +
// the viewer's own eligibility/participation state. Never returns any
// other resident's response — that's what /respond (my own draft) and
// /results (coordinator-gated, aggregated) are for. Mirrors
// app/api/voting/[id]/route.js's GET shape.
export async function GET(req, { params }) {
  const { error, status, member } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })

  const { data: survey, error: sErr } = await supabaseAdmin
    .from('surveys').select('*').eq('id', params.id).single()
  if (sErr || !survey) return NextResponse.json({ error: 'Survey not found' }, { status: 404 })

  // question_id (the raw FK, not just the nested question.id) MUST be
  // selected here -- app/(app)/surveys/page.js's respond form keys every
  // question's own slot in its `answers` state off `item.question_id`.
  // Omitting it left `item.question_id` `undefined` for every item, so
  // every question shared the exact same `answers[undefined]` bucket:
  // typing a comment in one question clobbered that shared slot (looked
  // like it "appeared" in every other comment-enabled question), and on
  // submit the server looked up `answers[<real question_id>]` -- which was
  // never populated -- so it wrote zero survey_answers rows for every
  // question regardless of what was actually answered. Confirmed with
  // evidence, not guessed: `answer_row_count` came back 0 in
  // information_schema-adjacent SQL for a fully-answered submitted
  // response, matching this exactly. results/route.js's own items query
  // already selected `question_id` correctly -- this file's GET was the
  // one missing it.
  const { data: items, error: iErr } = await supabaseAdmin
    .from('survey_items')
    .select('id, question_id, sort_order, required, allow_comment, question:survey_questions(id, type, prompt, helper_text, archived, choices:survey_question_choices(id, label, sort_order))')
    .eq('survey_id', survey.id)
    .order('sort_order')
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 })

  const surveyStatus = computeSurveyStatus(survey)

  const { data: myResponse } = await supabaseAdmin
    .from('survey_responses').select('id, started_at, submitted_at')
    .eq('survey_id', survey.id).eq('member_id', member.id).maybeSingle()

  let eligibility = { eligible: true }
  if (!myResponse && survey.eligibility_mode === 'per_household') {
    const { data: submitted } = await supabaseAdmin
      .from('survey_responses')
      .select('member_id, member:members!member_id(house_number)')
      .eq('survey_id', survey.id).not('submitted_at', 'is', null)
    const flat = (submitted || []).map(r => ({ member_id: r.member_id, house_number: r.member?.house_number }))
    eligibility = isEligibleForSurvey(survey, member, flat)
  }

  // Multiple coordinators per survey (survey_coordinators,
  // 104_survey_coordinators.sql -- replaces the old single coordinator_id
  // column, same join-table pattern every event-based hub already uses).
  const { data: ecRows } = await supabaseAdmin
    .from('survey_coordinators')
    .select('member_id, members!member_id(id, name)')
    .eq('survey_id', survey.id)
    .is('replaced_at', null)
  const coordinatorIds = (ecRows || []).map(ec => ec.member_id)
  const coordinatorNames = (ecRows || []).map(ec => ec.members?.name).filter(Boolean)
  const isCoordinator = coordinatorIds.includes(member.id)

  let turnout = null
  if (surveyStatus !== 'draft' && canSeeResults(survey, { field: 'results_visibility_turnout', isCoordinator })) {
    const { count } = await supabaseAdmin
      .from('survey_responses').select('id', { count: 'exact', head: true }).eq('survey_id', survey.id).not('submitted_at', 'is', null)
    turnout = { responsesCast: count || 0 }
  }

  const canManage = !!member.is_admin || await isAreaOwner(member.id, 'hub', 'surveys')
  const canManageEvent = canManage || isCoordinator

  return NextResponse.json({
    survey: { ...survey, status: surveyStatus },
    items,
    isAdmin: !!member.is_admin,
    canManage,
    canManageEvent,
    coordinatorIds,
    coordinatorNames,
    myResponse: myResponse ? { id: myResponse.id, startedAt: myResponse.started_at, submittedAt: myResponse.submitted_at } : null,
    eligibility,
    turnout,
  })
}

// PATCH /api/surveys/[id] — edit an existing survey. Admin, this hub's
// Owner, or the survey's own assigned Coordinator.
//
// Draft: full edit, including eligibility_mode/anonymous/items — nothing
// has been answered yet.
// Open/Closed: metadata-only (title/description/closes_at/coordinator/
// visibility toggles). eligibility_mode, anonymous, and items are locked
// once open — changing the question set or eligibility rule mid-survey
// would invalidate whatever's already been answered, same discipline as
// Voting's Draft-only field locking.
// Published: no edits at all.
export async function PATCH(req, { params }) {
  const { error, status, member } = await requireSurveyManage(req, params.id)
  if (error) return NextResponse.json({ error }, { status })

  const { data: survey, error: sErr } = await supabaseAdmin
    .from('surveys').select('*').eq('id', params.id).single()
  if (sErr || !survey) return NextResponse.json({ error: 'Survey not found' }, { status: 404 })

  const surveyStatus = computeSurveyStatus(survey)
  if (surveyStatus === 'published') {
    return NextResponse.json({ error: 'This survey has already been published and can no longer be edited' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const patch = {}

  if (body.title !== undefined) {
    if (!String(body.title || '').trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    patch.title = String(body.title).trim()
  }
  if (body.description !== undefined) patch.description = body.description ? String(body.description).trim() : null
  if (body.coordinator_ids !== undefined && !Array.isArray(body.coordinator_ids)) {
    return NextResponse.json({ error: 'coordinator_ids must be an array' }, { status: 400 })
  }
  if (Array.isArray(body.coordinator_ids) && body.coordinator_ids.length === 0) {
    return NextResponse.json({ error: 'At least one coordinator is required' }, { status: 400 })
  }
  if (body.results_visibility_outcome !== undefined) {
    patch.results_visibility_outcome = body.results_visibility_outcome === 'admin_only' ? 'admin_only' : 'residents'
  }
  if (body.results_visibility_turnout !== undefined) {
    patch.results_visibility_turnout = body.results_visibility_turnout === 'admin_only' ? 'admin_only' : 'residents'
  }
  if (body.closes_at !== undefined) {
    if (body.closes_at && new Date(body.closes_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Closing date/time must be in the future' }, { status: 400 })
    }
    patch.closes_at = body.closes_at || null
  }

  if (surveyStatus === 'draft') {
    if (body.eligibility_mode !== undefined) {
      patch.eligibility_mode = body.eligibility_mode === 'per_household' ? 'per_household' : 'per_resident'
    }
    if (body.anonymous !== undefined) patch.anonymous = !!body.anonymous

    if (Array.isArray(body.items)) {
      const questionIds = body.items.map(i => i?.question_id).filter(Boolean)
      if (questionIds.length !== body.items.length || new Set(questionIds).size !== questionIds.length) {
        return NextResponse.json({ error: 'Every item needs a valid, unique question_id' }, { status: 400 })
      }
      if (questionIds.length === 0) return NextResponse.json({ error: 'At least one question is required' }, { status: 400 })
      const { data: questions, error: qErr } = await supabaseAdmin
        .from('survey_questions').select('id, type, archived').in('id', questionIds)
      if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
      const foundIds = new Set((questions || []).map(q => q.id))
      const missing = questionIds.filter(id => !foundIds.has(id))
      if (missing.length > 0) return NextResponse.json({ error: 'One or more questions were not found' }, { status: 400 })
      const archivedUsed = (questions || []).filter(q => q.archived).map(q => q.id)
      if (archivedUsed.length > 0) {
        return NextResponse.json({ error: 'One or more selected questions are archived and can\'t be added to a survey' }, { status: 400 })
      }
      // allow_comment only makes sense for a type that isn't already a
      // freeform field itself -- see lib/surveys.js's canQuestionHaveComment.
      const typeById = Object.fromEntries((questions || []).map(q => [q.id, q.type]))
      const commentOnFreeText = body.items.filter(it => it.allow_comment && typeById[it.question_id] === 'free_text')
      if (commentOnFreeText.length > 0) {
        return NextResponse.json({ error: 'Free text questions already are a comment field — they can\'t also allow a separate comment' }, { status: 400 })
      }
      // Draft only, so no survey_answers rows can reference the old
      // survey_items ids yet — safe to replace wholesale.
      const { error: delErr } = await supabaseAdmin.from('survey_items').delete().eq('survey_id', survey.id)
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
      const { error: insErr } = await supabaseAdmin.from('survey_items').insert(
        body.items.map((it, i) => ({ survey_id: survey.id, question_id: it.question_id, sort_order: i, required: !!it.required, allow_comment: !!it.allow_comment }))
      )
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
  } else if (body.eligibility_mode !== undefined || body.anonymous !== undefined || body.items !== undefined) {
    return NextResponse.json({ error: 'Eligibility, anonymity, and questions can only be changed while this survey is still a Draft' }, { status: 400 })
  }

  // coordinator_ids lives in survey_coordinators, not a surveys column, so
  // it's written separately from `patch` -- but it's still an "always
  // editable, non-published" field, same tier as title/description/
  // closes_at/visibility above (not gated to Draft like items/eligibility).
  if (Array.isArray(body.coordinator_ids)) {
    await writeCoordinators(survey.id, body.coordinator_ids, member.id)
  }

  if (Object.keys(patch).length === 0) {
    const surveyOut = Array.isArray(body.coordinator_ids)
      ? await supabaseAdmin.from('surveys').select('*').eq('id', survey.id).single().then(r => r.data)
      : survey
    return NextResponse.json({ survey: { ...surveyOut, status: computeSurveyStatus(surveyOut) } })
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('surveys').update(patch).eq('id', survey.id).select().single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ survey: { ...updated, status: computeSurveyStatus(updated) } })
}

// DELETE /api/surveys/[id] — cancel/abandon a survey. Admin, this hub's
// Owner, or the survey's own assigned Coordinator. Allowed while Draft, or
// while Open PROVIDED zero residents have submitted a response so far
// (checked directly against survey_responses, not the viewer's own
// visibility-gated turnout figure — same reasoning as Voting's DELETE).
// Soft-deletes via `archived`.
export async function DELETE(req, { params }) {
  const { error, status } = await requireSurveyManage(req, params.id)
  if (error) return NextResponse.json({ error }, { status })

  const { data: survey, error: sErr } = await supabaseAdmin
    .from('surveys').select('*').eq('id', params.id).single()
  if (sErr || !survey) return NextResponse.json({ error: 'Survey not found' }, { status: 404 })

  const surveyStatus = computeSurveyStatus(survey)
  if (surveyStatus === 'closed' || surveyStatus === 'published') {
    return NextResponse.json({ error: 'This survey has already closed and can no longer be cancelled' }, { status: 400 })
  }

  if (surveyStatus === 'open') {
    const { count } = await supabaseAdmin
      .from('survey_responses').select('id', { count: 'exact', head: true }).eq('survey_id', survey.id).not('submitted_at', 'is', null)
    if ((count || 0) > 0) {
      return NextResponse.json({ error: 'This survey already has responses and can no longer be cancelled' }, { status: 400 })
    }
  }

  const { error: updErr } = await supabaseAdmin.from('surveys').update({ archived: true }).eq('id', survey.id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
