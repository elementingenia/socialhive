// Club capability helpers (Phase 2b).
//
// The whole point of the Clubs engine is that behaviour comes from a club's
// CONFIG, not from a hardcoded hub name. Before this, 16 places across the app
// branched on `hub_type === 'bookclub'` — which breaks silently the moment Book
// Club becomes one club among many. Every one of those checks becomes a
// capability question answered here.

export function clubCaps(club) {
  return {
    hasBooks:      club?.catalogue_module === "books",
    hasBookReturn: !!club?.has_book_return,
    hasKitReturn:  !!club?.has_kit_return,
    hasTheme:      !!club?.has_theme,
    hasCost:       !!club?.has_cost,
    bringEnabled:  !!club?.bring_enabled,
  }
}

// A club event is identified by club_id, never by hub_type.
export function isClubEvent(event) {
  return !!(event?.club_id || event?.club?.id)
}

export function clubColour(club) {
  return club?.colour || "var(--purple)"
}

// Does this event carry a physical item that gets lent out and returned
// (Book Club's kit copies)? Replaces `hub_type === 'bookclub' && book_id`.
export function tracksLoanedItem(club, event) {
  return clubCaps(club).hasBookReturn && !!(event?.book_id || event?.book?.id)
}

// Per-club bottom-nav items. Suggestions only appears when that club actually
// has a catalogue module built — so Dinner Club shows just Home + Dinner Club.
export function clubNavItems(club) {
  if (!club) return []
  const items = [{ path: `/clubs/${club.slug}`, label: club.name, exact: true }]
  if (clubCaps(club).hasBooks) {
    items.push({ path: `/clubs/${club.slug}/suggestions`, label: "Suggest" })
  }
  return items
}
