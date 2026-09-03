-- 094_special_events_hub.sql
--
-- Special Events hub -- new feature (Iain, 2026-09-04, verbatim):
-- "Special Events. Like Voting, needs to be a toggle to activate this so it
-- can be off MOST of the time and not clutter the UI. Same design as
-- Social. One additional feature - able to add seats without associating
-- seat to a resident - toggle to allow this option in an event. No need
-- for Page text in Admin. No Owner is needed."
--
-- Confirmed with Iain before building:
--   - "add seats without associating to a resident" = an EC/admin-only raw
--     headcount bump on the EVENT itself (no booking row, no member_id/
--     contact_id at all) -- not a nameless guest seat within a booking
--     (that already exists via allow_nonresident_guests/require_attendee_names
--     off, which still ties the seat to the booking's owner).
--   - Reuse events/bookings/booking_attendees/event_coordinators -- same
--     infrastructure Social/Movies/Clubs already share via hub_type. No new
--     tables needed (unlike Voting, which needed genuine ballot anonymity).
--   - No Owner tier: deliberately NOT added to space_owners or to
--     app/api/hub-settings/route.js's HUB_TYPE_TO_OWNER_KEY map, so
--     lib/areaAuth.js's isAreaOwner('hub','special') can never return true
--     and every requireAdminOrAreaOwner/requireEventManage check on this hub
--     degrades to admin-only (create) / admin-or-this-event's-EC (manage) --
--     exactly "admin + per-event EC only, no Owner" with zero new auth code.
--
-- ============================================================================
-- SAFE TO RUN ON LIVE PRODUCTION. Purely additive.
-- ============================================================================
--
-- Three things:
--   1. Widen events_hub_type_check to add 'special' (same shape as 045/086).
--   2. Add events.allow_unassigned_seats (bool, default false) -- per-event
--      toggle exposing the headcount field below in the event form.
--   3. Add events.unassigned_seats_count (int, default 0) -- the raw
--      headcount itself. Defaults mean this is a no-op for every existing
--      hub/event: the shared seat-availability math in
--      app/api/bookings/route.js, app/api/coordinator/route.js,
--      lib/modifyBooking.js and lib/promoteWaitlist.js now subtracts this
--      column, but it can only ever be non-zero on a 'special' event, since
--      the toggle to set it above zero is only exposed in the Special
--      Events event form.
--   4. Seed one hub_settings row, enabled=false (Voting's pattern, migration
--      088) -- hidden from Home until an admin turns it on via
--      /special-events/manage. Deliberately NOT given a welcome_text/
--      sub_messages value and the hub's own manage screen deliberately does
--      not render HubTextSection -- "No need for Page text in Admin."
--
-- Run in the Supabase SQL editor. Safe to run repeatedly.

BEGIN;

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_hub_type_check;
ALTER TABLE events ADD CONSTRAINT events_hub_type_check
  CHECK (hub_type IN ('movie', 'bookclub', 'social', 'outings', 'club', 'shed', 'space', 'special'));

ALTER TABLE events ADD COLUMN IF NOT EXISTS allow_unassigned_seats BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS unassigned_seats_count INTEGER NOT NULL DEFAULT 0;

INSERT INTO hub_settings (hub_type, enabled) VALUES ('special', false)
  ON CONFLICT (hub_type) DO NOTHING;

-- ─── VERIFY ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  constraint_def TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hub_settings WHERE hub_type = 'special' AND enabled = false) THEN
    RAISE EXCEPTION 'FAIL: hub_settings row for special was not created, or not created disabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'allow_unassigned_seats'
  ) THEN
    RAISE EXCEPTION 'FAIL: events.allow_unassigned_seats was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'unassigned_seats_count'
  ) THEN
    RAISE EXCEPTION 'FAIL: events.unassigned_seats_count was not created';
  END IF;

  -- prove the constraint text itself now lists 'special', rather than
  -- trusting the ALTER succeeded silently
  SELECT pg_get_constraintdef(oid) INTO constraint_def
    FROM pg_constraint WHERE conname = 'events_hub_type_check';
  IF constraint_def NOT LIKE '%''special''%' THEN
    RAISE EXCEPTION 'FAIL: events_hub_type_check does not list ''special'': %', constraint_def;
  END IF;

  RAISE NOTICE 'OK: events_hub_type_check widened to include ''special'', unassigned-seats columns added, hub_settings seeded disabled.';
END $$;

COMMIT;
