-- 106_payment_reminder_stamp_and_book_series.sql
-- Two independent, additive changes bundled in one migration (both raised
-- by Iain 2026-09-15 in the same feedback batch):
--
-- 1. bookings.payment_reminded_at -- lets the payment-reminder bell (Social
--    and Special Events attendee lists) grey out / disable once a reminder
--    has already been sent today, instead of always looking clickable
--    regardless of history. Mirrors the existing
--    bookings.book_return_reminded_at column exactly (migration 048-ish,
--    see remind_book_return in app/api/coordinator/route.js) -- same
--    pattern, just for payment reminders instead of book returns.
--
-- 2. events.book_id made nullable-by-design for a Book Club SERIES
--    occurrence: no schema change needed for that (book_id was already
--    nullable), but Book Club needs to move off the "pattern" recurrence
--    mode onto the same event_series machinery every other club uses (see
--    lib/generateSeriesEvents.js) so that a real future occurrence exists
--    to compute "next event" against for the book-return-date default.
--    Nothing to add here structurally -- event_series/events already
--    support a null book_id on any occurrence. This migration exists
--    to bump the file number and document the decision; no DDL for #2.

alter table bookings
  add column if not exists payment_reminded_at timestamptz;

comment on column bookings.payment_reminded_at is
  'Set by remind_payment / close_out_payments (app/api/coordinator/route.js) the moment a payment-reminder notification is sent for this booking. Read by the Social/Special Events attendee-list bell to grey out once a reminder has already gone out today (Australia/Sydney) -- mirrors book_return_reminded_at.';
