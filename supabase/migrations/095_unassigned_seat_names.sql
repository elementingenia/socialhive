-- Unassigned seat names (2026-09-04)
--
-- Special Events' "unassigned seats" (migration 094) was a bare headcount --
-- allow_unassigned_seats + unassigned_seats_count -- set once as a raw number
-- in the event's own Edit form. Iain, 2026-09-04, after actually trying to
-- use it: "How do unassigned seats get added? I cannot see an option for
-- this anywhere. ideally the option resides as an additional option for
-- booking seats that only appears when its an Admin or the EC. It should be
-- additive, so they do not need to keep increasing a count of seats but
-- just add two unassigned seats for two people who get named (free text)."
--
-- This adds a names array alongside the existing count. unassigned_seats_count
-- stays as the single source every existing capacity-math call site already
-- reads (booked totals in special-events/events/page.js, lib/modifyBooking.js,
-- lib/promoteWaitlist.js, app/api/bookings, app/api/coordinator's add_booking)
-- -- untouched by this migration -- but is now DERIVED server-side from
-- jsonb_array_length(unassigned_seat_names) by the new add/remove actions on
-- PATCH /api/coordinator, rather than hand-typed. Free text, not a resident/
-- contact link (same "no booking row at all" design as 094), so a plain
-- string array is enough -- no new table needed.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS unassigned_seat_names jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN events.unassigned_seat_names IS
  'Free-text names for unassigned seats (2026-09-04) -- no member/contact link, additive via PATCH /api/coordinator action=add_unassigned_seats. Length must always equal unassigned_seats_count.';
