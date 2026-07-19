-- 050_locations.sql
--
-- Shared, admin-managed venue list. The on-site venues were a hardcoded array
-- (ONSITE_LOCATIONS) inside app/(app)/social/events/page.js, so adding or
-- renaming a space needed a code deploy, and only Social could use them.
-- Iain 2026-07-18: "all events need to share location... needs to be added as
-- an admin option as it is currently hard coded".
--
-- Seeded with exactly the six that were hardcoded, so nothing changes for
-- existing events (which store the venue name as text on events.location).

CREATE TABLE IF NOT EXISTS locations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "locations_read"        ON locations;
DROP POLICY IF EXISTS "locations_admin_write" ON locations;
CREATE POLICY "locations_read" ON locations FOR SELECT USING (true);
CREATE POLICY "locations_admin_write" ON locations FOR ALL USING (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);

INSERT INTO locations (name, sort_order)
SELECT v.name, v.ord FROM (VALUES
  ('Community Hall', 0),
  ('Community Sports Bar', 1),
  ('Community Lounge', 2),
  ('Workshop', 3),
  ('Outside Area', 4),
  ('Health Utility Building', 5)
) AS v(name, ord)
WHERE NOT EXISTS (SELECT 1 FROM locations WHERE locations.name = v.name);
