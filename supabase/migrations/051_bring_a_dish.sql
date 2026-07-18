-- 051_bring_a_dish.sql
--
-- "Attendees bring something" (scope §6, Phase 2d). The club owns the category
-- list (club_bring_categories, migration 045), each event picks which apply
-- (events.bring_category_ids, migration 049); this stores what each PERSON is
-- actually bringing.
--
-- Two places because a booking's owner isn't a booking_attendees row — that
-- table holds only the additional named attendees (migration 044):
--   bookings.bring_*           -> what the person who booked is bringing
--   booking_attendees.bring_*  -> what each additional attendee is bringing
--
-- Iain's locked ruling: MANDATORY for the booking user, OPTIONAL for their
-- party (the booker is usually catering for everyone they book for), so both
-- columns are nullable and the requirement is enforced in the booking flow.

ALTER TABLE bookings          ADD COLUMN IF NOT EXISTS bring_category_id UUID REFERENCES club_bring_categories(id) ON DELETE SET NULL;
ALTER TABLE bookings          ADD COLUMN IF NOT EXISTS bring_note        TEXT;
ALTER TABLE booking_attendees ADD COLUMN IF NOT EXISTS bring_category_id UUID REFERENCES club_bring_categories(id) ON DELETE SET NULL;
ALTER TABLE booking_attendees ADD COLUMN IF NOT EXISTS bring_note        TEXT;
