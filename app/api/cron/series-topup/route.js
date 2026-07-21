import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { generateSeriesEvents } from "@/lib/generateSeriesEvents"

// Daily top-up: as time passes and past occurrences fall away, extend each
// active 'series' back out to its horizon. Silent — generating new dates is
// housekeeping, not news (scope §9). Same cron pattern/guarding as
// book-return-check: force-dynamic + no-store admin client so it reads its own
// just-written rows freshly, and fail-closed on a missing CRON_SECRET.
export const dynamic = "force-dynamic"

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
  return NextResponse.json({ ok: true, series: (seriesList || []).length, filled: touched, created })
}
