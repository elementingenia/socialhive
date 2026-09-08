-- 100_survey_responses.sql
--
-- Surveys hub, part 3 -- responses. Social_Hive_Surveys_Scope_Answered.md
-- (Iain, 2026-09-08). SAFE TO RUN ON LIVE PRODUCTION. Purely additive: 2
-- new tables, no existing table touched.
--
-- ============================================================================
-- ANONYMITY -- deliberately NOT the same guarantee as Voting. Read this
-- before touching either table below.
-- ============================================================================
-- Voting's anonymity (088_voting_hub.sql) is STRUCTURAL: WHO voted and WHAT
-- was voted live in two tables that are never joined, so nobody -- not even
-- an admin with direct DB access -- can recover who cast a given ballot.
--
-- Surveys' "anonymous" toggle (surveys.anonymous, 099_surveys.sql) is a
-- DIFFERENT, WEAKER guarantee, by Iain's explicit design (2026-09-08): "The
-- anonymity remains in tact for the general non admin/owner users, so it
-- only applies for the Owner/Admins to see who responded. The reasoning
-- here is that responders may well add commentary requiring clarification
-- and/or direct response." So:
--
--   - survey_responses carries member_id ALWAYS, on every row, whether or
--     not the survey is marked anonymous. There is no structural
--     anonymity split here -- this is a single, ordinary,
--     identified-by-design table.
--   - The `anonymous` flag on surveys is a DISPLAY-level mask only,
--     enforced in application code (app/api/surveys/[id]/results,
--     app/api/surveys/[id]/respond), not the database: it hides `member_id`
--     from the API response for anyone who is NOT this survey's
--     Coordinator (per Change Request #3 -- see 099_surveys.sql's RESULTS
--     VISIBILITY note -- Coordinator, not "any Admin/Owner"). A resident
--     never sees who answered what, anonymous or not; the Coordinator
--     always can.
--
-- DO NOT read this as "the same as Voting." If a future change tries to
-- make Surveys' anonymity structural (splitting WHO from WHAT the way
-- voting_participation/voting_ballots do), that is a real schema change,
-- not a toggle -- get Iain's explicit sign-off first, same as the warning
-- at the top of 088_voting_hub.sql.
--
-- ============================================================================
-- SAVE-AND-RESUME -- the one genuinely new response mechanic here
-- ============================================================================
-- Voting is a single atomic choice with nothing to save mid-way. A survey
-- can have many questions, and Iain wants a resident who starts but doesn't
-- finish in one sitting to be able to pick up where they left off: "I
-- suspect we should have a save option for a resident who starts but does
-- not complete in one go." survey_responses.submitted_at is the switch:
-- NULL = still a draft (editable, answers can keep changing), NOT NULL =
-- final and locked. Once submitted_at is set, that's it -- one-shot, no
-- editing after, matching Voting's one-shot model exactly ("I think once
-- submitted that's it," Iain 2026-09-08). One row per (survey_id,
-- member_id) covers both the in-progress draft and, once submitted, the
-- final response -- there is never a second row to reconcile.
--
-- Permissions: see 099_surveys.sql. Responding = any eligible resident, one
-- draft-then-submit response per survey (per_resident) or per household
-- (per_household, mirroring Voting's isEligibleToVote/
-- householdAlreadyVoted pattern in lib/voting.js -- adapted for
-- lib/surveys.js since, unlike Voting, this table already carries
-- member_id directly and needs no separate participation table to check
-- against).
--
-- Run in the Supabase SQL editor. Safe to run repeatedly.

BEGIN;

CREATE TABLE IF NOT EXISTS survey_responses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id     UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  member_id     UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at  TIMESTAMPTZ,          -- NULL = draft/in-progress, resumable; set once, final, one-shot
  UNIQUE (survey_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey ON survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_submitted ON survey_responses(survey_id, submitted_at);

CREATE TABLE IF NOT EXISTS survey_answers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id   UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  question_id   UUID NOT NULL REFERENCES survey_questions(id) ON DELETE RESTRICT,
  -- Exactly one of these four is populated, per the question's own type
  -- (validated in application code, same convention as
  -- lib/voting.js's validateBallotSelection -- not a DB CHECK, since a
  -- CHECK constraint can't join back to survey_questions.type):
  choice_id     UUID REFERENCES survey_question_choices(id) ON DELETE RESTRICT,  -- single_choice: one row; multi_choice: one row per selected choice
  rating_value  INT CHECK (rating_value IS NULL OR (rating_value BETWEEN 1 AND 10)),
  free_text     TEXT,
  yes_no        BOOLEAN
);
CREATE INDEX IF NOT EXISTS idx_survey_answers_response ON survey_answers(response_id);
CREATE INDEX IF NOT EXISTS idx_survey_answers_question ON survey_answers(question_id);
-- A non-choice answer (rating/free_text/yes_no) gets at most one row per
-- (response, question) -- re-saving overwrites via UPSERT in the API, never
-- inserts a second row. A choice answer gets one row per SELECTED choice
-- (multi_choice can have several), never a duplicate of the same choice
-- twice. Postgres treats NULLs as distinct in a plain UNIQUE constraint, so
-- these are two partial unique indexes rather than one composite unique
-- constraint.
CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_answers_unique_non_choice
  ON survey_answers(response_id, question_id) WHERE choice_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_answers_unique_choice
  ON survey_answers(response_id, question_id, choice_id) WHERE choice_id IS NOT NULL;

-- ON DELETE RESTRICT on question_id/choice_id above (not CASCADE), same
-- reasoning as survey_items in 099_surveys.sql: a question or choice that's
-- ever been answered can never be hard-deleted out from under that answer
-- history -- archiving is the only removal path.

ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_answers ENABLE ROW LEVEL SECURITY;
-- No policies added deliberately, same convention as every other hub table
-- in this app -- every read/write goes through service-role API routes
-- (app/api/surveys/[id]/respond, app/api/surveys/[id]/results), never a
-- client-side/anon key. This matters more here than on a typical table:
-- survey_responses.member_id is exactly the identity the `anonymous` flag
-- is meant to keep away from non-Coordinator viewers, and that's an
-- application-layer mask (see the ANONYMITY note above), not RLS -- a
-- client-side/anon key must never be able to query this table directly at
-- all, or the mask would be trivially bypassable.

-- ─── VERIFY ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'survey_responses'
  ) THEN
    RAISE EXCEPTION 'FAIL: survey_responses was not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'survey_answers'
  ) THEN
    RAISE EXCEPTION 'FAIL: survey_answers was not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'survey_responses' AND column_name = 'submitted_at'
  ) THEN
    RAISE EXCEPTION 'FAIL: survey_responses.submitted_at (the draft/final switch) is missing';
  END IF;
  RAISE NOTICE 'OK: survey_responses and survey_answers created.';
END $$;

COMMIT;
