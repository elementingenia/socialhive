-- 063_optional_attendee_naming.sql
--
-- Attendee-naming logic rework (Iain, 2026-07-25). Until now, ANY event with
-- Max per Booking > 1 hard-required every extra seat to be named -- no way
-- to turn that off. New default: naming is optional unless an admin/EC
-- explicitly turns it on for that event. Orthogonal to the existing
-- allow_nonresident_guests ("Anyone" vs "Residents only") -- that field is
-- untouched by this migration, only the naming REQUIREMENT changes.
--
-- require_attendee_names: NOT NULL DEFAULT false, applied to ALL rows
-- (existing and new) -- Iain's explicit call ("loosen everyone by default"),
-- not backfilled true for already-live events. Same NOT NULL + DEFAULT
-- together from day one as image_pos_x/y (062) and the image_focal_x/y
-- lesson (PR #8, 2026-07-23) -- never a bare NOT NULL added later.
--
-- Added to both events (what actually gets read at booking time) and series
-- (the recurring-event template that lib/generateSeriesEvents.js copies
-- fields from into each generated occurrence, same as it already does for
-- allow_nonresident_guests).

ALTER TABLE events ADD COLUMN IF NOT EXISTS require_attendee_names BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE event_series ADD COLUMN IF NOT EXISTS require_attendee_names BOOLEAN NOT NULL DEFAULT false;
