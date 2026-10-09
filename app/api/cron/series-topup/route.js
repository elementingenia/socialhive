import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { generateSeriesEvents } from "@/lib/generateSeriesEvents"
import { notify } from "@/lib/notify"
import { sydneyTodayStr, sydneyDateStrPlusDays } from "@/lib/date"
import { TBA_NUDGE_DAYS, needsTbaNudge } from "@/lib/showtimeSeries"
import { shortDate } from "@/lib/residentShowing"

// Daily top-up: as time passes and past occurrences fall away, extend each
// active 'series' back out to its horizon. Silent — generating new dates is
// housekeeping, not news (scope §9). Same cron pattern/guarding as
// book-return-check: force-dynamic + no-store admin client so it reads its own
// just-written rows freshly, and fail-closed on a missing CRON_SECRET.
//
// Show Time (migration 135, Iain 2026-10-10): rolling runs are topped up here
// too (fixed runs are skipped inside generateSeriesEvents), and a date still
// "To be announced" 3 days out sends its coordinators one nudge.
export const dynamic = "force-dynamic"

async function nudgeTbaDates() {
  const today = sydneyTodayStr()
  const until = sydneyDateStrPlusDays(TBA_NUDGE_DAYS)
  const { data: events } = await supa.from("events")
    .select("id, event_date, showing_name, content_tba, archived, tba_nudged_at")
    .eq("hub_type", "movie").eq("content_tba", true).eq("archived", false)
    .is("tba_nudged_at", null).gte("event_date", today).lte("event_date", until)
  const due = (events || []).filter(e => needsTbaNudge(e, today, until))
  let sent = 0
  for (const ev of due) {
    const { data: coords } = await supa.from("event_coordinators")
      .select("member_id").eq("event_id", ev.id).is("replaced_at", null)
    const ids = [...new Set((coords || []).map(c => c.member_id).filter(Boolean))]
    const name = ev.showing_name ? `${ev.showing_name} on ` : ""
    const msg = `${name}${shortDate(ev.event_date)} is still To be announced. Tap Edit on the showing to choose what's on.`
    await Promise.all(ids.map(id => notify(id, ev.id, "showtime_tba_nudge", msg, "/screenings?event=" + ev.id)))
    await supa.from("events").update({ tba_nudged_at: new Date().toISOString() }).eq("id", ev.id)
    sent += ids.length
  }
  return { dates: due.length, sent }
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") || ""
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const { data: seriesList } = await supa.from("event_series")
    .select("*").eq("status", "active").eq("mode", "series")

  let created = 0, touched = 0
  for (const s of seriesList || []) {
    try {
      const r = await generateSeriesEvents(s)
      created += r.created
      if (r.created) touched++
    } catch (_) { /* one bad series must not stop the rest */ }
  }

  let tba = { dates: 0, sent: 0 }
  try { tba = await nudgeTbaDates() } catch (_) { /* never block the top-up */ }

  return NextResponse.json({ ok: true, series: (seriesList || []).length, filled: touched, created, tba_nudges: tba })
}
