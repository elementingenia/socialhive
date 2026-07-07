-- 032_backfill_payment_status.sql
-- Fixes existing bookings on paid (payment_required = true) events that were
-- left at the DB default payment_status = 'not_required'. That default is
-- meant only for events that don't require payment at all -- new bookings on
-- paid events should start as 'pending' (awaiting payment) until an EC marks
-- them 'confirmed' (paid). Confirmed live: all 3 bookings on "Bastille Day"
-- ($35/seat, payment_required = true) are currently 'not_required', including
-- Iain's own 2-seat booking, despite Home showing "Paid $70.00" for it -- that
-- display bug is fixed separately in app code; this migration corrects the
-- underlying data so it matches reality (nobody has actually been marked paid).
--
-- Only touches active (non-cancelled) bookings on paid events currently
-- mis-set to 'not_required'. Leaves 'pending', 'confirmed', 'refunded' alone.

UPDATE bookings b
SET payment_status = 'pending'
FROM events e
WHERE b.event_id = e.id
  AND e.payment_required = true
  AND b.status <> 'cancelled'
  AND b.payment_status = 'not_required';
