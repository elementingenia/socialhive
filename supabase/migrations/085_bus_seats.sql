-- Migration 085: Community bus — independent seat capacity (Iain, 2026-08-19).
--
-- Prior to this, events.has_bus (migration 015) was purely informational --
-- a badge + optional driver, no capacity, no per-attendee opt-in, and only
-- ever settable from the Social hub's editor. This adds real seat tracking,
-- shared across every hub via the events table, and extends the feature to
-- Groups & Clubs (offsite club events) for the first time.
--
-- Design (confirmed with Iain before building):
--   - Bus capacity is INDEPENDENT of the event's own max_seats -- a resident
--     can book the event with or without a bus seat.
--   - bus_max_seats is nullable: null = bus offered, uncapped. Existing live
--     Social events with has_bus=true keep working unchanged (no seat cap
--     springs into existence under them).
--   - Explicitly NO waitlist for the bus (Iain's instruction) -- once full,
--     requesting a seat is just rejected/disabled, the event booking itself
--     is completely unaffected.
--   - The bus driver needs actual names, not just a headcount (Iain: "bus
--     driver needs the names of the people going on the bus") -- so a
--     resident's OWN bus seat is a flag on their booking row (mirrors the
--     bring-a-dish precedent, migration 051, where the booker's own choice
--     lives on `bookings` because the booker isn't a booking_attendees row),
--     and each named additional attendee gets their own flag on
--     booking_attendees. Enforcement (any bus-flagged seat must be named,
--     even on an event that doesn't otherwise require attendee names) lives
--     in application code (lib/attendees.js), not the database.

ALTER TABLE events ADD COLUMN IF NOT EXISTS bus_max_seats INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS bus_passenger BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE booking_attendees ADD COLUMN IF NOT EXISTS is_bus_passenger BOOLEAN NOT NULL DEFAULT false;

-- ─── ROLLBACK (run manually if needed) ──────────────────────────────────────
-- ALTER TABLE booking_attendees DROP COLUMN IF EXISTS is_bus_passenger;
-- ALTER TABLE bookings DROP COLUMN IF EXISTS bus_passenger;
-- ALTER TABLE events DROP COLUMN IF EXISTS bus_max_seats;
