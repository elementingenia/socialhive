-- 137: remember an explicit "Own way" transport choice on a booking.
--
-- Iain, 2026-10-11: "When set to 'own way' there needs to be a way to show
-- that in the UI." Until now Own way was just "no bus, no car", so a booking
-- someone had deliberately set to Own way looked identical to one nobody had
-- set at all. This flag records the explicit choice. It is only ever SHOWN
-- when the booking also has no bus seat and no car, so a stale true (someone
-- later joins a car themselves) can never display wrongly.
--
-- Additive, safe to run before the code deploys. Run BEFORE merging the PR:
-- the new code selects and writes this column.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS own_way BOOLEAN NOT NULL DEFAULT FALSE;

-- ROLLBACK: ALTER TABLE bookings DROP COLUMN IF EXISTS own_way;
