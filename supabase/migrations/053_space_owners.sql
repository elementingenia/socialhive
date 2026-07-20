-- 053_space_owners.sql
--
-- Owners primitive for the In-App Questions feature (scope:
-- Social_Hive_Questions_Scope.md, slice 1). An "Owner" is the standing,
-- accountable resident-contact for a space — a hub (Movies/Social) or a club.
-- Owners is a SET (one or more members) for both, per Iain's consistency call.
-- Used to (a) route questions asked on that space's page, and (b) show a
-- contextual contact on the space's landing page. App admins are the top-level
-- fallback/oversight and are NOT stored here.
--
-- ADDITIVE and safe against production: new table only, plus a backfill that
-- seeds each club's owner from its earliest active event coordinator (the
-- agreed default — thereafter owners are explicitly editable in Club Manager,
-- never recomputed).

CREATE TABLE IF NOT EXISTS space_owners (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context_type TEXT NOT NULL CHECK (context_type IN ('hub', 'club')),
  context_key  TEXT NOT NULL,            -- 'movie'/'social' for a hub; clubs.id (as text) for a club
  member_id    UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES members(id) ON DELETE SET NULL,
  UNIQUE (context_type, context_key, member_id)
);

CREATE INDEX IF NOT EXISTS idx_space_owners_ctx    ON space_owners(context_type, context_key);
CREATE INDEX IF NOT EXISTS idx_space_owners_member ON space_owners(member_id);

ALTER TABLE space_owners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS space_owners_read        ON space_owners;
DROP POLICY IF EXISTS space_owners_admin_write ON space_owners;
-- Any signed-in resident can read owners (they're shown as contacts on landings).
CREATE POLICY space_owners_read ON space_owners
  FOR SELECT USING (auth.uid() IS NOT NULL);
-- Only admins add/remove owners.
CREATE POLICY space_owners_admin_write ON space_owners
  FOR ALL
  USING      (EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true));

-- Seed club owners: each club's earliest active event coordinator becomes its
-- first owner. Clubs with no events/coordinators yet get none (they fall back
-- to admins at runtime until an owner is set).
INSERT INTO space_owners (context_type, context_key, member_id)
SELECT 'club', c.id::text, seed.member_id
FROM clubs c
JOIN LATERAL (
  SELECT ec.member_id
  FROM events e
  JOIN event_coordinators ec ON ec.event_id = e.id AND ec.replaced_at IS NULL
  WHERE e.club_id = c.id
  ORDER BY ec.assigned_at ASC
  LIMIT 1
) seed ON true
ON CONFLICT (context_type, context_key, member_id) DO NOTHING;
