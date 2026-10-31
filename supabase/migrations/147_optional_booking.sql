-- 147: Optional booking + no-limit seats (Iain, 2026-10-31).
-- Scope: claude/Element_Happenings_Optional_RSVP_and_ShowTime_Village_Scope_Answered.md
--
-- booking_optional: "No need to book, but let us know if you're coming."
--   Residents can tap I'm coming (a normal booking underneath). No seat limit,
--   nobody is waitlisted. Payment still works if the event is paid.
-- seats_unlimited: bookings are taken with no seat limit (a Show Time village
--   showing set to "No limit"). booking_optional always implies it.
-- max_seats stays as it is on these rows; the code ignores it when either
-- flag is on.
-- Additive, both default false (current behaviour). The new code SELECTs
-- these columns, so run this BEFORE merging the PR.
-- Existing tables: no new grants needed (Coding Standard #10).
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS booking_optional boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seats_unlimited  boolean NOT NULL DEFAULT false;
ALTER TABLE public.event_series
  ADD COLUMN IF NOT EXISTS booking_optional boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seats_unlimited  boolean NOT NULL DEFAULT false;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_optional_unlimited_check;
ALTER TABLE public.events ADD CONSTRAINT events_optional_unlimited_check
  CHECK (NOT booking_optional OR seats_unlimited);
