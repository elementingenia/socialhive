-- 059_contact_bookings.sql
--
-- Lets a booking (or a named party seat) point at a Contacts-hub resident who
-- has no app login (contacts.member_id IS NULL), not just a members row.
-- Raised by Iain 2026-07-23: EC/admin walk-up booking and the self-service
-- "who else is coming?" party picker both only searched `members`, so a
-- resident added via Info > Contacts (e.g. no account, like a household
-- member who doesn't use a phone) couldn't be booked or named at all. They
-- are a real resident, not a "non-resident guest" -- guest_name stays reserved
-- for genuine outside visitors.
--
-- bookings.member_id was NOT NULL with no alternative identity; relaxed to
-- nullable with a CHECK requiring exactly one of member_id/contact_id. A
-- contact has no login, so a contact-owned booking has no self-service
-- owner -- these can only be created by an EC/admin via the walk-up flow
-- (app/api/coordinator's add_booking action), which already requires
-- admin/EC eligibility.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE bookings ALTER COLUMN member_id DROP NOT NULL;
ALTER TABLE bookings ADD CONSTRAINT bookings_member_or_contact CHECK (
  (member_id IS NOT NULL AND contact_id IS NULL) OR
  (member_id IS NULL AND contact_id IS NOT NULL)
);
-- Mirrors the existing UNIQUE(event_id, member_id) member protection so the
-- same contact can't be double-booked onto one event either.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_event_contact_unique
  ON bookings(event_id, contact_id) WHERE contact_id IS NOT NULL;

-- booking_attendees (migration 044) already allows member_id XOR guest_name;
-- add contact_id as the third option, still mutually exclusive.
ALTER TABLE booking_attendees ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE booking_attendees DROP CONSTRAINT IF EXISTS booking_attendee_identity;
ALTER TABLE booking_attendees ADD CONSTRAINT booking_attendee_identity CHECK (
  (CASE WHEN member_id  IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN guest_name IS NOT NULL THEN 1 ELSE 0 END) = 1
);
