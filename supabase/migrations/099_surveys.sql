-- 099_surveys.sql
--
-- Surveys hub, part 2 -- the surveys themselves, and the join to the
-- Question Bank (098_survey_question_bank.sql). Social_Hive_Surveys_
-- Scope_Answered.md (Iain, 2026-09-08). SAFE TO RUN ON LIVE PRODUCTION.
-- Purely additive: 2 new tables, one new hub_settings seed row
-- (enabled=false -- hidden until Iain flips it on via the admin toggle),
-- one one-time Owners-seeding insert.
--
-- ============================================================================
-- LIFECYCLE -- same live-computed pattern as Voting, not a stored column
-- ============================================================================
-- Draft -> Open -> Closed -> Published is computed live from opened_at/
-- closes_at/published_at at read time, same pattern as lib/voting.js's
-- computeVotingStatus() (this exact "written status drifts from reality"
-- bug class has bitten this app twice already -- BUG-039, and the whole
-- PR #70 Sydney-date saga). See lib/surveys.js's computeSurveyStatus(),
-- built alongside the API routes for this migration.
--
-- ============================================================================
-- OWNERSHIP -- embedded under Committee at launch, independently broadenable
-- ============================================================================
-- Iain, 2026-09-08: launch Surveys under the Committee's existing Owners
-- group ("there is a logic to tucking it under the authority of the
-- committee"), with no technical blocker to broadening later
-- (space_owners supports as many independent hub-owner sets as you want).
-- This migration seeds the 'surveys' hub-owner set as a COPY of whoever is
-- currently a 'committee' hub owner, into an independent space_owners
-- context -- broadening or narrowing Surveys' own Owner set later (via the
-- existing Owners admin UI) never touches Committee's, and vice versa.
--
-- ============================================================================
-- RESULTS VISIBILITY -- Change Request #3 (2026-09-08), built in from day one
-- ============================================================================
-- Results are visible ONLY to a survey's own assigned Coordinator(s) --
-- never to Admins/Owners generally (Iain: "Only the assigned event
-- coordinator/s should see results. NOT Admins/Owners... This needs to be
-- applied to Voting as well"). The Voting side of this shipped 2026-09-08
-- (PR #94, main 811d186) -- lib/voting.js's canSeeResults() takes
-- `isCoordinator`, never a blanket admin flag. Surveys reuses that exact
-- function and contract from day one (lib/surveys.js does not duplicate
-- it) -- results_visibility_outcome/results_visibility_turnout below gate
-- resident visibility exactly like Voting's, and an Admin/Owner who is not
-- also this survey's coordinator falls through to that same resident-facing
-- toggle, same as anyone else. Admin/Owner keep full manage rights
-- (create/edit/publish/close) regardless -- they just can't open the
-- results/tally itself unless they're the named coordinator.
--
-- ============================================================================
-- ANONYMITY -- deliberately NOT the same guarantee as Voting. See
-- 100_survey_responses.sql for the full design note and why.
-- ============================================================================
--
-- Permissions: create/edit/publish/close a survey, and manage the Question
-- Bank = admin OR this hub's Owner (lib/areaAuth.js's
-- requireAdminOrAreaOwner(req, 'hub', 'surveys')), plus a per-survey
-- Coordinator (surveys.coordinator_id) mirroring
-- requireVotingEventManage()'s exact pattern -- see lib/areaAuth.js's
-- planned requireSurveyManage(). Responding to an open survey = any
-- eligible resident, no owner/admin concept. The hub's own show/hide
-- toggle (hub_settings.enabled) is admin-only, same as every other hub.
--
-- Run in the Supabase SQL editor. Safe to run repeatedly.

BEGIN;

CREATE TABLE IF NOT EXISTS surveys (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                       TEXT NOT NULL,
  description                 TEXT,
  eligibility_mode            TEXT NOT NULL DEFAULT 'per_resident'
                                 CHECK (eligibility_mode IN ('per_resident', 'per_household')),
  anonymous                   BOOLEAN NOT NULL DEFAULT false,
  results_visibility_outcome  TEXT NOT NULL DEFAULT 'residents'
                                 CHECK (results_visibility_outcome IN ('residents', 'admin_only')),
  results_visibility_turnout  TEXT NOT NULL DEFAULT 'residents'
                                 CHECK (results_visibility_turnout IN ('residents', 'admin_only')),
  opened_at                   TIMESTAMPTZ,        -- NULL = Draft; set once, by a manual admin/owner/coordinator action
  closes_at                   TIMESTAMPTZ,        -- required before opening; Open->Closed is a live comparison, never a write
  published_at                TIMESTAMPTZ,        -- NULL until a manual Publish action
  coordinator_id              UUID REFERENCES members(id) ON DELETE SET NULL,
  created_by                  UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived                    BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_surveys_archived ON surveys(archived, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_surveys_coordinator ON surveys(coordinator_id);

-- The join between a survey and the Question Bank -- carries the per-survey
-- required flag and display order. A question can be required in one
-- survey and optional in another (each survey_items row is independent),
-- and the same question_id may appear in more than one survey.
CREATE TABLE IF NOT EXISTS survey_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id    UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question_id  UUID NOT NULL REFERENCES survey_questions(id) ON DELETE RESTRICT,
  sort_order   INT NOT NULL DEFAULT 0,
  required     BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (survey_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_survey_items_survey ON survey_items(survey_id, sort_order);

-- ON DELETE RESTRICT (not CASCADE) above is deliberate: a question that's
-- been attached to any survey can never be hard-deleted out from under
-- that survey's history -- archiving (survey_questions.archived) is the
-- only removal path, same "never delete" convention as every archived
-- column in this app.

ALTER TABLE hub_settings ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
INSERT INTO hub_settings (hub_type, enabled) VALUES ('surveys', false)
  ON CONFLICT (hub_type) DO NOTHING;

-- Seed the 'surveys' hub-owner set as a copy of whoever currently owns
-- 'committee' -- see the OWNERSHIP note above. A no-op, harmlessly, if
-- Committee has no owners seeded yet.
INSERT INTO space_owners (context_type, context_key, member_id)
SELECT 'hub', 'surveys', member_id
FROM space_owners
WHERE context_type = 'hub' AND context_key = 'committee'
ON CONFLICT (context_type, context_key, member_id) DO NOTHING;

ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_items ENABLE ROW LEVEL SECURITY;
-- No policies added deliberately, same convention as every other hub table
-- in this app -- every read/write goes through service-role API routes
-- (app/api/surveys/*), never a client-side/anon key.

-- ─── VERIFY ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hub_settings WHERE hub_type = 'surveys' AND enabled = false) THEN
    RAISE EXCEPTION 'FAIL: hub_settings row for surveys was not created, or not created disabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'surveys'
  ) THEN
    RAISE EXCEPTION 'FAIL: surveys was not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'survey_items'
  ) THEN
    RAISE EXCEPTION 'FAIL: survey_items was not created';
  END IF;
  RAISE NOTICE 'OK: surveys and survey_items created, hub_settings seeded disabled, surveys Owners seeded from committee (% row(s)).',
    (SELECT COUNT(*) FROM space_owners WHERE context_type = 'hub' AND context_key = 'surveys');
END $$;

COMMIT;
