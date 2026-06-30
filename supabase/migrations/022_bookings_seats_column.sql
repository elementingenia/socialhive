-- Migration 022: Fix bookings table for multi-seat and split booking support
-- 
-- 1. Drop the UNIQUE(event_id, member_id) constraint — it prevents split bookings
--    (confirmed + waitlist rows for same member) and the modify flow (cancel old + insert new)
--    App-level logic already prevents duplicate bookings.
--
-- 2. Add seats column if not already present (was added directly to DB previously)

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_event_id_member_id_key;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS seats INTEGER NOT NULL DEFAULT 1;

-- Backfill any NULL seats to 1 (safety)
UPDATE bookings SET seats = 1 WHERE seats IS NULL;
