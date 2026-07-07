-- Migration 031: split Kit Return Date and Book Return Date (Book Club)
--
-- Per Iain (2026-07-07): these are two distinct dates, both event-level.
-- - Kit Return Date: the date the whole physical kit (books + discussion
--   guide etc.) must go back to the library. Coordinator-managed. This is
--   what migration 028's events.book_return_date column actually represents
--   -- renaming it here for clarity.
-- - Book Return Date: the date attendees must return their individual copy
--   to the coordinator, always somewhat earlier than the kit return date so
--   the coordinator has time to collect everything before returning the kit.
--   New column, event-level (applies to every attendee of that event).

ALTER TABLE events RENAME COLUMN book_return_date TO kit_return_date;
ALTER TABLE events ADD COLUMN IF NOT EXISTS book_return_date DATE;
