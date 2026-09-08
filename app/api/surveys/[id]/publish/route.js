import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireSurveyManage } from '@/lib/areaAuth'
import { computeSurveyStatus } from '@/lib/surveys'
import { notifyAllActiveMembers } from '@/lib/notifyAudience'

export const dynamic = 'force-dynamic'

// POST /api/surveys/[id]/publish — the manual Closed -> Published action.
// Admin, this hub's Owner, or the survey's own Coordinator (same
// management gate as open/close/edit) -- publishing is a lifecycle action,
// distinct from VIEWING the results themselves, which is coordinator-only
// with no Admin/Owner bypass at all (see .../results/route.js). An Admin
// or Owner can move a survey through Closed -> Published without ever
// seeing its results, same as they can open/close it without seeing
// turnout mid-flight.
//
// Broadcasts to every active member on publish (Iain, scope doc: "Yes
// Broadcast - its a rare event so not a fatigue issue really" -- confirmed
// for BOTH open and results-published, unlike Voting which only broadcasts
// on open).
export async function POST(req, { params }) {
  const { error, status, member } = await requireSurveyManage(req, params.id)
  if (error) return NextResponse.json({ error }, { status })

  const { data: survey, error: sErr } = await supabaseAdmin
    .from('surveys').select('*').eq('id', params.id).single()
  if (sErr || !survey) return NextResponse.json({ error: 'Survey not found' }, { status: 404 })

  if (computeSurveyStatus(survey) !== 'closed') {
    return NextResponse.json({ error: 'Only a Closed survey can be published' }, { status: 400 })
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('surveys').update({ published_at: new Date().toISOString() }).eq('id', survey.id).select().single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  await notifyAllActiveMembers(supabaseAdmin, null, 'survey_results_published',
    `Survey results are in: "${survey.title}"`, { excludeMemberId: member?.id })

  return NextResponse.json({ survey: { ...updated, status: computeSurveyStatus(updated) } })
}
