import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { isEventPast } from "@/lib/date"
import { isHappeningsNewsLive } from "@/lib/happeningsNewsTier"
import { digestWindow } from "@/lib/digest"

// Weekly Digest (Iain, 2026-10-02) -- server-side data gathering, shared by
// the Sunday cron (app/api/cron/weekly-digest) and the Digest page's API
// (app/api/digest) so the notification's counts and the page always agree.
//
// Visibility: nothing here that a resident couldn't already see elsewhere.
// Committee / Voting / Surveys / Happenings News are each only included
// while that area is switched on (same hub_settings flags Home's tiles read),
// so a hidden area never leaks into the digest.

function stripHtml(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
}
function snippet(s, n = 120) {
  const t = stripHtml(s)
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t
}

export async function gatherDigest(now = new Date()) {
  const { from, to, sinceIso } = digestWindow(now)
  const nowIso = now.toISOString()

  const { data: settings } = await supa.from("hub_settings")
    .select("hub_type, enabled, production_enabled")
    .in("hub_type", ["committee", "voting", "surveys", "happenings_news"])
  const flag = (k) => (settings || []).find(s => s.hub_type === k)
  const committeeOn = !!flag("committee")?.enabled
  const votingOn    = !!flag("voting")?.enabled
  const surveysOn   = !!flag("surveys")?.enabled
  const newsOn      = isHappeningsNewsLive(flag("happenings_news"))

  const [evRes, clubRes, newsRes, comRes, voteRes, survRes] = await Promise.all([
    supa.from("events").select("id, event_date, event_time, is_test")
      .eq("archived", false).gte("event_date", from).lte("event_date", to),
    supa.from("clubs").select("id, name, slug, colour, created_at")
      .eq("archived", false).gte("created_at", sinceIso).order("name"),
    newsOn
      ? supa.from("happenings_news_posts").select("id, event_id, created_at, event:events!event_id(title)")
          .gte("created_at", sinceIso).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    committeeOn
      ? supa.from("committee_posts").select("id, content, created_at")
          .eq("archived", false).gte("created_at", sinceIso).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    votingOn
      ? supa.from("voting_events").select("id, title, closes_at")
          .eq("archived", false).not("opened_at", "is", null).is("published_at", null).gt("closes_at", nowIso).order("closes_at")
      : Promise.resolve({ data: [] }),
    surveysOn
      ? supa.from("surveys").select("id, title, closes_at")
          .eq("archived", false).not("opened_at", "is", null).is("published_at", null).gt("closes_at", nowIso).order("closes_at")
      : Promise.resolve({ data: [] }),
  ])

  const events = (evRes.data || []).filter(e => !e.is_test && !isEventPast(e, now))
  const items = {
    newGroups: clubRes.data || [],
    news: (newsRes.data || []).map(p => ({ id: p.id, event_id: p.event_id, title: p.event?.title || "Event recap", created_at: p.created_at })),
    committee: (comRes.data || []).map(c => ({ id: c.id, snippet: snippet(c.content), created_at: c.created_at })),
    votes: voteRes.data || [],
    surveys: survRes.data || [],
  }
  const counts = {
    events: events.length,
    newGroups: items.newGroups.length,
    news: items.news.length,
    committee: items.committee.length,
    votes: items.votes.length,
    surveys: items.surveys.length,
  }
  return { window: { from, to }, counts, items }
}

/**
 * Invites this resident has received for events that are still ahead and
 * that they haven't booked. memberIds=null means "everyone" (cron use);
 * returns a Map memberId -> invite[].
 */
export async function pendingInvites(memberIds = null, now = new Date()) {
  let q = supa.from("event_invites")
    .select("id, event_id, to_member_id, created_at, from:members!from_member_id(id, name, display_name, hide_name), event:events!event_id(id, title, event_date, event_time, hub_type, club_id, archived, club:clubs!club_id(slug))")
    .order("created_at", { ascending: false })
  if (memberIds) q = q.in("to_member_id", memberIds)
  const { data: rows } = await q
  const live = (rows || []).filter(r => r.event && !r.event.archived && !isEventPast(r.event, now))
  if (live.length === 0) return new Map()

  const { data: booked } = await supa.from("bookings")
    .select("event_id, member_id")
    .in("event_id", [...new Set(live.map(r => r.event_id))])
    .neq("status", "cancelled")
  const bookedKey = new Set((booked || []).map(b => `${b.event_id}:${b.member_id}`))

  const byMember = new Map()
  for (const r of live) {
    if (bookedKey.has(`${r.event_id}:${r.to_member_id}`)) continue
    if (!byMember.has(r.to_member_id)) byMember.set(r.to_member_id, [])
    byMember.get(r.to_member_id).push(r)
  }
  return byMember
}
