// Club notice notifications (BUG-082, 2026-10-06) -- pure, dependency-free so
// it can be unit tested under plain Node (tests/unit/clubNotices.test.mjs).
//
// club_notice_posted notifications carry no event_id and the notifications
// table has no club/url column, so tapping one in the drawer did nothing
// (it was deliberately "tick-only"). The message is always written as
// "New <club name> notice: <snippet>" by app/api/clubs/notices/route.js, so
// the club is recovered from that prefix and the tap opens /clubs/<slug>.

export function clubNoticeMessage(clubName, content) {
  const plain = String(content || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
  const snippet = plain.length > 90 ? plain.slice(0, 88) + "…" : plain
  return `New ${clubName} notice: ${snippet}`
}

// Matches against the real club list rather than regex-parsing the name, so a
// club name containing "notice" can't split wrongly. Longest name wins, so
// "Book Club Extra" beats "Book Club" for "New Book Club Extra notice: ...".
export function clubForNoticeMessage(message, clubs) {
  const msg = String(message || "")
  let best = null
  for (const c of clubs || []) {
    if (!c?.name || !c?.slug) continue
    if (msg.startsWith(`New ${c.name} notice:`) && (!best || c.name.length > best.name.length)) best = c
  }
  return best
}

// Where a club notice notification should open. A club that has since been
// renamed or archived falls back to the Groups & Clubs landing page rather
// than doing nothing.
export function clubNoticeLink(slug) {
  return slug ? `/clubs/${slug}` : "/clubs"
}
