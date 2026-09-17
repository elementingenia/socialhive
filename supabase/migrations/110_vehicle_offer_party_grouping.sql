-- Migration 110: keep a whole booking party together in one car (Iain,
-- live-fire review of PR #145, 2026-09-17).
--
-- Found in preview testing: migration 109 modelled a vehicle offer's
-- passengers purely as individuals, with no link back to which booking they
-- came from. Iain's call, confirmed before building: if a resident booked a
-- second seat for their spouse (say), and that resident claims or is given
-- a ride, their WHOLE booking party goes in that car together -- never
-- split across cars or between a car and no car. If the party's seat count
-- is more than a car has spare, that car can't be claimed/assigned to any
-- part of that party at all. This rule applies identically whichever side
-- initiates it -- a driver pre-assigning one attendee from a party pulls in
-- their whole party too, exactly like a self-claim does.
--
-- party_owner_member_id/party_owner_contact_id denormalise "which booking's
-- party is this passenger part of" onto every vehicle_offer_passengers row
-- (every row in one party carries the same owner identity, including the
-- owner's own row) -- same shape as booking_attendees.owner_id/
-- owner_contact_id (migration 061), so grouping/removing a whole party's
-- seats in one car is a single filtered query rather than re-deriving the
-- party from bookings/booking_attendees every time.

ALTER TABLE vehicle_offer_passengers ADD COLUMN IF NOT EXISTS party_owner_member_id UUID REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE vehicle_offer_passengers ADD COLUMN IF NOT EXISTS party_owner_contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_vehicle_offer_passengers_party_owner_member
  ON vehicle_offer_passengers(vehicle_offer_id, party_owner_member_id) WHERE party_owner_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicle_offer_passengers_party_owner_contact
  ON vehicle_offer_passengers(vehicle_offer_id, party_owner_contact_id) WHERE party_owner_contact_id IS NOT NULL;

-- ─── ROLLBACK (run manually if needed) ──────────────────────────────────────
-- DROP INDEX IF EXISTS idx_vehicle_offer_passengers_party_owner_contact;
-- DROP INDEX IF EXISTS idx_vehicle_offer_passengers_party_owner_member;
-- ALTER TABLE vehicle_offer_passengers DROP COLUMN IF EXISTS party_owner_contact_id;
-- ALTER TABLE vehicle_offer_passengers DROP COLUMN IF EXISTS party_owner_member_id;
