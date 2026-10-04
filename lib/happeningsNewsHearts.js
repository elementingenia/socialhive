// Hearts on Happenings News posts (Iain, 2026-10-05) -- positive-only
// acknowledgement, no notifications. Pure logic only (no Supabase import),
// so tests/unit/happeningsNewsHearts.test.mjs runs without a live DB, same
// split as lib/happeningsNewsTier.js.

// Who may see the NAMES of people who hearted a post. Everyone sees the
// count; names are for a select group only (Iain: "its for a select group,
// not broadcast wide"): the post's author, admins, and anyone who can manage
// the event (its area Owner or current EC -- lib/areaAuth.js's
// requireEventManage, resolved by the caller).
export function canSeeHeartNames({ viewerId, isAdmin, posterId, canManageEvent }) {
  if (!viewerId) return false
  return !!isAdmin || viewerId === posterId || !!canManageEvent
}

// Group raw heart rows ({ post_id, member_id }) into per-post summaries for
// one viewer: { [postId]: { count, heartedByMe } }.
export function summariseHearts(rows, viewerId) {
  const out = {}
  for (const r of rows || []) {
    if (!r?.post_id) continue
    const s = out[r.post_id] || (out[r.post_id] = { count: 0, heartedByMe: false })
    s.count++
    if (viewerId && r.member_id === viewerId) s.heartedByMe = true
  }
  return out
}

// Read one post's summary with a safe default for posts nobody has hearted.
export function heartsFor(summary, postId) {
  return summary?.[postId] || { count: 0, heartedByMe: false }
}

// Screen-reader label for the heart button.
export function heartAriaLabel(hearted, count) {
  const action = hearted ? "Remove your heart" : "Heart this post"
  if (!count) return action
  return `${action} (${count} ${count === 1 ? "heart" : "hearts"})`
}

// Count shown next to the heart: nothing at zero, so an un-hearted post
// stays visually quiet.
export function heartCountText(count) {
  return count > 0 ? String(count) : ""
}
