-- Migration 126: Propose a group / club (backlog B1).
-- Decisions: claude/Element_Happenings_Propose_a_Group_Scope_Answered.md
-- (Iain, 2026-10-04). Additive only -- safe to run before the app code
-- deploys, and the code must NOT deploy before it (it reads these tables).
--
-- Flow: a resident proposes a group -> status 'pending' (admins only see it)
-- -> an admin approves -> 'live' (every resident sees it and can tap
-- "I'd join", one per resident) -> once supporters reach the threshold
-- (settings.group_proposal_threshold, default 5) admins are alerted and
-- create the club in one tap -> 'created' (club_id set, proposer = first
-- Owner, supporters auto-joined). A live proposal that hasn't been turned
-- into a club 60 days after it went live is treated as expired by the app
-- (computed from live_at -- no cron, no status flip needed).
CREATE TABLE IF NOT EXISTS group_proposals (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 3 AND 60),
  description          TEXT CHECK (description IS NULL OR char_length(description) <= 500),
  proposed_by          UUID REFERENCES members(id) ON DELETE SET NULL,
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','live','declined','created','withdrawn')),
  decline_reason       TEXT,
  reviewed_by          UUID REFERENCES members(id) ON DELETE SET NULL,
  reviewed_at          TIMESTAMPTZ,
  live_at              TIMESTAMPTZ,
  -- Stamped when admins are told this proposal has reached the threshold,
  -- so the alert fires once.
  threshold_alerted_at TIMESTAMPTZ,
  club_id              UUID REFERENCES clubs(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_group_proposals_status ON group_proposals(status);

-- One "I'd join" per resident per proposal (decision 1). The proposer is
-- added as the first supporter when they submit.
CREATE TABLE IF NOT EXISTS group_proposal_supporters (
  proposal_id UUID NOT NULL REFERENCES group_proposals(id) ON DELETE CASCADE,
  member_id   UUID NOT NULL REFERENCES members(id)         ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_group_proposal_supporters_member ON group_proposal_supporters(member_id);

-- Service-role only: all access goes through app/api/group-proposals and
-- app/api/admin/group-proposals. RLS on with NO policies.
ALTER TABLE group_proposals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_proposal_supporters ENABLE ROW LEVEL SECURITY;

-- Threshold, admin-editable in Admin > Group Proposals (decision 1: start at 5).
INSERT INTO settings (key, value) VALUES ('group_proposal_threshold', '5')
ON CONFLICT (key) DO NOTHING;
