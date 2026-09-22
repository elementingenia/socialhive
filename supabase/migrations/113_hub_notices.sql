-- 113_hub_notices.sql
--
-- Hub notices (Iain, 2026-09-23): "The Show Time page does not have a notices
-- option (Post Notice) so I can send a message out to members. All Hubs should
-- have this option so owners can deliver targeted messages. Social and Special
-- hub do NOT have members, so do not have notices."
--
-- The hub equivalent of club_notices (045_clubs.sql), keyed by hub_type
-- instead of club_id. Audience = hub_followers for that hub_type (the "Join"
-- pill, 052_hub_followers.sql). Which hubs are allowed to post notices is
-- decided in code (lib/hubNotices.js HUBS_WITH_MEMBERS), not here -- a hub
-- only qualifies if it actually has a join/member list.
--
-- Additive only: new table, no change to any existing table. Safe to run
-- before the code deploys.

BEGIN;

CREATE TABLE IF NOT EXISTS hub_notices (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_type   TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_by UUID REFERENCES members(id) ON DELETE SET NULL,
  archived   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hub_notices_hub ON hub_notices(hub_type, archived, created_at DESC);

ALTER TABLE hub_notices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hub_notices_read ON hub_notices;
-- Authenticated read only, no client write policy -- writes go only through
-- the service-role API route (app/api/hub-notices), same convention as
-- committee_posts (097). The admin-or-Owner check lives in lib/areaAuth.js.
CREATE POLICY hub_notices_read ON hub_notices
  FOR SELECT USING (auth.uid() IS NOT NULL);

COMMIT;
