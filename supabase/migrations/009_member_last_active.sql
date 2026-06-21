ALTER TABLE members ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Backfill existing members so they don't get immediately timed out
UPDATE members SET last_active_at = NOW() WHERE last_active_at IS NULL;
