import { NextResponse } from "next/server"
import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { requireAdminOrAreaOwner } from "@/lib/areaAuth"
import { NIGHTS, inNight, suggestionStatus } from "@/lib/suggestionList"
import { communityAverages } from "@/lib/movieScores"
import { rankFilms } from "@/lib/fairPick"
import { loadVotes, loadAttendance, loadShowings } from "@/lib/fairPickData"
import { sydneyDateStrPlusDays } from "@/lib/date"

export const dynamic = "force-dynamic"

// Show Time > Manage > Pick a Film (lib/fairPick.js). Admins and Show Time
// Owners only. Returns the ranking for each night WITHOUT voter names --
// names come only from ./voters, on request, one film at a time.
//
// Candidates: films with at least one vote that are not booked for an
// upcoming showing, not shown in the last 12 months, and not retired from
// Suggestions (same rule residents see, lib/suggestionList.js).
const RECENT_SHOWN_DAYS = 365

export async function GET(req) {
  const auth = await requireAdminOrAreaOwner(req, "hub", "movie")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const [votes, attendance, showings, moviesRes] = await Promise.all([
      loadVotes(),
      loadAttendance(),
      loadShowings(),
      supa.from("movies").select("id, title, year, genre, poster_url, we_own, showtime_night, suggestion_retired_at, suggestion_clock_from, added_at"),
    ])
    if (moviesRes.error) throw new Error(moviesRes.error.message)

    const averages = communityAverages(votes)
    const recentCutoff = sydneyDateStrPlusDays(-RECENT_SHOWN_DAYS)
    const candidates = []
    for (const m of moviesRes.data || []) {
      if (!averages[m.id]) continue
      const s = showings[m.id]
      if (s?.upcoming) continue
      if (s?.lastShown && s.lastShown >= recentCutoff) continue
      if (suggestionStatus(m, averages[m.id]).status === "retired") continue
      candidates.push({
        id: m.id, title: m.title, year: m.year, poster_url: m.poster_url,
        we_own: !!m.we_own, showtime_night: m.showtime_night, genre: m.genre,
        lastShown: s?.lastShown || null,
      })
    }

    const nights = {}
    for (const n of NIGHTS) {
      const { ranked, needsVotes, typical } = rankFilms(candidates.filter(m => inNight(m, n.key)), votes, attendance)
      const strip = f => ({
        id: f.id, title: f.title, year: f.year, poster_url: f.poster_url, we_own: f.we_own,
        lastShown: f.lastShown, count: f.count, avg: f.avg, score: f.score,
        label: f.label || null, split: !!f.split,
      })
      nights[n.key] = { ranked: ranked.map(strip), needsVotes: needsVotes.map(strip), typical }
    }
    return NextResponse.json({ nights })
  } catch (e) {
    return NextResponse.json({ error: e.message || "Could not load the ranking" }, { status: 500 })
  }
}
