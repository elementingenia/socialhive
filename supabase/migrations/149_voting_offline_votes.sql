-- 149_voting_offline_votes.sql
--
-- Paper & proxy votes for the Voting hub (Iain, 2026-11-04). A resident can
-- give their vote to another by proxy, or vote on paper. Those votes are
-- cast off the app (the paper form is the legal record) but must be in the
-- published totals. Once a vote has CLOSED, its coordinator/admin/Owner
-- records them in one step:
--
--   1. WHO voted offline: a voting_participation row each, method='offline'.
--      This stops anyone being counted twice (app + paper), and keeps the
--      per-household rule. The existing UNIQUE(voting_event_id, member_id)
--      is the backstop.
--   2. WHAT was voted: per-option totals in voting_offline_counts. Totals
--      only -- no member_id, no timestamp -- same anonymity rule as
--      voting_ballots (see 088). The person entering them already knows
--      each choice from the paper forms; the database never links them.
--
-- record_offline_votes() replaces the whole offline set in ONE transaction
-- (so a half-saved state can't happen), and refuses once results are
-- published.
--
-- SAFE TO RUN ON LIVE PRODUCTION. Additive: one column pair on
-- voting_participation (existing rows default to 'app'), three nullable
-- columns on voting_events, one new table, one function. Grants per Coding
-- Standard #10: service_role only, like every other voting table.
-- Safe to run repeatedly.

BEGIN;

ALTER TABLE voting_participation
  ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'app';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'voting_participation_method_check') THEN
    ALTER TABLE voting_participation
      ADD CONSTRAINT voting_participation_method_check CHECK (method IN ('app', 'offline'));
  END IF;
END $$;
ALTER TABLE voting_participation
  ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES members(id) ON DELETE SET NULL;

ALTER TABLE voting_events ADD COLUMN IF NOT EXISTS offline_note TEXT;
ALTER TABLE voting_events ADD COLUMN IF NOT EXISTS offline_recorded_by UUID REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE voting_events ADD COLUMN IF NOT EXISTS offline_recorded_at TIMESTAMPTZ;

-- Totals only. Do not add member_id or a timestamp here (see 088).
CREATE TABLE IF NOT EXISTS voting_offline_counts (
  voting_event_id  UUID NOT NULL REFERENCES voting_events(id) ON DELETE CASCADE,
  choice_id        UUID NOT NULL REFERENCES voting_choices(id) ON DELETE CASCADE,
  votes            INT  NOT NULL CHECK (votes >= 0),
  PRIMARY KEY (voting_event_id, choice_id)
);

ALTER TABLE voting_offline_counts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voting_offline_counts TO service_role;
REVOKE ALL ON public.voting_offline_counts FROM anon, authenticated;

-- Replace this vote's offline set atomically. The API route validates the
-- submission first (lib/voting.js validateOfflineVotes); this function is
-- the transactional write plus a few hard guards of its own.
--   p_counts: [{ "choice_id": "...", "votes": 3 }, ...]
CREATE OR REPLACE FUNCTION public.record_offline_votes(
  p_event_id   UUID,
  p_member_ids UUID[],
  p_counts     JSONB,
  p_note       TEXT,
  p_by         UUID
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_published TIMESTAMPTZ;
BEGIN
  SELECT published_at INTO v_published FROM voting_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voting event not found';
  END IF;
  IF v_published IS NOT NULL THEN
    RAISE EXCEPTION 'Results are already published -- offline votes can no longer be changed';
  END IF;

  DELETE FROM voting_participation WHERE voting_event_id = p_event_id AND method = 'offline';
  DELETE FROM voting_offline_counts WHERE voting_event_id = p_event_id;

  -- A resident who voted in the app hits the UNIQUE constraint here and the
  -- whole transaction rolls back.
  INSERT INTO voting_participation (voting_event_id, member_id, method, recorded_by)
  SELECT p_event_id, m, 'offline', p_by FROM unnest(COALESCE(p_member_ids, '{}'::uuid[])) AS m;

  INSERT INTO voting_offline_counts (voting_event_id, choice_id, votes)
  SELECT p_event_id, (c->>'choice_id')::uuid, (c->>'votes')::int
  FROM jsonb_array_elements(COALESCE(p_counts, '[]'::jsonb)) AS c
  WHERE (c->>'votes')::int > 0;

  -- Every choice must belong to this vote.
  IF EXISTS (
    SELECT 1 FROM voting_offline_counts oc
    LEFT JOIN voting_choices vc ON vc.id = oc.choice_id AND vc.voting_event_id = p_event_id
    WHERE oc.voting_event_id = p_event_id AND vc.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Offline totals reference an option that is not on this vote';
  END IF;

  UPDATE voting_events
  SET offline_note = NULLIF(btrim(COALESCE(p_note, '')), ''),
      offline_recorded_by = p_by,
      offline_recorded_at = now()
  WHERE id = p_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_offline_votes(UUID, UUID[], JSONB, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_offline_votes(UUID, UUID[], JSONB, TEXT, UUID) TO service_role;

-- ─── VERIFY ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT has_table_privilege('service_role', 'public.voting_offline_counts', 'SELECT, INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION '149: service_role is missing privileges on voting_offline_counts';
  END IF;
  IF has_table_privilege('anon', 'public.voting_offline_counts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.voting_offline_counts', 'SELECT') THEN
    RAISE EXCEPTION '149: anon/authenticated should have no access to voting_offline_counts';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'voting_offline_counts' AND column_name IN ('member_id', 'created_at', 'cast_at')
  ) THEN
    RAISE EXCEPTION '149: voting_offline_counts carries an identifying/timing column';
  END IF;
  IF EXISTS (SELECT 1 FROM voting_participation WHERE method IS DISTINCT FROM 'app') THEN
    RAISE EXCEPTION '149: existing participation rows should all be method=app';
  END IF;
  RAISE NOTICE 'OK: offline votes ready.';
END $$;

COMMIT;
