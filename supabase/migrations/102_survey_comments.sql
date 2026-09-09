-- 102_survey_comments.sql
--
-- Surveys fixes batch (Iain, 2026-09-08/09, raised after Surveys shipped but
-- before it went live -- hub_settings.surveys.enabled is still false, see
-- Social_Hive_Surveys_Scope_Answered.md's Release gate). SAFE TO RUN ON LIVE
-- PRODUCTION. Purely additive: 2 new nullable/defaulted columns, no existing
-- table touched otherwise. Part of a three-item batch; the other two
-- (question numbering/reorder, anonymity gating the coordinator too) are
-- code-only, no schema change needed for those.
--
-- ============================================================================
-- PER-QUESTION OPTIONAL COMMENT
-- ============================================================================
-- Iain: every question type except free_text (which is already a comment
-- field, no need for a second one) should be able to optionally carry a
-- free-text comment alongside the structured answer -- e.g. "3/10, and
-- here's why". This is a per-SURVEY-ATTACHMENT toggle, not a property of the
-- question itself in the bank: the same bank question can allow a comment
-- in one survey and not another, same reasoning as `required` already being
-- on survey_items rather than survey_questions.
--
-- survey_answers.comment_text is nullable and lives on the SAME row as the
-- question's own answer value for single_choice/rating/yes_no (each of
-- those already writes exactly one row per (response_id, question_id)).
-- multi_choice is the one case with no single "the" row (one row per
-- selected choice) -- for that type the API writes a separate,
-- comment-only row: choice_id/rating_value/free_text/yes_no all NULL,
-- comment_text set. That extra row is legal under the existing
-- idx_survey_answers_unique_non_choice partial index (100_survey_
-- responses.sql) -- (response_id, question_id) WHERE choice_id IS NULL --
-- because a multi_choice question never otherwise writes a choice_id-NULL
-- row, so there's no collision. See lib/surveys.js and
-- app/api/surveys/[id]/respond/route.js for exactly how each type's row(s)
-- get built.
-- Run in the Supabase SQL editor. Safe to run repeatedly.

BEGIN;

ALTER TABLE survey_items   ADD COLUMN IF NOT EXISTS allow_comment BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE survey_answers ADD COLUMN IF NOT EXISTS comment_text  TEXT;

-- ─── VERIFY ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'survey_items' AND column_name = 'allow_comment'
  ) THEN
    RAISE EXCEPTION 'FAIL: survey_items.allow_comment was not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'survey_answers' AND column_name = 'comment_text'
  ) THEN
    RAISE EXCEPTION 'FAIL: survey_answers.comment_text was not created';
  END IF;
  RAISE NOTICE 'OK: survey_items.allow_comment and survey_answers.comment_text created.';
END $$;

COMMIT;
