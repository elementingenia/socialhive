-- 077_request_only_locations.sql
--
-- "Request Only" locations (Iain, 2026-08-04). Some common-area spaces can
-- only be reserved with the Ingenia Community Manager's sign-off -- Ingenia
-- decides based on whether the event is community-based rather than personal
-- use. This updates the "no approval workflow" decision recorded in
-- lib/spaces.js (Iain, 2026-07-31) -- that line is now specifically about
-- Hive space *administration* (still admin-only), not about who is allowed
-- to BOOK a room.
--
-- Two different people hit this flag two different ways:
--   * An Admin creating an event directly against a Request Only room is
--     trusted to have already talked to Ingenia -- no blocking checkbox --
--     but gets a reminder notification to go validate it (app-level, see
--     lib/spaceBookings.js's notifyRequestOnlySpace()).
--   * An individual resident booking the room themselves (Personal Space
--     Booking, space_bookings) must self-declare: tick a confirmation box
--     and name who at Ingenia gave the OK, enforced both in the app
--     (lib/spaceBookings.js's validateIngeniaConfirmation()) and in the DB
--     (the CHECK constraint below), so a booking can never be flagged
--     "confirmed" with nobody named.

ALTER TABLE locations
  ADD COLUMN request_only BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN locations.request_only IS
  'Only bookable directly by an Admin, or by a resident who confirms Ingenia sign-off (space_bookings.ingenia_confirmed / .ingenia_confirmed_by).';

ALTER TABLE space_bookings
  ADD COLUMN ingenia_confirmed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN ingenia_confirmed_by TEXT;

COMMENT ON COLUMN space_bookings.ingenia_confirmed IS
  'Resident self-declared: they have confirmed with the Ingenia Community Manager they can book this Request Only space. Not independently verified.';
COMMENT ON COLUMN space_bookings.ingenia_confirmed_by IS
  'Free text, as typed by the resident: who at Ingenia gave that confirmation. Required whenever ingenia_confirmed is true (see the CHECK constraint below).';

-- A row can never claim confirmation with nobody named, and the name can't
-- be silently unbounded. Deliberately does NOT check locations.request_only
-- here (a CHECK can't cheaply reference another table) -- that half of the
-- rule is enforced in the app, same pattern as validateClosure() vs the
-- locations_closure_coherent CHECK already does for booking_status/closed_*.
ALTER TABLE space_bookings
  ADD CONSTRAINT space_bookings_ingenia_confirmation_coherent
  CHECK (
    NOT ingenia_confirmed
    OR (ingenia_confirmed_by IS NOT NULL AND length(trim(ingenia_confirmed_by)) BETWEEN 1 AND 150)
  );
