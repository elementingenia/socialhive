import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminOrAreaOwner } from '@/lib/areaAuth'

export const dynamic = 'force-dynamic'

const QUESTION_TYPES = ['single_choice', 'multi_choice', 'rating', 'free_text', 'yes_no']
const CHOICE_TYPES = ['single_choice', 'multi_choice']

// PATCH /api/survey-questions/[id] — edit or archive a bank question.
//
// A question that has NEVER been attached to any survey (no survey_items
// row referencing it) can be fully edited, including type/prompt/choices --
// nothing depends on its current shape yet. Once it's been attached to at
// least one survey, changing type/prompt/choices would silently rewrite
// what that survey's respondents actually answered, so only `helper_text`
// and `archived` remain editable -- everything else is locked, same
// "protect what's already in use" discipline as Voting's Open-vs-Draft
// field locking in app/api/voting/[id]/route.js.
export async function PATCH(req, { params }) {
  const { error, status } = await requireAdminOrAreaOwner(req, 'hub', 'surveys')
  if (error) return NextResponse.json({ error }, { status })

  const { data: question, error: qErr } = await supabaseAdmin
    .from('survey_questions').select('*').eq('id', params.id).single()
  if (qErr || !question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

  const { count: usageCount, error: usageErr } = await supabaseAdmin
    .from('survey_items').select('id', { count: 'exact', head: true }).eq('question_id', params.id)
  if (usageErr) return NextResponse.json({ error: usageErr.message }, { status: 500 })
  const inUse = (usageCount || 0) > 0

  const body = await req.json().catch(() => ({}))
  const patch = {}

  if (body.helper_text !== undefined) patch.helper_text = body.helper_text || null
  if (body.archived !== undefined) patch.archived = !!body.archived

  if (!inUse) {
    if (body.type !== undefined) {
      if (!QUESTION_TYPES.includes(body.type)) {
        return NextResponse.json({ error: `Type must be one of: ${QUESTION_TYPES.join(', ')}` }, { status: 400 })
      }
      patch.type = body.type
    }
    if (body.prompt !== undefined) {
      if (!String(body.prompt || '').trim()) return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
      patch.prompt = String(body.prompt).trim()
    }
  } else if (body.type !== undefined || body.prompt !== undefined || body.choices !== undefined) {
    return NextResponse.json({
      error: 'This question is already attached to a survey — only its helper text and archived status can still change. Archive it and create a new question instead of editing its type, prompt, or choices.',
    }, { status: 400 })
  }

  const effectiveType = patch.type || question.type
  if (!inUse && Array.isArray(body.choices) && CHOICE_TYPES.includes(effectiveType)) {
    const cleanChoices = body.choices.filter(c => c && String(c.label || '').trim())
    if (cleanChoices.length < 2) {
      return NextResponse.json({ error: 'At least two choices are required for this question type' }, { status: 400 })
    }
    const { error: delErr } = await supabaseAdmin.from('survey_question_choices').delete().eq('question_id', params.id)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
    const { error: insErr } = await supabaseAdmin.from('survey_question_choices').insert(
      cleanChoices.map((c, i) => ({ question_id: params.id, label: String(c.label).trim(), sort_order: i }))
    )
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  if (Object.keys(patch).length > 0) {
    const { error: updErr } = await supabaseAdmin.from('survey_questions').update(patch).eq('id', params.id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  const { data: updated } = await supabaseAdmin.from('survey_questions').select('*').eq('id', params.id).single()
  const { data: choices } = await supabaseAdmin
    .from('survey_question_choices').select('id, label, sort_order').eq('question_id', params.id).order('sort_order')

  return NextResponse.json({ question: { ...updated, choices: choices || [] } })
}
