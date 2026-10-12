-- 138_survey_audiences.sql
-- Targeted Surveys (Iain, 2026-10-13, Element_Happenings_Targeted_Surveys_Scope
-- -- answers A live membership, B area Owners can create, C hidden from
-- non-members by default, D household in if any resident there is in the
-- audience, E only areas with a Join list).
--
-- survey_audiences: which areas a survey is aimed at. NO rows for a survey =
-- whole community (exactly today's behaviour, so every existing survey is
-- unchanged). One row per area:
--   area_type 'hub'  -> hub_type set (only 'movie' / Show Time has a Join list)
--   area_type 'club' -> club_id set (any Group & Club)
-- Membership is read LIVE from hub_followers / club_members when needed --
-- nothing is copied here.
--
-- surveys.visible_to_all: "Hidden by default" (answer C). false = residents
-- outside the audience don't see the survey at all. true = they can see it
-- (and published results, per the existing results setting) but still can't
-- answer.
--
-- Additive only: safe to run before the code deploys.
-- Run in the Supabase SQL editor. Safe to run repeatedly.

BEGIN;

CREATE TABLE IF NOT EXISTS survey_audiences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id   UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  area_type   TEXT NOT NULL CHECK (area_type IN ('hub', 'club')),
  hub_type    TEXT,
  club_id     UUID REFERENCES clubs(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT survey_audiences_shape CHECK (
    (area_type = 'hub'  AND hub_type IS NOT NULL AND club_id IS NULL) OR
    (area_type = 'club' AND club_id IS NOT NULL AND hub_type IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_survey_audiences_hub
  ON survey_audiences(survey_id, hub_type) WHERE area_type = 'hub';
CREATE UNIQUE INDEX IF NOT EXISTS uq_survey_audiences_club
  ON survey_audiences(survey_id, club_id) WHERE area_type = 'club';
CREATE INDEX IF NOT EXISTS idx_survey_audiences_survey ON survey_audiences(survey_id);

-- Service-role only, same as surveys / survey_items (no policies on purpose).
ALTER TABLE survey_audiences ENABLE ROW LEVEL SECURITY;

ALTER TABLE surveys ADD COLUMN IF NOT EXISTS visible_to_all BOOLEAN NOT NULL DEFAULT false;

-- ─── VERIFY ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'survey_audiences') THEN
    RAISE EXCEPTION 'FAIL: survey_audiences was not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'surveys' AND column_name = 'visible_to_all'
  ) THEN
    RAISE EXCEPTION 'FAIL: surveys.visible_to_all was not added';
  END IF;
END $$;

COMMIT;
