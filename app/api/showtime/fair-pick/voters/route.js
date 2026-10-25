import { NextResponse } from "next/server"
import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { requireAdminOrAreaOwner } from "@/lib/areaAuth"
import { voterProfiles, filmVotes, typicalCount, voteNotes } from "@/lib/fairPick"
import { loadVotes, loadAttendance } from "@/lib/fairPickData"
import { resolveMemberName } from "@/lib/memberName"

export const dynamic = "force-dynamic"

// Who voted for one film, for Show Time > Manage > Pick a Film. Admins and
// Show Time Owners only (Iain, 2026-10-26: names are never shown by default,
// only when asked for, one film at a time). Private residents show their
// real name with "(P)", same as the attendee-list convention for managers.
//   GET ?movie=<id>&typical=<n>  (typical = the night's typical vote count
//   from the ranking, so weights here match the ranking exactly)
export async function GET(req) {
  const auth = await requireAdminOrAreaOwner(req, "hub", "movie")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const url = new URL(req.url)
  const movieId = url.searchParams.get("movie")
  if (!movieId) return NextResponse.json({ error: "Missing film" }, { status: 400 })

  try {
    const [votes, attendance] = await Promise.all([loadVotes(), loadAttendance()])
    const profiles = voterProfiles(votes)
    const mine = votes.filter(v => v.movie_id === movieId)
    const typical = Math.max(2, Number(url.searchParams.get("typical")) || typicalCount([mine.length]))
    const rows = filmVotes(mine, profiles, attendance, typical)

    const ids = [...new Set(rows.map(r => r.member_id))]
    const { data: members, error } = ids.length
      ? await supa.from("members").select("id, name, display_name, hide_name").in("id", ids)
      : { data: [] }
    if (error) throw new Error(error.message)
    const byId = Object.fromEntries((members || []).map(m => [m.id, m]))

    const voters = rows.map(r => {
      const m = byId[r.member_id]
      const name = m ? resolveMemberName(m, { canManage: true }) : "Former resident"
      return {
        name: m?.hide_name ? `${name} (P)` : name,
        score: r.score,
        attended: r.attended,
        notes: voteNotes(r, profiles[r.member_id]),
      }
    }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

    return NextResponse.json({ voters })
  } catch (e) {
    return NextResponse.json({ error: e.message || "Could not load voters" }, { status: 500 })
  }
}
