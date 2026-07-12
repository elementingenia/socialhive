-- Migration 038: allow residents to self-mark a booking's payment as
-- "submitted" (idea 2 of the EC payment model) — an in-between state
-- between 'pending' and EC-confirmed 'confirmed'. Badge wording stays
-- "Booked" for 'submitted' (see lib/payments.js isPaid()/bookingStatusBadge
-- — only 'confirmed' counts as paid); this is purely a visibility signal
-- to the coordinator, not a new payment state.

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN ('not_required', 'pending', 'submitted', 'confirmed', 'refunded'));
