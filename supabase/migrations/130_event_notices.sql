-- 130_event_notices.sql
--
-- Event notices (Iain, 2026-10-06): "Coordinators of events need to be able
-- to send out notices to attendees of that event as a distinct group."
-- Decisions (Iain, same day): audience = confirmed + waitlisted attendees
-- (plus residents named in someone's party); notices stay visible on the
-- event card, not just a one-off alert; the coordinator can remove a notice.
--
-- The event equivalent of hub_notices (113) / club_notices (045), keyed by
-- event_id. Unlike those, a notice here is for the attendees only, so there
-- is NO client read policy: RLS on, no policies, every read and write goes
-- through the service-role route app/api/event-notices, which checks the
-- viewer is booked on the event or can manage it (lib/areaAuth.js
-- requireEventManage rule: admin, area Owner, or this event's coordinator).
--
-- Additive only: one new table. Safe to run before the code deploys.

BEGIN;

CREATE TABLE IF NOT EXISTS event_notices (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_by UUID REFERENCES members(id) ON DELETE SET NULL,
  archived   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_event_notices_event ON event_notices(event_id, archived, created_at DESC);

ALTER TABLE event_notices ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: service role only (see header).

COMMIT;
