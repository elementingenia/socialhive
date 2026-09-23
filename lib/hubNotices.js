// Hub notices (Iain, 2026-09-23) -- pure, dependency-free so it can be unit
// tested under plain Node (tests/unit/hubNotices.test.mjs).
//
// A hub can carry notices ONLY if it has members (a Join/follow list in
// hub_followers) -- that list IS the audience. Social and Special Events
// deliberately have no members (Social broadcasts to everyone, Special has no
// Owner/member tier), so they never get notices. Groups & Clubs have their
// own per-club notices already (club_notices, app/api/clubs/notices).
//
// Add a hub here when (and only when) it gets a FollowHubButton.
export const HUBS_WITH_MEMBERS = {
  movie: { label: "Show Time", home: "/movies" },
}

export function hubHasNotices(hubType) {
  return Object.prototype.hasOwnProperty.call(HUBS_WITH_MEMBERS, hubType)
}

export function hubNoticeHome(hubType) {
  return HUBS_WITH_MEMBERS[hubType]?.home || null
}

// Plain-text preview for the notification message (content is RichEditor
// HTML). Same shape as app/api/clubs/notices/route.js's snippet.
export function noticeMessage(hubType, content) {
  const label = HUBS_WITH_MEMBERS[hubType]?.label || "Hub"
  const plain = String(content || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
  const snippet = plain.length > 90 ? plain.slice(0, 88) + "…" : plain
  return `New ${label} notice: ${snippet}`
}

// Recipients = followers minus the author, de-duplicated.
export function noticeRecipients(followerIds, authorId) {
  return [...new Set((followerIds || []).filter(id => id && id !== authorId))]
}

// Notifications carry no hub/url column, so the drawer recovers the hub from
// the message prefix noticeMessage() wrote ("New <label> notice: ...").
export function hubNoticeHomeFromMessage(message) {
  for (const { label, home } of Object.values(HUBS_WITH_MEMBERS)) {
    if (String(message || "").startsWith(`New ${label} notice:`)) return home
  }
  return null
}
