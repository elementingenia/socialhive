-- Migration 119: Weekly Digest audience (Admins only / Community wide)
-- Iain, 2026-10-02: "distribution option - Community wide/Admins only switch
-- to allow us to keep it in-house to start and open up to community later".
-- Additive. Only the 'weekly_digest' hub_settings row uses this column.
-- Default 'admins' = in-house to start; an admin opens it up from
-- Admin > Occasional Activities > Weekly Digest.
ALTER TABLE hub_settings ADD COLUMN IF NOT EXISTS digest_audience TEXT NOT NULL DEFAULT 'admins';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hub_settings_digest_audience_check') THEN
    ALTER TABLE hub_settings ADD CONSTRAINT hub_settings_digest_audience_check
      CHECK (digest_audience IN ('admins', 'community'));
  END IF;
END $$;
COMMENT ON COLUMN hub_settings.digest_audience IS 'weekly_digest row only: who receives the Sunday digest -- admins (in-house trial) or community (every resident). Default admins.';
