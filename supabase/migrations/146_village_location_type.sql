-- 146: "In the village" location type (Iain, 2026-10-31).
-- Residents want events in their street, outside their homes or in other
-- spots around the village that aren't bookable rooms. Until now an event
-- was either On-site (a room from Locations) or Off-site (free text, which
-- also switches on the bus and car-sharing). This adds a third value:
--   'village' -- free text, no room booked, no end time rule, no clash
--                check, no bus or cars. location_id is always NULL.
-- Widening a CHECK only; existing rows are untouched. Safe to run before
-- the code deploys (nothing writes 'village' until it does). Run BEFORE
-- merging the PR -- the new forms can save 'village', which the old
-- constraint rejects.
-- event_series.location_type has no CHECK, so nothing to change there.
-- Existing table: no new grants needed (Coding Standard #10).
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_location_type_check;
ALTER TABLE public.events ADD CONSTRAINT events_location_type_check
  CHECK (location_type IN ('onsite', 'offsite', 'village'));

-- A village event never points at a room.
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_village_no_room_check;
ALTER TABLE public.events ADD CONSTRAINT events_village_no_room_check
  CHECK (location_type <> 'village' OR location_id IS NULL);
