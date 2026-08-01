-- 075_fix_space_bookings_booked_by_fkey.sql
--
-- Fixes a real bug found live-fire testing the Personal Space Booking
-- feature (2026-08-01): every booking insert failed with
-- "violates foreign key constraint space_bookings_booked_by_fkey" for a
-- perfectly real member.
--
-- Root cause: migration 072's booked_by FK was written to resolve at
-- migration-RUN time -- "if `people` exists, we must be post-cutover" --
-- specifically to survive being applied to a freshly-rebuilt database where
-- 069 (the cutover) had already run. That assumption was reasonable but
-- turned out wrong for the world we're actually in: migration 068 created
-- `people` as an EMPTY placeholder table well before the real cutover
-- (foundation tables landed 2026-07-31; the cutover itself, 090/091, is
-- still parked on feature/foundation-ready-to-fire, not run). So `people`
-- exists — 072's DO block saw that and pointed the FK at it — but the app
-- still authenticates against `members`, and `people` has zero rows. Every
-- booked_by value the app could possibly supply is therefore a `members.id`
-- that cannot satisfy an FK pointing at `people`.
--
-- This is a genuine latent bug in 072, not something this feature did wrong
-- — worth remembering if any other feature reaches for that same "does
-- `people` exist" dynamic-target pattern before the actual wipe.
--
-- ============================================================================
-- SAFE TO RUN ON LIVE PRODUCTION. space_bookings has zero rows (confirmed
-- live 2026-08-01 -- nothing has ever written to it), so repointing this FK
-- touches no data.
-- ============================================================================
--
-- Deliberately hardcoded to `members`, not re-run through the same dynamic
-- DO-block trick -- we now know that trick answers the wrong question here
-- (table existence, not "has the cutover actually happened"). The parked
-- 091_foundation_rls.sql cutover migration is where this gets repointed to
-- `people` for real, at the actual wipe.

BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM space_bookings) > 0 THEN
    RAISE EXCEPTION 'space_bookings has rows -- this migration assumed it was empty, stop and investigate before repointing the FK';
  END IF;
END $$;

ALTER TABLE space_bookings DROP CONSTRAINT IF EXISTS space_bookings_booked_by_fkey;
ALTER TABLE space_bookings ADD CONSTRAINT space_bookings_booked_by_fkey
  FOREIGN KEY (booked_by) REFERENCES members(id) ON DELETE SET NULL;

COMMIT;
