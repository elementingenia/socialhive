-- Migration 036: is_test flag on events
--
-- The movies E2E fixture screening ('[QA Fixture] Automated Test Booking —
-- Not A Real Screening', id 9e63e42c-192f-46da-8ade-d5c74a4c0158, dated
-- 2099-12-31) has been live and bookable since 2026-07-09 so testbot has
-- somewhere to hold a confirmed booking that can never collide with a real
-- screening's seat pool. Accepted at the time as a minor cosmetic tradeoff:
-- nothing stopped a resident scrolling far enough down the Scheduled list
-- from seeing it. Iain flagged this on 2026-07-12 -- needs to be invisible
-- to residents while staying fully usable in the backend for testing.
--
-- This column lets a resident-facing query exclude test events outright,
-- while still allowing a carve-out (implemented in app/api/screenings's
-- GET handler) for admins and for whoever actually holds a booking on one --
-- so testbot still sees its own fixture booking on Home/Scheduled, and an
-- admin can still find and manage the row, but no other resident ever sees
-- it browsing screenings.

ALTER TABLE events ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

UPDATE events
SET is_test = true
WHERE id = '9e63e42c-192f-46da-8ade-d5c74a4c0158';
