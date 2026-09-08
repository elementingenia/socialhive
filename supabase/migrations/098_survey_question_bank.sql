-- 098_survey_question_bank.sql
--
-- Surveys hub, part 1 -- the reusable Question Bank. Social_Hive_Surveys_
-- Scope_Answered.md (Iain, 2026-09-08). SAFE TO RUN ON LIVE PRODUCTION.
-- Purely additive: 2 new tables, no existing table touched.
--
-- ============================================================================
-- WHAT THIS IS
-- ============================================================================
-- A question is authored ONCE and can be attached to more than one survey
-- (098_survey_question_bank.sql, this file) via a per-survey join
-- (099_surveys.sql's survey_items) that carries the per-survey required flag
-- and ordering -- the same question can be required in one survey and
-- optional in another. Never hard-delete a question that's been used in a
-- past survey -- archive it (survey_questions.archived), same "never
-- delete, mark archived" convention already used everywhere in this app
-- (clubs.archived, events.archived, committee_posts.archived).
--
-- V1 answer types (5, per Iain's scoping -- covers the large majority of
-- real survey use without trying to match every SurveyMonkey type on day
-- one): single_choice, multi_choice, rating (1-10, matching the existing
-- DVD/book rating convention -- not inventing a new scale), free_text,
-- yes_no. Choices only apply to single_choice/multi_choice -- see
-- survey_question_choices below.
--
-- Cross-survey trend analysis (comparing the same question_id's answers
-- across multiple surveys) is explicitly a V2 backlog item, not built here
-- -- Iain: "Let's have that V1 and V2 put in the feature backlog. KISS
-- formula initially making the V1 a robust simple mechanism." Question IDs
-- already stay stable long-term by this design (never hard-deleted), so V2
-- costs nothing extra to add later.
--
-- Permissions: author/edit/archive a question = admin OR the Surveys hub's
-- Owner (lib/areaAuth.js's requireAdminOrAreaOwner(req, 'hub', 'surveys') --
-- same primitive every other hub uses). See 099_surveys.sql for how the
-- Surveys Owner set itself is seeded.
--
-- Run in the Supabase SQL editor. Safe to run repeatedly.

BEGIN;

CREATE TABLE IF NOT EXISTS survey_questions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT NOT NULL
                 CHECK (type IN ('single_choice', 'multi_choice', 'rating', 'free_text', 'yes_no')),
  prompt       TEXT NOT NULL,
  helper_text  TEXT,                    -- optional description, RichEditor-authored same as every other description field in this app
  archived     BOOLEAN NOT NULL DEFAULT false,
  created_by   UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_survey_questions_archived ON survey_questions(archived, created_at DESC);

-- Only populated for single_choice/multi_choice questions. rating/free_text/
-- yes_no questions have zero rows here -- their answer shape is fixed
-- (1-10, free text, yes/no) and needs no per-question choice list.
CREATE TABLE IF NOT EXISTS survey_question_choices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  sort_order   INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_survey_question_choices_question ON survey_question_choices(question_id);

ALTER TABLE survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_question_choices ENABLE ROW LEVEL SECURITY;
-- No policies added deliberately, same convention as voting_events/
-- voting_choices (088_voting_hub.sql) and committee_posts (097_committee_
-- hub.sql) -- every read/write goes through service-role API routes
-- (app/api/survey-questions/*), never a client-side/anon key.

-- ─── VERIFY ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'survey_questions'
  ) THEN
    RAISE EXCEPTION 'FAIL: survey_questions was not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'survey_question_choices'
  ) THEN
    RAISE EXCEPTION 'FAIL: survey_question_choices was not created';
  END IF;
  RAISE NOTICE 'OK: survey_questions and survey_question_choices created.';
END $$;

COMMIT;
