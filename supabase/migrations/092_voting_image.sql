-- Voting Hub — event image support (round-5 review, Iain 2026-09-03:
-- "Voting event should have an image upload option like other events
-- throughout the system"). Purely additive, no dependency on any other
-- pending migration.
--
-- voting_events lives outside the shared `events` table, so it needs its
-- own image columns rather than reusing events.image_url/image_focal_x/y
-- -- same shape/naming as that table for consistency (see
-- app/api/events/image/route.js), just on a different parent row.

alter table voting_events
  add column if not exists image_url text,
  add column if not exists image_focal_x numeric not null default 50,
  add column if not exists image_focal_y numeric not null default 50;
