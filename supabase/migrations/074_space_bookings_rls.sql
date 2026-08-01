-- 074_space_bookings_rls.sql
--
-- Personal Space Booking — RLS policies for space_bookings.
-- Scope: Social_Hive_Personal_Space_Booking_Scope.md (decisions locked
-- 2026-08-01, via Google Doc review). Table itself needs no schema changes —
-- migration 072 already added purpose='private' anticipating exactly this
-- feature. This migration only opens the door RLS has kept shut since 072
-- ("enabled with no policies = service-role only... policies land with the
-- feature").
--
-- ============================================================================
-- SAFE TO RUN ON LIVE PRODUCTION. Policy-only, no data touched.
-- ============================================================================
--
-- Shape mirrors `bookings`' own RLS exactly (migrations 001 + 020), which is
-- the established precedent for "residents own their own rows, confirmed rows
-- are visible to everyone for clash-avoidance browsing, admins see all":
--   - bookings_own_read:   own rows (any status) OR confirmed rows to any
--                          authenticated member OR admin sees everything.
--   - bookings_own_write:  INSERT with booked_by = the caller.
--   - bookings_own_cancel: UPDATE own rows OR admin.
--
-- Per this repo's coding standard #5 ("Dynamic eligibility -> service-role
-- routes, not client RLS"), the app itself writes through /api/spaces/* using
-- supabaseAdmin (service role), which bypasses RLS entirely. These policies
-- are defence-in-depth for direct client reads/writes, not the primary
-- enforcement path -- the API route is.
--
-- Written against `members` (pre-cutover schema). The parked foundation
-- migration 091_foundation_rls.sql rewrites RLS globally at the wipe, onto
-- `people` -- same temporal scoping as 072's booked_by FK, just simpler here
-- because a policy doesn't need the dynamic DO-block trick a foreign key does.
--
-- Run in the Supabase SQL editor. Safe to run repeatedly (DROP POLICY IF
-- EXISTS guards every CREATE).

BEGIN;

DROP POLICY IF EXISTS "space_bookings_own_read"   ON space_bookings;
DROP POLICY IF EXISTS "space_bookings_own_write"  ON space_bookings;
DROP POLICY IF EXISTS "space_bookings_own_cancel" ON space_bookings;

-- SELECT: your own bookings (any status, so you can see a cancelled one you
-- made), OR any confirmed booking (needed for the availability-filter picker
-- and the Calendar display to work for every resident, not just the owner),
-- OR admins see everything including cancelled ones.
CREATE POLICY "space_bookings_own_read" ON space_bookings FOR SELECT USING (
  booked_by = (SELECT id FROM members WHERE auth_id = auth.uid())
  OR (status = 'confirmed' AND auth.uid() IS NOT NULL)
  OR EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);

-- INSERT: a resident may only create a booking under their own name.
CREATE POLICY "space_bookings_own_write" ON space_bookings FOR INSERT WITH CHECK (
  booked_by = (SELECT id FROM members WHERE auth_id = auth.uid())
);

-- UPDATE (cancel): your own booking, or an admin overruling/cancelling anyone's
-- (Iain, 2026-08-01: "Admin needs an admin view so they can overrule, cancel or
-- challenge a booking of any space").
CREATE POLICY "space_bookings_own_cancel" ON space_bookings FOR UPDATE USING (
  booked_by = (SELECT id FROM members WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);

COMMIT;
