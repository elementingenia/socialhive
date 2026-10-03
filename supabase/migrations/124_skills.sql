-- Migration 124: Skills ("I can help with") alongside Interests
-- Backlog B7. Scope: Google Doc Element_Happenings_Skills_Scope_v1 +
-- claude/Element_Happenings_Skills_Scope_Answered.md (Iain, 2026-10-03).
-- Additive only -- safe to run before the app code deploys, and the code
-- must NOT deploy before it (it selects the new columns).
--
-- S1: same engine as Interests. A chip is either an interest ("Ask me
-- about") or a skill ("I can help with"); admins can switch a chip between
-- the two in Admin > Interests & Skills.

-- 1. kind on interest_tags. Every existing chip stays an interest.
ALTER TABLE interest_tags ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'interest';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interest_tags_kind_check') THEN
    ALTER TABLE interest_tags ADD CONSTRAINT interest_tags_kind_check CHECK (kind IN ('interest','skill'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_interest_tags_kind ON interest_tags(kind);

-- One live chip per label PER KIND (was: per label), so "Photography" can be
-- both an interest and a skill.
DROP INDEX IF EXISTS uq_interest_tags_live_label;
CREATE UNIQUE INDEX IF NOT EXISTS uq_interest_tags_live_label_kind
  ON interest_tags (kind, lower(regexp_replace(btrim(label), '\s+', ' ', 'g')))
  WHERE status IN ('approved','pending','retired');

-- 2. S2: optional short note per skill pick ("Small jobs only, not
-- electrical"). Used for skills only; the app ignores it on interests.
ALTER TABLE member_interests ADD COLUMN IF NOT EXISTS note TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_interests_note_len') THEN
    ALTER TABLE member_interests ADD CONSTRAINT member_interests_note_len
      CHECK (note IS NULL OR char_length(note) <= 80);
  END IF;
END $$;

-- RLS unchanged: both tables stay server-only (enabled, no policies).

-- 3. Starter skills (Iain, 2026-10-03). Licensed trades (electrical,
-- plumbing, gas) and advice (financial, legal, medical) deliberately left
-- out (S3); lifts are covered by Personal Vehicle Offers.
INSERT INTO interest_tags (label, status, kind)
SELECT v.label, 'approved', 'skill'
FROM (VALUES
  ('Computer and phone help'), ('Small handyman jobs'), ('Gardening help'),
  ('Sewing and mending'), ('Pet minding'), ('Plant watering while you''re away'),
  ('Baking or cooking for events'), ('First aid (qualified)'),
  ('Help with forms and letters'), ('Translation'), ('Tutoring'),
  ('Music lessons'), ('Bike repairs'), ('Photography for events')
) AS v(label)
WHERE NOT EXISTS (
  SELECT 1 FROM interest_tags t
  WHERE t.kind = 'skill'
    AND lower(btrim(t.label)) = lower(v.label)
    AND t.status IN ('approved','pending','retired')
);
