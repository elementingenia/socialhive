-- 139_voting_coordinators_and_choice_images.sql
--
-- Voting changes (Iain, 2026-10-22):
--   1. An image per voting option (shown small on the ballot and results,
--      tap to enlarge). Editable while the vote is a Draft only, same lock
--      as the options themselves.
--   3. More than one coordinator per vote, "like events". At least one is
--      required (Iain's answer, matching events and Surveys).
--   (2, closing date required at create, is code-only -- closes_at already
--   exists from 088.)
--
-- voting_coordinators is a structural mirror of survey_coordinators (104)
-- and event_coordinators (014): any number of members, all equal, no
-- "primary", soft-replaced via replaced_at/replaced_by so history is kept.
-- voting_events.coordinator_id is NOT dropped (same precedent as 104 and
-- 014) -- existing values are copied across, and the code stops reading it
-- in the same change.
--
-- Additive only. The code that reads these MUST NOT deploy before this runs.

BEGIN;

CREATE TABLE IF NOT EXISTS voting_coordinators (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voting_event_id  UUID NOT NULL REFERENCES voting_events(id) ON DELETE CASCADE,
  member_id        UUID NOT NULL REFERENCES members(id)       ON DELETE CASCADE,
  assigned_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by      UUID REFERENCES members(id) ON DELETE SET NULL,
  replaced_at      TIMESTAMPTZ,
  replaced_by      UUID REFERENCES members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_voting_coordinators_event  ON voting_coordinators(voting_event_id);
CREATE INDEX IF NOT EXISTS idx_voting_coordinators_member ON voting_coordinators(member_id);
CREATE INDEX IF NOT EXISTS idx_voting_coordinators_active ON voting_coordinators(voting_event_id) WHERE replaced_at IS NULL;

-- Same as the other four voting tables (088): RLS on, no policies. Every
-- read/write goes through service-role routes (app/api/voting/*).
ALTER TABLE voting_coordinators ENABLE ROW LEVEL SECURITY;

-- Copy the existing single coordinator across.
INSERT INTO voting_coordinators (voting_event_id, member_id, assigned_at)
SELECT ve.id, ve.coordinator_id, COALESCE(ve.created_at, now())
FROM voting_events ve
WHERE ve.coordinator_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM voting_coordinators vc
    WHERE vc.voting_event_id = ve.id AND vc.member_id = ve.coordinator_id AND vc.replaced_at IS NULL
  );

-- Option image (public URL in the event-images bucket, voting/choices/ path).
ALTER TABLE voting_choices ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ── VERIFY ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'voting_coordinators') THEN
    RAISE EXCEPTION '139: voting_coordinators was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'voting_choices' AND column_name = 'image_url') THEN
    RAISE EXCEPTION '139: voting_choices.image_url was not created';
  END IF;
  IF (SELECT count(*) FROM voting_events WHERE coordinator_id IS NOT NULL)
     > (SELECT count(DISTINCT voting_event_id) FROM voting_coordinators WHERE replaced_at IS NULL) THEN
    RAISE EXCEPTION '139: not every existing coordinator was copied';
  END IF;
END $$;

COMMIT;
