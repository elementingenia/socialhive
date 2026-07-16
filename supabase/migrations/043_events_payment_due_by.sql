-- 043_events_payment_due_by.sql
--
-- Payment Due By date + automatic reminders (feedback round 2026-07-16,
-- plan workstream C). Decision #3: FLAG ONLY once the date passes -- no
-- auto-release of the seat (deferred as too risky).
--
-- events.payment_due_by  -- optional deadline shown to the resident at booking
--   time and used by the daily payment-due cron. Only meaningful when
--   payment_required = true. DATE (not TIMESTAMPTZ): a "pay by" day, not an
--   instant -- matches book_return_date's type and the app's date-only UI.
--
-- bookings.payment_reminded_at -- once-only dedup guard for the automatic
--   reminder, exactly like bookings.book_return_reminded_at (migration 041):
--   the cron only reminds a confirmed, unpaid booking when this is NULL, then
--   stamps it, so a resident isn't nagged every single day past the due date.
--   The manual EC nudges (coordinator route's remind_payment / close_out_
--   payments) deliberately do NOT stamp this -- they're an intentional human
--   action, the cron is the safety net.

ALTER TABLE events   ADD COLUMN IF NOT EXISTS payment_due_by       DATE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_reminded_at  TIMESTAMPTZ;
