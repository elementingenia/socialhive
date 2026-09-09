-- 104_survey_coordinators.sql
--
-- Multiple coordinators per survey (Iain, 2026-09-09: "Need to be able to add
-- more than one coordinator" -- reported alongside the allow_comment
-- schema-cache bug). Iain's call on the design questions (all three, one
-- line): "follow same pattern as other hubs / Groups and clubs".
--
-- That pattern is event_coordinators (014_event_coordinators_and_book_genres.sql)
-- -- the join table every event-based hub (Movies/Social/Clubs/Screenings)
-- already uses for multi-coordinator support: any number of members, each a
-- full row, no "primary" flag, no cap, soft-replaced (never hard-deleted) via
-- replaced_at/replaced_by so history isn't lost when the set changes. This
-- migration creates survey_coordinators as an exact structural mirror of
-- event_coordinators, scoped to surveys instead of events.
--
-- Surveys is its own case, though, same as Voting was before it: this is a
-- SEPARATE join table, not a reuse of event_coordinators (surveys aren't
-- events -- no events.id to hang a foreign key off). Naming and shape mirror
-- event_coordinators exactly so the two read the same way in code.
--
-- surveys.coordinator_id is NOT dropped -- same precedent as
-- events.coordinator_id, which 014 migrated off of and left in place, unused,
-- rather than dropping it (a DROP COLUMN is exactly the kind of irreversible
-- step this app avoids when leaving the column alone costs nothing). Existing
-- single-coordinator data is copied into the new table below so nothing is
-- lost; every route stops reading/writing coordinator_id as of this same
-- change (see app/api/surveys/route.js, [id]/route.js, [id]/results/route.js,
-- lib/areaAuth.js's requireSurveyManage).

BEGIN;

CREATE TABLE IF NOT EXISTS survey_coordinators (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id    UUID NOT NULL REFERENCES surveys(id)  ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES members(id)  ON DELETE CASCADE,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by  UUID REFERENCES members(id) ON DELETE SET NULL,
  replaced_at  TIMESTAMPTZ,
  replaced_by  UUID REFERENCES members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_survey_coordinators_survey  ON survey_coordinators(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_coordinators_member  ON survey_coordinators(member_id);
CREATE INDEX IF NOT EXISTS idx_survey_coordinators_active  ON survey_coordinators(survey_id) WHERE replaced_at IS NULL;

ALTER TABLE survey_coordinators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "survey_coordinators_read"        ON survey_coordinators;
DROP POLICY IF EXISTS "survey_coordinators_admin_write" ON survey_coordinators;

CREATE POLICY "survey_coordinators_read" ON survey_coordinators
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "survey_coordinators_admin_write" ON survey_coordinators
  FOR ALL USING (
    EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
  );

-- ── Migrate existing single coordinator_id data ────────────────────────────
INSERT INTO survey_coordinators (survey_id, member_id, assigned_at)
SELECT id, coordinator_id, COALESCE(created_at, now())
FROM surveys
WHERE coordinator_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── VERIFY ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'survey_coordinators'
  ) THEN
    RAISE EXCEPTION '104_survey_coordinators: survey_coordinators table was not created';
  END IF;
END $$;

COMMIT;
