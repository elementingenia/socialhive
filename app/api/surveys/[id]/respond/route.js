import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveMember } from '@/lib/areaAuth'
import { computeSurveyStatus, isEligibleForSurvey, validateAnswerShape, isAnswerEmpty, resolveCommentText } from '@/lib/surveys'

export const dynamic = 'force-dynamic'

// GET /api/surveys/[id]/respond — my own current response (draft or
// submitted) plus its answers, so the UI can resume where a resident left
// off (Iain, scope doc: "I suspect we should have a save option for a
// resident who starts but does not complete in one go, so they can pick up
// where they left off"). Answers come back keyed by question_id in the
// same shape POST accepts, so the form can be re-hydrated directly.
export async function GET(req, { params }) {
  const { error, status, member } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })

  const { data: survey, error: sErr } = await supabaseAdmin
    .from('surveys').select('*').eq('id', params.id).single()
  if (sErr || !survey) return NextResponse.json({ error: 'Survey not found' }, { status: 404 })

  const { data: response } = await supabaseAdmin
    .from('survey_responses').select('id, started_at, submitted_at')
    .eq('survey_id', survey.id).eq('member_id', member.id).maybeSingle()

  const answers = {}
  if (response) {
    const { data: rows } = await supabaseAdmin
      .from('survey_answers').select('question_id, choice_id, rating_value, free_text, yes_no, comment_text')
      .eq('response_id', response.id)
    for (const row of rows || []) {
      const existing = answers[row.question_id]
      // A comment-only row (multi_choice's dedicated comment row, or any
      // type's comment when the answer itself was left blank) has every
      // value column NULL except comment_text -- merge its comment onto
      // whatever's already in the bucket rather than treating it as a
      // distinct answer value. See 103_survey_comments.sql's header note.
      const isCommentOnlyRow = row.choice_id == null && row.rating_value == null && row.yes_no == null && row.free_text == null

      if (row.choice_id) {
        // multi_choice writes one row per selected choice — collect into
        // choice_ids; single_choice writes exactly one row, so choice_id
        // alone also covers that case.
        if (existing?.choice_ids) existing.choice_ids.push(row.choice_id)
        else if (existing?.choice_id) answers[row.question_id] = { ...existing, choice_id: existing.choice_id, choice_ids: [existing.choice_id, row.choice_id] }
        else answers[row.question_id] = { ...existing, choice_id: row.choice_id }
      } else if (row.rating_value != null) {
        answers[row.question_id] = { ...existing, rating_value: row.rating_value }
      } else if (row.yes_no != null) {
        answers[row.question_id] = { ...existing, yes_no: row.yes_no }
      } else if (row.free_text != null) {
        answers[row.question_id] = { ...existing, free_text: row.free_text }
      } else if (isCommentOnlyRow && !existing) {
        answers[row.question_id] = {}
      }
      if (row.comment_text != null) {
        answers[row.question_id] = { ...answers[row.question_id], comment: row.comment_text }
      }
    }
  }

  return NextResponse.json({
    survey: { ...survey, status: computeSurveyStatus(survey) },
    response: response ? { id: response.id, startedAt: response.started_at, submittedAt: response.submitted_at } : null,
    answers,
  })
}

// POST /api/surveys/[id]/respond — save a draft or submit final. Any
// eligible resident. Body: { answers: { [question_id]: answerObj }, submit: bool }.
//
// submit=false: upsert the response row (started_at set on first save,
// submitted_at left null) and wholesale-replace this response's answers
// with whatever was sent — the UI is expected to send its full current
// form state each save, not a diff. Partial/incomplete answers are fine;
// required-ness is only enforced at submit time.
//
// submit=true: same wholesale replace, but first every `required` item
// must have a non-empty answer, and submitted_at is set — from that point
// the response is locked (mirrors Voting's one-shot ballot: no further
// POST is accepted once submitted_at is set).
export async function POST(req, { params }) {
  const { error, status, member } = await resolveMember(req)
  if (error) return NextResponse.json({ error }, { status })

  const { data: survey, error: sErr } = await supabaseAdmin
    .from('surveys').select('*').eq('id', params.id).single()
  if (sErr || !survey) return NextResponse.json({ error: 'Survey not found' }, { status: 404 })

  if (computeSurveyStatus(survey) !== 'open') {
    return NextResponse.json({ error: 'This survey is not currently open for responses' }, { status: 400 })
  }

  const { data: cleanItems, error: ciErr } = await supabaseAdmin
    .from('survey_items')
    .select('question_id, required, allow_comment, question:survey_questions!inner(id, type, choices:survey_question_choices(id))')
    .eq('survey_id', survey.id)
  if (ciErr) return NextResponse.json({ error: ciErr.message }, { status: 500 })

  const { data: existing } = await supabaseAdmin
    .from('survey_responses').select('id, submitted_at')
    .eq('survey_id', survey.id).eq('member_id', member.id).maybeSingle()

  if (existing?.submitted_at) {
    return NextResponse.json({ error: 'You have already submitted a response to this survey' }, { status: 409 })
  }

  if (!existing && survey.eligibility_mode === 'per_household') {
    const { data: submitted } = await supabaseAdmin
      .from('survey_responses')
      .select('member_id, member:members!member_id(house_number)')
      .eq('survey_id', survey.id).not('submitted_at', 'is', null)
    const flat = (submitted || []).map(r => ({ member_id: r.member_id, house_number: r.member?.house_number }))
    const eligibility = isEligibleForSurvey(survey, member, flat)
    if (!eligibility.eligible) return NextResponse.json({ error: eligibility.reason }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const answers = body.answers && typeof body.answers === 'object' ? body.answers : {}
  const submit = !!body.submit

  // Validate every PROVIDED answer's shape, and (submit only) confirm every
  // required item has a non-empty one. A comment (survey_items.allow_comment,
  // 103_survey_comments.sql) is supplementary, never a substitute for the
  // answer itself -- a required question with only a comment and no real
  // answer still blocks submit, same as before this feature existed.
  const rows = []
  for (const item of cleanItems || []) {
    const q = item.question
    const answer = answers[item.question_id]
    const empty = !answer || isAnswerEmpty(q, answer)
    const comment = resolveCommentText(item, answer)

    if (submit && item.required && empty) {
      return NextResponse.json({ error: `"${q.prompt || 'A required question'}" needs an answer before you can submit.` }, { status: 400 })
    }
    if (empty && !comment) continue

    if (!empty) {
      const validChoiceIds = (q.choices || []).map(c => c.id)
      const shapeCheck = validateAnswerShape(q, answer, validChoiceIds)
      if (!shapeCheck.ok) return NextResponse.json({ error: shapeCheck.reason }, { status: 400 })
    }

    if (q.type === 'single_choice') {
      if (!empty) rows.push({ question_id: item.question_id, choice_id: answer.choice_id, comment_text: comment })
      else rows.push({ question_id: item.question_id, comment_text: comment }) // comment left, no choice picked
    } else if (q.type === 'multi_choice') {
      if (!empty) for (const choice_id of answer.choice_ids) rows.push({ question_id: item.question_id, choice_id })
      // multi_choice's own rows (one per choice) never carry choice_id NULL,
      // so a comment always gets its own dedicated row here regardless of
      // whether any choice was also selected -- see 103_survey_comments.sql.
      if (comment) rows.push({ question_id: item.question_id, comment_text: comment })
    } else if (q.type === 'rating') {
      if (!empty) rows.push({ question_id: item.question_id, rating_value: Number(answer.rating_value), comment_text: comment })
      else rows.push({ question_id: item.question_id, comment_text: comment })
    } else if (q.type === 'yes_no') {
      if (!empty) rows.push({ question_id: item.question_id, yes_no: !!answer.yes_no, comment_text: comment })
      else rows.push({ question_id: item.question_id, comment_text: comment })
    } else if (q.type === 'free_text') {
      // free_text can never carry a comment (canQuestionHaveComment) --
      // comment is always null here, nothing extra to do.
      if (!empty) rows.push({ question_id: item.question_id, free_text: String(answer.free_text) })
    }
  }

  let responseId = existing?.id
  if (!responseId) {
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('survey_responses')
      .insert({ survey_id: survey.id, member_id: member.id, submitted_at: submit ? new Date().toISOString() : null })
      .select().single()
    if (insErr) {
      if (insErr.code === '23505') return NextResponse.json({ error: 'You already have a response to this survey' }, { status: 409 })
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
    responseId = inserted.id
  } else if (submit) {
    const { error: updErr } = await supabaseAdmin
      .from('survey_responses').update({ submitted_at: new Date().toISOString() }).eq('id', responseId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  const { error: delErr } = await supabaseAdmin.from('survey_answers').delete().eq('response_id', responseId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (rows.length > 0) {
    const { error: ansErr } = await supabaseAdmin
      .from('survey_answers').insert(rows.map(r => ({ response_id: responseId, ...r })))
    if (ansErr) return NextResponse.json({ error: ansErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, submitted: submit })
}
