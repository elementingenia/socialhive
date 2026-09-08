import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireSurveyManage } from '@/lib/areaAuth'
import { computeSurveyStatus } from '@/lib/surveys'
import { notifyAllActiveMembers } from '@/lib/notifyAudience'

export const dynamic = 'force-dynamic'

// POST /api/surveys/[id]/open — the manual Draft -> Open transition,
// mirrors app/api/voting/[id]/open/route.js exactly. Admin or this hub's
// Owner only (requireSurveyManage also allows the survey's own
// coordinator, same gate voting uses). Requires closes_at to already be
// set, or provided on this same call — Open->Closed is a live time
// comparison (lib/surveys.js's computeSurveyStatus), so there's nothing to
// auto-close against otherwise.
//
// Broadcasts to every active member the instant a survey opens (Iain,
// Social_Hive_Surveys_Scope_Answered.md: "Yes Broadcast - its a rare event
// so not a fatigue issue really" — confirmed for BOTH open and
// results-published, unlike Voting which only broadcasts on open).
//
// surveys is its own table, not the shared `events` table notifications
// .event_id references — so event_id stays null here, same convention as
// voting_opened. NotificationsDrawer.js's targetForNotif() routes
// survey_opened to /surveys directly by type.
export async function POST(req, { params }) {
  const { error, status, member } = await requireSurveyManage(req, params.id)
  if (error) return NextResponse.json({ error }, { status })

  const { data: survey, error: sErr } = await supabaseAdmin
    .from('surveys').select('*').eq('id', params.id).single()
  if (sErr || !survey) return NextResponse.json({ error: 'Survey not found' }, { status: 404 })

  if (computeSurveyStatus(survey) !== 'draft') {
    return NextResponse.json({ error: 'Only a Draft survey can be opened' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const closesAt = body.closes_at || survey.closes_at
  if (!closesAt) {
    return NextResponse.json({ error: 'Set a closing date/time before opening this survey' }, { status: 400 })
  }
  if (new Date(closesAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Closing date/time must be in the future' }, { status: 400 })
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('surveys').update({ opened_at: new Date().toISOString(), closes_at: closesAt }).eq('id', survey.id).select().single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  const closesFmt = new Date(closesAt).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  await notifyAllActiveMembers(supabaseAdmin, null, 'survey_opened',
    `New survey: "${survey.title}" — closes ${closesFmt}`, { excludeMemberId: member?.id })

  return NextResponse.json({ survey: { ...updated, status: computeSurveyStatus(updated) } })
}
