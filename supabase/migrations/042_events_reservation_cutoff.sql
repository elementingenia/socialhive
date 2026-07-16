-- 042_events_reservation_cutoff.sql
--
-- Reservation cut-off (feedback round 2026-07-16, plan workstream B).
--
-- Optional per-event deadline after which residents can no longer book/attend.
-- NULL = no cut-off (current behaviour -- bookings stay open until the event
-- itself is past). Applies to every hub (Movies, Social, Book Club) because
-- all three book through the same choke-point, app/api/bookings/route.js POST,
-- which now rejects a create once now() > reservation_cutoff. The event stays
-- visible either way (Decision #6 -- the book control is replaced with a
-- "Bookings Closed" state, the event is NOT hidden).
--
-- TIMESTAMPTZ (not DATE): "cut off at 6pm the day before" needs a time, and
-- the whole app already reasons in absolute instants for booked_at etc.
-- Cancelling/reducing a booking after the cut-off is still allowed (that frees
-- seats) -- only new bookings and seat increases are gated.

ALTER TABLE events ADD COLUMN IF NOT EXISTS reservation_cutoff TIMESTAMPTZ;
