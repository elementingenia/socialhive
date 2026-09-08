import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireSurveyManage } from '@/lib/areaAuth'
import { computeSurveyStatus } from '@/lib/surveys'

export const dynamic = 'force-dynamic'

// POST /api/surveys/[id]/close — manual early close for an Open survey,
// mirrors app/api/voting/[id]/close/route.js. Admin, this hub's Owner, or
// the survey's own coordinator. Implemented as "bring closes_at forward to
// right now" rather than a stored status flag, so computeSurveyStatus
// stays the single source of truth.
export async function POST(req, { params }) {
  const { error, status } = await requireSurveyManage(req, params.id)
  if (error) return NextResponse.json({ error }, { status })

  const { data: survey, error: sErr } = await supabaseAdmin
    .from('surveys').select('*').eq('id', params.id).single()
  if (sErr || !survey) return NextResponse.json({ error: 'Survey not found' }, { status: 404 })

  if (computeSurveyStatus(survey) !== 'open') {
    return NextResponse.json({ error: 'Only an Open survey can be closed' }, { status: 400 })
  }

  const nowIso = new Date().toISOString()
  const { data: updated, error: updErr } = await supabaseAdmin
    .from('surveys').update({ closes_at: nowIso }).eq('id', survey.id).select().single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ survey: { ...updated, status: computeSurveyStatus(updated) } })
}
