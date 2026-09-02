-- 088_voting_hub.sql
--
-- Governance Voting hub -- Element_Happenings_Voting_Scope (Iain, through
-- v6, 2026-09-02). SAFE TO RUN ON LIVE PRODUCTION. Purely additive: 4 new
-- tables, one new column on hub_settings (defaults true, so every existing
-- hub is unaffected), one new hub_settings seed row (enabled=false --
-- hidden until Iain flips it on via the admin toggle).
--
-- ============================================================================
-- ANONYMITY DESIGN -- read this before touching either of these two tables
-- ============================================================================
-- Iain, 2026-09-02: "as long as we can account for who has voted, residents
-- and/or house, the choice voted for should always be anonymous." Two
-- structurally separate tables enforce this -- not a permission check on one
-- table, since a permission check doesn't survive direct DB access:
--
--   - voting_participation: WHO voted (member_id, event, cast_at). Fully
--     identifiable by design -- this is what enforces one-vote-per-resident
--     and is the only table the per-household duplicate check reads.
--   - voting_ballots: WHAT was voted (event, choice). No member_id, no FK
--     back to a person, NO TIMESTAMP. A timestamp would let a small
--     population's ballots be correlated against
--     voting_participation.cast_at by timing alone (flagged by Iain,
--     2026-09-02, re: ~175 residents -- closed by simply never storing it,
--     not by access control).
--
-- Nothing joins these two tables to each other. Do not add a shared key,
-- FK, or timestamp to voting_ballots without re-reading this comment and
-- getting Iain's explicit sign-off -- that's the whole point of the design.
--
-- Vote mode (per event): 'single' (exactly one choice) or 'multi' (up to
-- max_selections choices). A multi-select vote writes ONE INDEPENDENT
-- ballot row per selected choice, never one row holding a set -- a shared
-- submission id linking "these came from the same ballot" would itself be a
-- re-identification vector even with no member_id attached.
--
-- Lifecycle is NOT a stored status column -- the same class of bug this
-- project has already shipped fixes for twice this week (BUG-039; PR #70's
-- whole Sydney-date saga) is "a written status silently drifts from
-- reality." Draft/Open/Closed/Published is computed live from
-- opened_at/closes_at/published_at at read time, same pattern as
-- lib/date.js's isEventPast(). See lib/voting.js's computeVotingStatus().
--   Draft:     opened_at IS NULL
--   Open:      opened_at IS NOT NULL AND now() <  closes_at
--   Closed:    opened_at IS NOT NULL AND now() >= closes_at AND published_at IS NULL
--   Published: published_at IS NOT NULL
--
-- Self-voting: voting_choices.candidate_member_id (nullable -- most choices
-- aren't "a person", e.g. a yes/no on a facility) lets the vote-cast route
-- reject a choice that is the voter's own candidacy when
-- allow_self_vote=false. Checked at cast-time while identity is still known
-- server-side -- doesn't conflict with ballot anonymity, which only
-- concerns what's persisted afterward.
--
-- Permissions: create/open/publish an event = admin OR this hub's Owner
-- (lib/areaAuth.js's requireAdminOrAreaOwner(req, 'hub', 'voting') -- same
-- primitive every other hub uses). The Hub's own show/hide toggle
-- (hub_settings.enabled) is admin-only, not Owner -- Iain, 2026-09-02: "Hub
-- toggle admin-only, event creation via existing requireAdminOrAreaOwner."
-- Casting a vote = any eligible resident, no owner/admin concept.
--
-- Run in the Supabase SQL editor. Safe to run repeatedly.

BEGIN;

CREATE TABLE IF NOT EXISTS voting_events (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                       TEXT NOT NULL,
  description                 TEXT,
  eligibility_mode            TEXT NOT NULL DEFAULT 'per_resident'
                                 CHECK (eligibility_mode IN ('per_resident', 'per_household')),
  vote_mode                   TEXT NOT NULL DEFAULT 'single'
                                 CHECK (vote_mode IN ('single', 'multi')),
  max_selections              INT,                -- only meaningful when vote_mode = 'multi'
  allow_self_vote             BOOLEAN NOT NULL DEFAULT true,
  results_visibility_outcome  TEXT NOT NULL DEFAULT 'residents'
                                 CHECK (results_visibility_outcome IN ('residents', 'admin_only')),
  results_visibility_turnout  TEXT NOT NULL DEFAULT 'residents'
                                 CHECK (results_visibility_turnout IN ('residents', 'admin_only')),
  opened_at                   TIMESTAMPTZ,        -- NULL = Draft; set once, by a manual admin/owner action
  closes_at                   TIMESTAMPTZ,        -- required before opening; Open->Closed is a live comparison, never a write
  published_at                TIMESTAMPTZ,        -- NULL until a manual Publish action
  created_by                  UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived                    BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT voting_events_max_selections_only_for_multi
    CHECK (vote_mode = 'multi' OR max_selections IS NULL),
  CONSTRAINT voting_events_max_selections_positive
    CHECK (max_selections IS NULL OR max_selections >= 1)
);

CREATE TABLE IF NOT EXISTS voting_choices (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voting_event_id      UUID NOT NULL REFERENCES voting_events(id) ON DELETE CASCADE,
  label                TEXT NOT NULL,
  description          TEXT,
  candidate_member_id  UUID REFERENCES members(id) ON DELETE SET NULL,
  sort_order           INT NOT NULL DEFAULT 0
);

-- WHO voted -- identifiable by design. See anonymity design note above.
CREATE TABLE IF NOT EXISTS voting_participation (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voting_event_id  UUID NOT NULL REFERENCES voting_events(id) ON DELETE CASCADE,
  member_id        UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  cast_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (voting_event_id, member_id)
);

-- WHAT was voted -- deliberately NOT identifiable. See anonymity design
-- note above before adding any column here.
CREATE TABLE IF NOT EXISTS voting_ballots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voting_event_id  UUID NOT NULL REFERENCES voting_events(id) ON DELETE CASCADE,
  choice_id        UUID NOT NULL REFERENCES voting_choices(id) ON DELETE CASCADE
);

ALTER TABLE hub_settings ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;

INSERT INTO hub_settings (hub_type, enabled) VALUES ('voting', false)
  ON CONFLICT (hub_type) DO NOTHING;

ALTER TABLE voting_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE voting_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE voting_participation ENABLE ROW LEVEL SECURITY;
ALTER TABLE voting_ballots ENABLE ROW LEVEL SECURITY;
-- No policies added deliberately -- every read/write goes through
-- service-role API routes (app/api/voting/*), same convention as the rest
-- of this app. service_role bypasses RLS regardless of policy, and leaving
-- these four tables with zero public policies means a client-side/anon key
-- can never touch them even by accident, which matters more here than on a
-- typical table given what voting_ballots is for.

-- ─── VERIFY ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hub_settings WHERE hub_type = 'voting' AND enabled = false) THEN
    RAISE EXCEPTION 'FAIL: hub_settings row for voting was not created, or not created disabled';
  END IF;

  IF EXISTS (
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'voting_ballots' AND column_name IN ('member_id', 'created_at', 'cast_at', 'submission_id')
  ) THEN
    RAISE EXCEPTION 'FAIL: voting_ballots carries an identifying/timing column -- anonymity design violated';
  END IF;

  RAISE NOTICE 'OK: voting hub tables created, hub_settings seeded disabled, voting_ballots confirmed anonymous.';
END $$;

COMMIT;
