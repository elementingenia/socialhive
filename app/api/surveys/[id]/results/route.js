import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveMember, isAreaOwner } from '@/lib/areaAuth'
import { computeSurveyStatus, canSeeResults } from '@/lib/surveys'

export const dynamic = 'force-dynamic'

// GET /api/surveys/[id]/results — the full collated results view.
//
// Gate (Iain, clarifying Q&A 2026-09-08 -- "Does 'coordinator-only
// results' mean Admin/Owner are locked out of the results PAGE entirely,
// not just the tally?" -> "Admins/Owners fully locked out of results
// (recommended)"):
//   - The survey's own assigned Coordinator: full access WITH identity
//     attached to every answer, but ONLY when the survey is not marked
//     anonymous -- see the CORRECTED note below, this changed 2026-09-09.
//   - Admin or this hub's Owner who is NOT also the coordinator: BLOCKED
//     outright, full stop -- this is a stricter rule than
//     lib/voting.js's canSeeResults() alone gives you (that function only
//     removes the automatic bypass; an admin who isn't the coordinator
//     would still fall through to the same `results_visibility_*` toggle
//     as any resident). Surveys draws a sharper line: an admin/owner gets
//     NO path into this page unless they're the named coordinator.
//   - An ordinary resident (not admin, not owner, not coordinator): sees
//     an ANONYMIZED aggregate (no names attached) when
//     results_visibility_outcome is 'residents', same toggle Voting uses.
//     Free-text answers and comments are listed without any identity in
//     this case.
//
// CORRECTED 2026-09-09 (Iain, reviewing the original scope doc's item 1 in
// production -- see lib/surveys.js's header comment for the full note):
// the original design let the Coordinator see identity unconditionally,
// anonymous survey or not. That's now WRONG. `identityAllowed` must gate
// on `!survey.anonymous` as well as `isCoordinator` -- when a survey is
// marked anonymous, NOBODY sees identity, Coordinator included, only the
// aggregate. The Coordinator's always-sees-identity behaviour only applies
// when the survey is NOT anonymous.
export async function GET(req, { params }) {
  const { error, status, member } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })

  const { data: survey, error: sErr } = await supabaseAdmin
    .from('surveys').select('*').eq('id', params.id).single()
  if (sErr || !survey) return NextResponse.json({ error: 'Survey not found' }, { status: 404 })

  const surveyStatus = computeSurveyStatus(survey)
  if (surveyStatus !== 'closed' && surveyStatus !== 'published') {
    return NextResponse.json({ error: 'Results are only available once this survey has closed' }, { status: 400 })
  }

  // Multiple coordinators per survey (survey_coordinators,
  // 104_survey_coordinators.sql) -- any of them counts as THE coordinator
  // for this gate, identical to how the old single coordinator_id worked.
  const { data: ecRows } = await supabaseAdmin
    .from('survey_coordinators').select('member_id').eq('survey_id', survey.id).is('replaced_at', null)
  const isCoordinator = (ecRows || []).some(ec => ec.member_id === member.id)
  let identityAllowed = false

  if (isCoordinator) {
    // Coordinator always gets PAST this gate -- they never see the 403 an
    // outside Admin/Owner would -- but identity is only actually attached
    // when the survey isn't anonymous. An anonymous survey's Coordinator
    // still sees the aggregate below, same shape a resident would, just
    // without the "not visible to residents" toggle applying to them.
    identityAllowed = !survey.anonymous
  } else {
    const isAdminOrOwner = !!member.is_admin || await isAreaOwner(member.id, 'hub', 'surveys')
    if (isAdminOrOwner) {
      return NextResponse.json({ error: "Only this survey's assigned coordinator can view its results." }, { status: 403 })
    }
    if (!canSeeResults(survey, { field: 'results_visibility_outcome', isCoordinator })) {
      return NextResponse.json({ error: 'Results for this survey are not visible to residents.' }, { status: 403 })
    }
    identityAllowed = false
  }

  const { data: items, error: iErr } = await supabaseAdmin
    .from('survey_items')
    .select('question_id, sort_order, required, allow_comment, question:survey_questions!inner(id, type, prompt, helper_text, choices:survey_question_choices(id, label, sort_order))')
    .eq('survey_id', survey.id)
    .order('sort_order')
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 })

  const { data: responses, error: rErr } = await supabaseAdmin
    .from('survey_responses')
    .select('id, member_id, submitted_at' + (identityAllowed ? ', member:members!member_id(name, display_name, house_number)' : ''))
    .eq('survey_id', survey.id)
    .not('submitted_at', 'is', null)
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })

  const responseIds = (responses || []).map(r => r.id)
  let answerRows = []
  if (responseIds.length > 0) {
    const { data: rows, error: aErr } = await supabaseAdmin
      .from('survey_answers').select('response_id, question_id, choice_id, rating_value, free_text, yes_no, comment_text')
      .in('response_id', responseIds)
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })
    answerRows = rows || []
  }

  if (identityAllowed) {
    // Coordinator view: full per-response detail, identity attached.
    const answersByResponse = {}
    for (const row of answerRows) {
      const bucket = (answersByResponse[row.response_id] ||= {})
      const existing = bucket[row.question_id]
      if (row.choice_id) {
        if (existing?.choice_ids) existing.choice_ids.push(row.choice_id)
        else if (existing?.choice_id) bucket[row.question_id] = { ...existing, choice_ids: [existing.choice_id, row.choice_id] }
        else bucket[row.question_id] = { ...existing, choice_id: row.choice_id }
      } else if (row.rating_value != null) bucket[row.question_id] = { ...existing, rating_value: row.rating_value }
      else if (row.yes_no != null) bucket[row.question_id] = { ...existing, yes_no: row.yes_no }
      else if (row.free_text != null) bucket[row.question_id] = { ...existing, free_text: row.free_text }
      // A comment-only row (multi_choice's dedicated comment row, or any
      // type's comment left with no answer) has no value column set at all
      // -- only `comment_text` below actually needs to land in the bucket.
      if (row.comment_text != null) bucket[row.question_id] = { ...bucket[row.question_id], comment: row.comment_text }
    }
    const detailedResponses = (responses || []).map(r => ({
      id: r.id,
      submittedAt: r.submitted_at,
      member: { name: r.member?.display_name || r.member?.name || 'Unknown', house_number: r.member?.house_number || null },
      answers: answersByResponse[r.id] || {},
    }))
    return NextResponse.json({
      survey: { ...survey, status: surveyStatus },
      items,
      responseCount: detailedResponses.length,
      mode: 'coordinator',
      responses: detailedResponses,
    })
  }

  // Resident (toggle-visible) view: anonymized aggregate only. Comments
  // (survey_items.allow_comment) are never identity-attached here -- same
  // as free_text always was -- so they surface as a plain list even on an
  // anonymous survey, same as the Coordinator's own view of an anonymous
  // survey does (identityAllowed is false there too, so it lands in this
  // same branch).
  const tally = {}
  const comments = {}
  for (const item of items || []) {
    const q = item.question
    if (q.type === 'single_choice' || q.type === 'multi_choice') {
      tally[q.id] = Object.fromEntries((q.choices || []).map(c => [c.id, 0]))
    } else if (q.type === 'rating') {
      tally[q.id] = { sum: 0, count: 0, distribution: {} }
    } else if (q.type === 'yes_no') {
      tally[q.id] = { yes: 0, no: 0 }
    } else if (q.type === 'free_text') {
      tally[q.id] = []
    }
    if (item.allow_comment) comments[q.id] = []
  }
  for (const row of answerRows) {
    const bucket = tally[row.question_id]
    if (row.comment_text != null && comments[row.question_id]) comments[row.question_id].push(row.comment_text)
    if (!bucket) continue
    if (row.choice_id != null && typeof bucket === 'object' && !Array.isArray(bucket)) {
      if (row.choice_id in bucket) bucket[row.choice_id] += 1
    } else if (row.rating_value != null && 'count' in bucket) {
      bucket.sum += row.rating_value
      bucket.count += 1
      bucket.distribution[row.rating_value] = (bucket.distribution[row.rating_value] || 0) + 1
    } else if (row.yes_no != null && 'yes' in bucket) {
      if (row.yes_no) bucket.yes += 1; else bucket.no += 1
    } else if (row.free_text != null && Array.isArray(bucket)) {
      bucket.push(row.free_text)
    }
  }

  return NextResponse.json({
    survey: { ...survey, status: surveyStatus },
    items,
    responseCount: (responses || []).length,
    mode: 'aggregate',
    tally,
    comments,
  })
}
