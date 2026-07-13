-- 040_bookings_updated_at.sql
--
-- Adds a plain updated_at timestamp to bookings, set explicitly by the app
-- (not a trigger) on every write that matters for payment reconciliation:
-- cancellation, a payment status change (set_payment / set_refund /
-- mark_payment_submitted), and seat modification. New bookings get it via
-- the column default, same as booked_at.
--
-- Why this is needed now (2026-07-14): Social's payments Reconciliation
-- Summary (migration 037) stamps payments_reconciled_at when an EC runs
-- Close Out, but that stamp was never comparable against anything -- there
-- was no way to tell "has this event had booking/payment activity since I
-- last reviewed it". Iain hit this directly on Bastille Day: reconciled
-- Monday, then a walk-up booking and a cancellation-with-refund-due
-- happened afterward, and the summary just silently showed new numbers
-- under an old, now-misleading "Reconciled" stamp. This column is what lets
-- the app compare "latest booking activity" against "last reviewed" and
-- surface a "new activity since you last reviewed this" flag instead.
--
-- Existing rows: DEFAULT now() backfills every current row to the moment
-- this migration runs. That's expected and harmless -- it just means every
-- event will read as "recently touched" once, immediately after this runs,
-- and settle back down as real new activity (or lack of it) accrues from
-- here on.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
