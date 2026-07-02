-- Migration 028: Book Club kit (physical book) tracking
-- Per Book_Club_Scope_Variation_v2.md, signed off 2026-07-02.
--
-- - events.book_return_date: kit due-back date, set by organiser alongside the meeting date
-- - bookings.has_book / book_given_at: tracks which member currently holds a physical copy
--   of the kit for that event's book, and when it was handed out. Reset is manual (EC/admin),
--   never automatic — deliberate, to avoid falsely marking a late collection as returned.
--
-- bookings.name_hidden already exists (migration 015) — no schema change needed there,
-- this pass just wires up its first real UI/API usage alongside has_book.

ALTER TABLE events ADD COLUMN IF NOT EXISTS book_return_date DATE;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS has_book BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS book_given_at TIMESTAMPTZ;

-- Outstanding Books admin view scans for has_book = true across all bookings —
-- index keeps that cheap as the table grows.
CREATE INDEX IF NOT EXISTS idx_bookings_has_book ON bookings (has_book) WHERE has_book = true;
