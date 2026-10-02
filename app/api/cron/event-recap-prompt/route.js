import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notify } from "@/lib/notify"
import { sydneyDateStrPlusDays, sydneyTodayStr } from "@/lib/date"
import {
  isHappeningsNewsLive, recapPromptDue, recapPromptRecipients, recapPromptMessage,
  RECAP_PROMPT_LOOKBACK_DAYS,
} from "@/lib/happeningsNewsTier"
import { recapPromptLink } from "@/lib/eventNav"

// Same shape as the other crons (event-reminder-check etc.): force-dynamic so
// supabase-js reads aren't served from Next's fetch Data Cache (a just-written
// recap_prompted_at would otherwise read back stale on the next run), GET
// only, CRON_SECRET fail-closed.
export const dynamic = "force-dynamic"

// Post-event Happenings News recap nudge (Iain, 2026-10-02): once an event
// has finished, its current Event Coordinators get one positive reminder to
// post a recap. Runs daily the morning after (vercel.json, 22:00 UTC = 9am
// AEDT / 8am AEST) -- Iain: "Next morning is fine". An event with no End Time
// counts as finished at the end of its day (lib/date.js eventHasEnded).
// Once-only per event via events.recap_prompted_at (migration 117).
export async function GET(req) {
  const configuredSecret = process.env.CRON_SECRET
  if (!configuredSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 })
  }
  const auth = req.headers.get("authorization") || ""
  if (auth !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  // No point nudging anyone to post somewhere residents can't see. Events
  // are deliberately NOT marked as prompted here, so they're picked up once
  // Happenings News goes live -- the lookback window stops that turning into
  // a flood of old nudges.
  const { data: settings } = await supa.from("hub_settings")
    .select("enabled, production_enabled").eq("hub_type", "happenings_news").maybeSingle()
  if (!isHappeningsNewsLive(settings)) {
    return NextResponse.json({ ok: true, skipped: "happenings_news_not_live", prompted: 0 })
  }

  const now = new Date()
  const earliest = sydneyDateStrPlusDays(-RECAP_PROMPT_LOOKBACK_DAYS, now)
  const today = sydneyTodayStr(now)

  const { data: events, error } = await supa
    .from("events")
    .select("id, title, event_date, event_time, event_end_time, hub_type, club_id, archived, recap_prompted_at, club:clubs!club_id(slug), happenings_news_posts(id), event_coordinators(member_id, replaced_at)")
    .eq("archived", false)
    .is("recap_prompted_at", null)
    .gte("event_date", earliest)
    .lte("event_date", today)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const due = (events || []).filter(ev => recapPromptDue(ev, earliest, now))

  let prompted = 0, notified = 0
  for (const ev of due) {
    const url = recapPromptLink({ hubType: ev.hub_type, eventId: ev.id, clubId: ev.club_id, clubSlug: ev.club?.slug })
    const msg = recapPromptMessage(ev.title)
    for (const memberId of recapPromptRecipients(ev)) {
      await notify(memberId, ev.id, "event_recap_prompt", msg, url)
      notified++
    }
    // Stamped even when the event has no current coordinator -- there's
    // no-one to nudge, and re-scanning it every day achieves nothing.
    await supa.from("events").update({ recap_prompted_at: new Date().toISOString() }).eq("id", ev.id)
    prompted++
  }

  return NextResponse.json({ ok: true, checked: (events || []).length, prompted, notified })
}
