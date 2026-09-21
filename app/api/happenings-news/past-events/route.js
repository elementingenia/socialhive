import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { isEventPast } from "@/lib/date"
import { isPostDueForArchive } from "@/lib/happeningsNewsTier"

export const dynamic = "force-dynamic"

// GET ?hub_type=movie or ?club_id=<uuid> — every past event in that hub/club
// (Iain, 2026-09-21: "closed by default but able to open and show all past
// non-archived events" -- EVERY past event, not just ones with a
// Happenings News post). Powers each hub's/club's own "Past Events"
// accordion. An event drops out once its Happenings News post has aged
// past the (single, hub-wide) archive delay -- computed on the fly here
// from created_at + the current setting rather than trusting a stored
// flag, so this never drifts out of sync with whether the daily cron has
// actually run yet today.
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const hubType = searchParams.get("hub_type")
  const clubId = searchParams.get("club_id")
  if (!hubType && !clubId) return NextResponse.json({ error: "hub_type or club_id required" }, { status: 400 })

  const { data: settings } = await supa.from("hub_settings").select("happenings_news_archive_days").eq("hub_type", "happenings_news").maybeSingle()
  const archiveDays = settings?.happenings_news_archive_days || 90

  let query = supa.from("events")
    .select("id, title, event_date, event_time, hub_type, club_id, happenings_news_posts(id, created_at)")
    .order("event_date", { ascending: false })
    .order("event_time", { ascending: false })
  query = clubId ? query.eq("club_id", clubId) : query.eq("hub_type", hubType).is("club_id", null)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const events = (data || [])
    .filter(e => isEventPast(e))
    .map(e => {
      const post = Array.isArray(e.happenings_news_posts) ? e.happenings_news_posts[0] : e.happenings_news_posts
      const archived = post ? isPostDueForArchive(post.created_at, archiveDays) : false
      return {
        id: e.id, title: e.title, event_date: e.event_date, event_time: e.event_time,
        post_id: post?.id || null, archived,
      }
    })
    .filter(e => !e.archived)

  return NextResponse.json({ events })
}
