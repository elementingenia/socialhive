// Hub notices (Iain, 2026-09-23) -- pure, dependency-free so it can be unit
// tested under plain Node (tests/unit/hubNotices.test.mjs).
//
// HUBS_WITH_MEMBERS = hubs with a Join/follow list (hub_followers). Survey
// targeting (lib/surveyAudience.js) uses it, so only add a hub here when it
// gets a FollowHubButton.
export const HUBS_WITH_MEMBERS = {
  movie: { label: "Show Time", home: "/movies" },
}

// HUBS_WITH_NOTICES = hubs whose Owner/admin can Post notice, and who hears.
//   audience "followers" -> everyone who Joined the hub (hub_followers)
//   audience "everyone"  -> every active resident. Social has no Join list
//     and already tells everyone about new events (Iain 2026-07-18), so its
//     notices go to everyone too (Iain 2026-11-04, reversing 2026-09-23).
// Special Events is not here: no Owner tier, no members. Groups & Clubs have
// their own per-club notices (club_notices, app/api/clubs/notices).
export const HUBS_WITH_NOTICES = {
  movie:  { label: "Show Time",   home: "/movies", audience: "followers" },
  social: { label: "Social Hive", home: "/social", audience: "everyone" },
}

export function hubHasNotices(hubType) {
  return Object.prototype.hasOwnProperty.call(HUBS_WITH_NOTICES, hubType)
}

export function hubNoticeHome(hubType) {
  return hubHasNotices(hubType) ? HUBS_WITH_NOTICES[hubType].home : null
}

// "followers" | "everyone" | null
export function hubNoticeAudience(hubType) {
  return hubHasNotices(hubType) ? HUBS_WITH_NOTICES[hubType].audience : null
}

// Plain-text preview for the notification message (content is RichEditor
// HTML). Same shape as app/api/clubs/notices/route.js's snippet.
export function noticeMessage(hubType, content) {
  const label = hubHasNotices(hubType) ? HUBS_WITH_NOTICES[hubType].label : "Hub"
  const plain = String(content || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
  const snippet = plain.length > 90 ? plain.slice(0, 88) + "…" : plain
  return `New ${label} notice: ${snippet}`
}

// Recipients = audience (followers or all active residents) minus the
// author, de-duplicated.
export function noticeRecipients(followerIds, authorId) {
  return [...new Set((followerIds || []).filter(id => id && id !== authorId))]
}

// Notifications carry no hub/url column, so the drawer recovers the hub from
// the message prefix noticeMessage() wrote ("New <label> notice: ...").
export function hubNoticeHomeFromMessage(message) {
  for (const { label, home } of Object.values(HUBS_WITH_NOTICES)) {
    if (String(message || "").startsWith(`New ${label} notice:`)) return home
  }
  return null
}
