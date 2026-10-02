-- Migration 118: Weekly Digest + Invite a Neighbour
-- Scope: Element_Happenings_Weekly_Digest_and_Invite_Scope_v1 (Iain, decisions
-- 2026-10-02). Additive only. Run BEFORE the app code deploys -- the new
-- routes read members.weekly_digest and event_invites.
--
-- 1. members.weekly_digest -- the resident's own on/off switch for the Sunday
--    digest. NOT NULL DEFAULT true, so every EXISTING account is switched on
--    by this migration and every NEW account is created switched on (Iain:
--    "on by default for all existing and new account creation").
ALTER TABLE members ADD COLUMN IF NOT EXISTS weekly_digest BOOLEAN NOT NULL DEFAULT true;
COMMENT ON COLUMN members.weekly_digest IS 'Receives the Sunday "This week at Element Happenings" digest. Default on; resident can switch off in Profile.';

-- 2. event_invites -- "Jan thinks you'd enjoy Trivia Night". One row per
--    invite. UNIQUE (event_id, to_member_id): a resident can only ever be
--    invited ONCE per event, by anyone -- the main spam guard. The per-sender
--    cap (10 per event) is enforced in app code (lib/eventInvites.js).
CREATE TABLE IF NOT EXISTS event_invites (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES events(id)  ON DELETE CASCADE,
  from_member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  to_member_id   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, to_member_id)
);
CREATE INDEX IF NOT EXISTS idx_event_invites_to     ON event_invites(to_member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_invites_sender ON event_invites(event_id, from_member_id);
-- Service-role only (all reads/writes go through app/api/events/invite and
-- app/api/digest) -- RLS on with no policies, same as other server-only tables.
ALTER TABLE event_invites ENABLE ROW LEVEL SECURITY;

-- 3. digest_runs -- one row per Sunday the digest was sent. The PRIMARY KEY
--    on the Sydney date is what makes a double-send impossible: the cron
--    inserts this row FIRST and only sends if the insert succeeded.
CREATE TABLE IF NOT EXISTS digest_runs (
  run_date   DATE PRIMARY KEY,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipients INT
);
ALTER TABLE digest_runs ENABLE ROW LEVEL SECURITY;

-- 4. Admin master switch (Iain, 2026-10-02: "There needs to be a way to turn
--    the digest on/off as an admin function"). Reuses hub_settings.enabled,
--    same as every other admin show/hide switch (PATCH /api/hub-settings
--    already restricts `enabled` to admins). Seeded OFF, so the first Sunday
--    send only happens once an admin deliberately turns it on from
--    Admin > Occasional Activities. Separate from each resident's own
--    members.weekly_digest preference above -- both must be on to receive it.
INSERT INTO hub_settings (hub_type, enabled) VALUES ('weekly_digest', false)
  ON CONFLICT (hub_type) DO NOTHING;
