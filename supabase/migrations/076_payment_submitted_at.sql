-- 076_payment_submitted_at.sql
-- Fix: EC marking a booking "Unpaid" was wiping a resident's own "I've Paid"
-- self-report. bookings.payment_status is a single field, so the toggle
-- logic (Confirmed -> "pending") had no way to know the booking had ever
-- been resident-submitted -- it just blindly reset to 'pending', identical
-- to a booking nobody had touched. Iain, 2026-08-04: "the setting back on
-- my booking reverts to unpaid as well, but SHOULD remain as I set it,
-- which was I've Paid."
--
-- Adds a standalone marker, independent of payment_status, so an EC's
-- Paid/Unpaid toggle can tell the two "unpaid" states apart and restore
-- the correct one.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_submitted_at timestamptz;

COMMENT ON COLUMN bookings.payment_submitted_at IS
  'Set once when a resident self-flags their booking as paid (mark_payment_submitted). '
  'Never cleared by an EC un-confirming payment -- used to restore payment_status to '
  '"submitted" rather than "pending" if an EC toggles Paid -> Unpaid after the resident '
  'already self-reported.';
