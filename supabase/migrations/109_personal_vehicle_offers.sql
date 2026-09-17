-- Migration 109: Personal vehicle offers for off-site events (Iain, 2026-09-17).
--
-- Second, independent transport option alongside Community Bus (migration
-- 085) -- Bus is completely unchanged by this migration. Any attendee
-- already on an off-site event's attendee list can self-nominate as a
-- driver, offer a number of spare seats in their own car, optionally
-- pre-assign specific seats to specific attendees from the event's own
-- roster, and leave any remainder open for other attendees to claim
-- themselves. An event can run Bus only, personal vehicles only, both
-- together, or neither -- the two toggles are fully independent.
--
-- Scoped and answered with Iain before building -- see project docs
-- `Element_Happenings_Personal_Vehicle_Offers_Scope_v1.md` and
-- `..._Scope_Answered.md`. Key decisions this migration encodes:
--
--   - A bus seat is a flag on the RIDER'S OWN booking row, because the bus
--     is one shared, event-wide resource (migration 085). A car belongs to
--     one specific driver, has its own seat count, and its passengers can
--     be pulled from completely different bookings/parties across the
--     whole event -- not just the driver's own party. That's why this
--     can't be bolted onto bookings/booking_attendees the way
--     is_bus_passenger was; it needs its own small pair of tables.
--   - Seat cap is entirely the driver's own number, full stop -- no
--     admin-set ceiling (unlike bus_max_seats, which the event creator
--     sets). seats_offered >= 0 is intentional, not a typo: a driver can
--     self-nominate with ZERO spare seats ("I'm driving myself there, not
--     offering a ride") -- that's a valid, meaningful state, not a no-op,
--     and it still excludes that person from the passenger pool of every
--     other offer on the event (enforced in lib/vehicleOffers.js, not the
--     database -- same "enforcement in application code" precedent bus
--     seats established).
--   - Driver identity is member_id/contact_id, same either/or shape as
--     booking_attendees' owner identity (migration 061) -- a driver is
--     always an already-identified resident, never a bare guest. Passenger
--     identity is the full three-way member_id/contact_id/guest_name shape
--     (migration 059), same as booking_attendees, since a passenger must be
--     an attendee of the event and attendees can be guests too.
--   - No admin fields on the event-level toggle -- plain on/off, same shape
--     as has_bus. Independent of has_bus: either, both, or neither.
--   - Bus/vehicle exclusivity (one transport mode per person per event, both
--     directions, driver or rider) is a hard application-layer rule, not a
--     database constraint -- it spans three different tables
--     (bookings/booking_attendees for bus, vehicle_offers/
--     vehicle_offer_passengers for cars) with no single FK relationship to
--     hang a CHECK off. Enforced in lib/vehicleOffers.js and the API routes
--     that call it.
--   - Bumping an already-seated passenger (as distinct from that passenger
--     leaving on their own) requires the driver to give a plain-text
--     reason, delivered to the bumped passenger as a real notification via
--     lib/notify.js -- notify() is member_id-keyed, so this only reaches a
--     bumped passenger who has an actual app account; a bumped
--     Contacts-hub resident or guest gets the reason stored on the removal
--     record (removed_reason below) but no push/in-app notification, same
--     limitation every other notification type in the app already has.

ALTER TABLE events ADD COLUMN IF NOT EXISTS allow_personal_vehicles BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS vehicle_offers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id     UUID REFERENCES members(id) ON DELETE CASCADE,
  contact_id    UUID REFERENCES contacts(id) ON DELETE CASCADE,
  seats_offered INTEGER NOT NULL CHECK (seats_offered >= 0),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT vehicle_offer_driver_identity CHECK (
    (member_id IS NOT NULL AND contact_id IS NULL) OR
    (member_id IS NULL AND contact_id IS NOT NULL)
  )
);
-- One offer per driver per event -- a resident drives at most one car to a
-- given event. Two separate partial-unique indexes since the identity is
-- either/or (a plain UNIQUE(event_id, member_id, contact_id) wouldn't catch
-- a duplicate where one column is always NULL).
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_offers_event_member_unique
  ON vehicle_offers(event_id, member_id) WHERE member_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_offers_event_contact_unique
  ON vehicle_offers(event_id, contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicle_offers_event ON vehicle_offers(event_id);

CREATE TABLE IF NOT EXISTS vehicle_offer_passengers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_offer_id   UUID NOT NULL REFERENCES vehicle_offers(id) ON DELETE CASCADE,
  event_id           UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE, -- denormalised for query convenience, same pattern booking_attendees already uses
  member_id          UUID REFERENCES members(id) ON DELETE CASCADE,
  contact_id         UUID REFERENCES contacts(id) ON DELETE CASCADE,
  guest_name         TEXT,
  -- true = the driver assigned this seat when setting up/editing the offer;
  -- false = the passenger claimed an open seat themselves. Display/audit
  -- distinction only -- both count the same toward capacity.
  nominated_by_driver BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT vehicle_offer_passenger_identity CHECK (
    (CASE WHEN member_id  IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN guest_name IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);
-- A resident/contact can only be a passenger in ONE car per event (bus/car
-- and car/car exclusivity for riders -- the guest_name case has no stable
-- identity to index on, so that half of the rule is enforced in
-- lib/vehicleOffers.js instead, same as guest de-duplication already works
-- for booking_attendees).
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_offer_passengers_event_member_unique
  ON vehicle_offer_passengers(event_id, member_id) WHERE member_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_offer_passengers_event_contact_unique
  ON vehicle_offer_passengers(event_id, contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicle_offer_passengers_offer ON vehicle_offer_passengers(vehicle_offer_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_offer_passengers_event ON vehicle_offer_passengers(event_id);

ALTER TABLE vehicle_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_offer_passengers ENABLE ROW LEVEL SECURITY;

-- Same visibility model as booking_attendees (migration 044) -- any
-- authenticated member may read, since these names appear in the "open
-- vehicles" pick-a-car list every attendee sees. Writes are service-role
-- only (the vehicle-offers API), so no INSERT/UPDATE/DELETE policy exists --
-- RLS therefore blocks any direct client write.
DROP POLICY IF EXISTS "vehicle_offers_read" ON vehicle_offers;
CREATE POLICY "vehicle_offers_read" ON vehicle_offers FOR SELECT
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "vehicle_offer_passengers_read" ON vehicle_offer_passengers;
CREATE POLICY "vehicle_offer_passengers_read" ON vehicle_offer_passengers FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ─── ROLLBACK (run manually if needed) ──────────────────────────────────────
-- DROP TABLE IF EXISTS vehicle_offer_passengers;
-- DROP TABLE IF EXISTS vehicle_offers;
-- ALTER TABLE events DROP COLUMN IF EXISTS allow_personal_vehicles;
