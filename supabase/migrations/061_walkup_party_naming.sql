-- 061_walkup_party_naming.sql
--
-- Lets a contact-owned walk-up booking carry a named party too, same as a
-- member's self-service booking. Iain, 2026-07-23: "Lyn should be able to
-- make a walk-up booking for 2 seats and set Geoff as the second seat" --
-- previously impossible because booking_attendees.owner_id required a real
-- members row (only an app account could be a party "owner"), and the
-- walk-up form itself had no per-seat naming UI at all (just a raw seat
-- count), unlike the self-service "who else is coming?" picker.
--
-- owner_id made nullable, new owner_contact_id added, CHECK requires
-- exactly one. member_id (the party member's own identity) is untouched --
-- migration 059 already lets a party MEMBER be a contact; this migration
-- lets the party OWNER be one too.

ALTER TABLE booking_attendees ADD COLUMN IF NOT EXISTS owner_contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE;
ALTER TABLE booking_attendees ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE booking_attendees ADD CONSTRAINT booking_attendee_owner_identity CHECK (
  (owner_id IS NOT NULL AND owner_contact_id IS NULL) OR
  (owner_id IS NULL AND owner_contact_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_booking_attendees_owner_contact ON booking_attendees(event_id, owner_contact_id);
