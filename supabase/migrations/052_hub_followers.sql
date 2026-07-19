-- 052_hub_followers.sql
--
-- "Follow" a fixed hub (Movies now; any hub later) to get notified of new
-- events there — the same opt-in idea as joining a club, for the hardcoded
-- hubs (Iain 2026-07-18). Social deliberately does NOT use this: it broadcasts
-- to the whole community, so it needs no follow list.
--
-- Kept separate from club_members (that's keyed by club_id; this by hub_type),
-- but the same "join = notice targeting only" model.

CREATE TABLE IF NOT EXISTS hub_followers (
  hub_type  TEXT NOT NULL,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (hub_type, member_id)
);

ALTER TABLE hub_followers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hub_followers_read"       ON hub_followers;
DROP POLICY IF EXISTS "hub_followers_self_write" ON hub_followers;
CREATE POLICY "hub_followers_read" ON hub_followers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "hub_followers_self_write" ON hub_followers FOR ALL USING (
  member_id = (SELECT id FROM members WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
) WITH CHECK (
  member_id = (SELECT id FROM members WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);
