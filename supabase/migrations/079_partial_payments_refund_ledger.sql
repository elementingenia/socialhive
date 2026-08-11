-- 079_partial_payments_refund_ledger.sql
--
-- Partial/short payment tracking + a single unified refund ledger
-- (2026-08-11 -- see Partial_Payment_Scope_Document_v2 for the full
-- design discussion and Iain's decisions).
--
-- Problem this fixes: bookings.payment_status was a plain enum with no
-- amount tracked anywhere -- "owing" was always computed live as
-- event.cost * seats, never stored, so a short/partial payment had
-- nowhere to go except being force-fit into 'confirmed' (silently
-- under-collects) or left at 'pending'/'submitted' (hides that money
-- changed hands at all). There was also no comment field anywhere in the
-- payment flow.
--
-- Additive only -- no existing column is dropped or renamed, no existing
-- row's payment_status value becomes invalid (the CHECK constraint gains
-- 'partial', nothing is removed).
--
-- amount_paid: running total actually received on this booking. Compared
-- against event.cost * seats (lib/payments.js's amountOwing()) to derive
-- short/exact/over. Backfilled below for every already-settled booking so
-- the new amount-based math (paymentSummary, cancellation refund
-- population) is correct for historical rows too, not just new ones.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0;

-- payment_notes: append-only log of {amount, note, recorded_by, recorded_at}
-- per payment action (EC record, resident self-report). Lets a booking
-- paid in two instalments keep both entries, each with its own comment --
-- a single scalar column can't represent that.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_notes JSONB NOT NULL DEFAULT '[]'::jsonb;

-- refund_due / refund_paid_at: ONE ledger for money owed back to a
-- resident, whichever of the two ways it arose --
--   (a) an overpayment on a booking that's still active and confirmed, or
--   (b) cancelling a booking that had already been paid (in full or
--       partially) -- populated automatically by the cancel action the
--       moment it happens, not left for an EC to notice and flag later.
-- refund_paid_at is the acknowledge-it-was-handed-over flag Iain asked
-- for -- null until an EC/admin marks it, so "outstanding refunds" is a
-- real, reconciles-to-zero query: refund_due > 0 AND refund_paid_at IS NULL.
--
-- This replaces the old model of flipping payment_status to 'refunded'/
-- back to 'pending' as the only refund marker (no amount, no date). That
-- value stays valid in the CHECK constraint below for backward
-- compatibility with any row already carrying it -- lib/payments.js's
-- isRefundIssued() checks both the old marker and the new timestamp so a
-- pre-migration row still displays correctly -- but no code path writes
-- payment_status = 'refunded' going forward.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_due NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_paid_at TIMESTAMPTZ;

-- payment_status gains 'partial'. Nothing removed -- 'refunded' stays
-- valid for the backward-compat reason above.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN ('not_required', 'pending', 'submitted', 'partial', 'confirmed', 'refunded'));

-- Backfill amount_paid for every booking that the OLD binary model already
-- considered settled, so the new amount-based comparisons (isPartial,
-- paymentSummary, and the cancel-time refund_due population below) are
-- correct for bookings that existed before this migration, not just ones
-- created after it. A 'submitted' (self-reported, EC never confirmed) row
-- is deliberately left at amount_paid = 0 -- the old model never recorded
-- an amount for that state either, and it would be inventing a figure
-- nobody actually entered.
UPDATE bookings b
SET amount_paid = COALESCE(e.cost, 0) * COALESCE(b.seats, 1)
FROM events e
WHERE e.id = b.event_id
  AND b.payment_status IN ('confirmed', 'refunded')
  AND b.amount_paid = 0;

-- Backfill refund_due for cancelled bookings that were already sitting in
-- the old "refund pending" derived state (cancelled + payment_status =
-- 'confirmed') or the old "refund issued" state (cancelled + 'refunded'),
-- so the new refund_due/refund_paid_at ledger reflects every refund the
-- app already knew about, not just ones from this point forward.
UPDATE bookings b
SET refund_due = COALESCE(e.cost, 0) * COALESCE(b.seats, 1)
FROM events e
WHERE e.id = b.event_id
  AND b.status = 'cancelled'
  AND b.payment_status IN ('confirmed', 'refunded')
  AND b.refund_due = 0;

UPDATE bookings
SET refund_paid_at = updated_at
WHERE status = 'cancelled' AND payment_status = 'refunded' AND refund_paid_at IS NULL;
