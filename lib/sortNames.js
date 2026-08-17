// Attendee-list ordering, applied everywhere a booking/attendee roster is
// shown (Iain, 2026-08-04): "You" (the viewer's own booking) always pinned
// to the top, then everyone else A-Z -- the same A-Z standard already
// applied to every dropdown (Iain, 2026-07-31: "This should be true at all
// times for all dropdowns unless otherwise stated"), extended here to
// attendee lists. The app has no separate first/last name field, so this
// sorts on the single name string as stored/displayed.
//
// Four call sites had each grown their own "own row first" comparator with
// no secondary sort at all (app/(app)/social/events/page.js,
// app/(app)/screenings/page.js, components/EventSlideOut.js's coordinator
// panel, components/ClubHome.js's attendee list) -- same drift pattern as
// the attendee-naming picker before it was unified into
// components/AttendeeNamingPicker.js.
export function byOwnThenName(isOwnA, isOwnB, nameA, nameB) {
  if (isOwnA !== isOwnB) return isOwnA ? -1 : 1
  return (nameA || "").localeCompare(nameB || "", undefined, { sensitivity: "base" })
}

// "1st"/"2nd"/"3rd"/"4th"... for a 1-indexed queue position (Iain,
// 2026-08-17: waitlist position needs to be visible to the Admin/Owner/EC
// attendee view, in queue order rather than A-Z). Same English ordinal
// suffix rule already used inline for recurrence dates (lib/recurrence.js)
// -- centralised here since this is now the second call site.
export function ordinal(n) {
  const suffix = (n % 10 === 1 && n % 100 !== 11) ? "st"
    : (n % 10 === 2 && n % 100 !== 12) ? "nd"
    : (n % 10 === 3 && n % 100 !== 13) ? "rd"
    : "th"
  return `${n}${suffix}`
}
