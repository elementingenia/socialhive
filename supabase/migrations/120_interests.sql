-- Migration 120: Interests / skills on profiles ("Ask me about...")
-- Backlog B3. Scope: Element_Happenings_Interests_on_Profiles_Scope_v2 +
-- _Scope_Answered.md (Iain, decisions 2026-10-02). Additive only -- safe to
-- run before the app code deploys, and the code must NOT deploy before it.
--
-- 1. interest_tags -- the shared chip list. Residents pick from approved
--    chips; anything else they type becomes a PENDING tag that an admin
--    approves, merges into an existing chip, or rejects (Admin > Interests).
--    status:
--      approved -- selectable, shown on Contacts cards, searchable
--      pending  -- a resident suggestion awaiting review; only the residents
--                  linked to it see it (on their own Profile)
--      rejected -- refused; links removed
--      merged   -- folded into merged_into; links moved there
--      retired  -- hidden everywhere, residents' picks kept for a restore
CREATE TABLE IF NOT EXISTS interest_tags (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label            TEXT NOT NULL CHECK (char_length(btrim(label)) BETWEEN 2 AND 40),
  status           TEXT NOT NULL DEFAULT 'approved'
                     CHECK (status IN ('approved','pending','rejected','merged','retired')),
  suggested_by     UUID REFERENCES members(id) ON DELETE SET NULL,
  merged_into      UUID REFERENCES interest_tags(id) ON DELETE SET NULL,
  reviewed_by      UUID REFERENCES members(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  -- Once-daily admin alert (cron interests-review-alert) stamps this so each
  -- suggestion is only announced once.
  admin_alerted_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One live chip per label, case/whitespace-insensitive. Rejected and merged
-- rows are history and don't block a later suggestion of the same words.
CREATE UNIQUE INDEX IF NOT EXISTS uq_interest_tags_live_label
  ON interest_tags (lower(regexp_replace(btrim(label), '\s+', ' ', 'g')))
  WHERE status IN ('approved','pending','retired');
CREATE INDEX IF NOT EXISTS idx_interest_tags_status ON interest_tags(status);

-- 2. member_interests -- which chips each resident has chosen (pending
--    suggestions included). Kept when a resident turns Private on; the app
--    hides them while Private (D2) and they reappear if Private is turned off.
CREATE TABLE IF NOT EXISTS member_interests (
  member_id  UUID NOT NULL REFERENCES members(id)       ON DELETE CASCADE,
  tag_id     UUID NOT NULL REFERENCES interest_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_member_interests_tag ON member_interests(tag_id);

-- Service-role only. All reads/writes go through app/api/interests,
-- app/api/admin/interests and the review-alert cron, which strip Private
-- residents before anything leaves the server. RLS on with NO policies, so
-- the browser client cannot read these tables directly (unlike members).
ALTER TABLE interest_tags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_interests ENABLE ROW LEVEL SECURITY;

-- 3. Starter list (approved by Iain 2026-10-02).
INSERT INTO interest_tags (label, status)
SELECT v.label, 'approved'
FROM (VALUES
  ('Computers and phones'), ('Gardening'), ('Cooking'), ('Baking'),
  ('Sewing and craft'), ('Knitting'), ('Woodwork and DIY'), ('Bridge'),
  ('Cards and board games'), ('Golf'), ('Bowls'), ('Fishing'), ('Boating'),
  ('Photography'), ('Music'), ('Book reading'), ('History'), ('Travel'),
  ('Walking'), ('Pets')
) AS v(label)
WHERE NOT EXISTS (
  SELECT 1 FROM interest_tags t
  WHERE lower(btrim(t.label)) = lower(v.label)
    AND t.status IN ('approved','pending','retired')
);
