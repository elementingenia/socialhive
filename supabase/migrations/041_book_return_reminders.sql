-- 041_book_return_reminders.sql
--
-- Supports two new features on Book Club's existing kit-tracking columns
-- (migrations 028/031: bookings.has_book/book_given_at, events.book_return_date):
--   1. A manual "remind to return" bell an EC/admin can tap on any attendee
--      who currently has_book = true (app/api/coordinator/route.js's new
--      remind_book_return action).
--   2. An automatic once-only overdue alert, fired by a daily Vercel Cron
--      hitting app/api/cron/book-return-check/route.js, for anyone still
--      holding a book past the event's book_return_date.
--
-- book_return_reminded_at is the dedup guard for both: the cron only
-- notifies a booking if this is NULL or older than book_given_at (so a
-- book lent out again later still gets a fresh reminder cycle), and both
-- the manual and auto paths stamp it after sending -- a manual nudge today
-- means the cron won't immediately re-fire the same day.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS book_return_reminded_at TIMESTAMPTZ;
