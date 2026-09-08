import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminOrAreaOwner } from '@/lib/areaAuth'

export const dynamic = 'force-dynamic'

// Surveys' Question Bank -- see supabase/migrations/098_survey_question_bank.sql
// for the full design. Admin/Owner-only end to end (this is a management
// screen, not resident-facing -- residents only ever see a survey's own
// attached items via app/api/surveys/[id], never the raw bank).

const QUESTION_TYPES = ['single_choice', 'multi_choice', 'rating', 'free_text', 'yes_no']
const CHOICE_TYPES = ['single_choice', 'multi_choice']

// GET /api/survey-questions — list the bank, most recent first. Archived
// questions are included (so past surveys' items still resolve their own
// question text when read back) but flagged, so the bank UI can grey them
// out / hide them from "attach to a new survey" without losing history.
export async function GET(req) {
  const { error, status } = await requireAdminOrAreaOwner(req, 'hub', 'surveys')
  if (error) return NextResponse.json({ error }, { status })

  const { data: questions, error: qErr } = await supabaseAdmin
    .from('survey_questions')
    .select('id, type, prompt, helper_text, archived, created_by, created_at')
    .order('created_at', { ascending: false })
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  const ids = (questions || []).map(q => q.id)
  let choicesByQuestion = {}
  // `inUse` (2026-09-08 addition) -- lets the bank UI decide UP FRONT
  // whether to render the full edit form or the locked helper-text-only
  // one, instead of the resident guessing and getting a 400 back from
  // PATCH after filling everything in. Mirrors the exact "any survey_items
  // row referencing it" check [id]/route.js's PATCH already enforces
  // server-side -- this is purely a client-side UX shortcut, the real gate
  // stays on PATCH.
  let inUseIds = new Set()
  if (ids.length > 0) {
    const [{ data: choices, error: cErr }, { data: usedItems, error: uErr }] = await Promise.all([
      supabaseAdmin.from('survey_question_choices').select('id, question_id, label, sort_order').in('question_id', ids).order('sort_order'),
      supabaseAdmin.from('survey_items').select('question_id').in('question_id', ids),
    ])
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
    for (const c of choices || []) {
      if (!choicesByQuestion[c.question_id]) choicesByQuestion[c.question_id] = []
      choicesByQuestion[c.question_id].push(c)
    }
    inUseIds = new Set((usedItems || []).map(i => i.question_id))
  }

  return NextResponse.json({
    questions: (questions || []).map(q => ({ ...q, choices: choicesByQuestion[q.id] || [], inUse: inUseIds.has(q.id) })),
  })
}

// POST /api/survey-questions — author a new question. Choices are only
// accepted (and required, min 2) for single_choice/multi_choice -- any
// choices array is ignored for the other three types.
export async function POST(req) {
  const { error, status, member } = await requireAdminOrAreaOwner(req, 'hub', 'surveys')
  if (error) return NextResponse.json({ error }, { status })

  const body = await req.json().catch(() => ({}))
  const { type, prompt, helper_text, choices } = body

  if (!QUESTION_TYPES.includes(type)) {
    return NextResponse.json({ error: `Type must be one of: ${QUESTION_TYPES.join(', ')}` }, { status: 400 })
  }
  if (!prompt || !String(prompt).trim()) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
  }
  if (CHOICE_TYPES.includes(type)) {
    if (!Array.isArray(choices) || choices.filter(c => c && String(c.label || '').trim()).length < 2) {
      return NextResponse.json({ error: 'At least two choices are required for this question type' }, { status: 400 })
    }
  }

  const { data: question, error: insErr } = await supabaseAdmin
    .from('survey_questions')
    .insert({
      type,
      prompt: String(prompt).trim(),
      helper_text: helper_text || null,
      created_by: member.id,
    })
    .select()
    .single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  let insertedChoices = []
  if (CHOICE_TYPES.includes(type)) {
    const choiceRows = choices
      .filter(c => c && String(c.label || '').trim())
      .map((c, i) => ({ question_id: question.id, label: String(c.label).trim(), sort_order: i }))
    const { data: cData, error: choiceErr } = await supabaseAdmin
      .from('survey_question_choices').insert(choiceRows).select()
    if (choiceErr) {
      // roll back the question so a failed choice-insert doesn't leave an
      // orphaned choiceless question in the bank
      await supabaseAdmin.from('survey_questions').delete().eq('id', question.id)
      return NextResponse.json({ error: choiceErr.message }, { status: 500 })
    }
    insertedChoices = cData || []
  }

  return NextResponse.json({ question: { ...question, choices: insertedChoices } }, { status: 201 })
}
