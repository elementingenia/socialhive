-- 132: PIN hashing + login lockout (Iain, 2026-10-09).
--
-- * pin_hash: salted scrypt hash of the PIN (lib/pinHash.js). The app
--   stops writing plain-text members.pin; rows still holding one are
--   hashed on that member's next sign-in, or by the one-off backfill run
--   after deploy. A later migration drops members.pin once it is empty.
-- * failed_pin_attempts / pin_locked_until: 5 wrong PINs locks the
--   account for 15 minutes (lib/pinLockout.js).
--
-- Additive. Must run BEFORE the code deploys -- the login route selects
-- these columns.

ALTER TABLE members ADD COLUMN IF NOT EXISTS pin_hash text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS failed_pin_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN IF NOT EXISTS pin_locked_until timestamptz;

-- New code writes pin = NULL once a PIN is hashed.
ALTER TABLE members ALTER COLUMN pin DROP NOT NULL;

-- The browser must never read any of these. Migration 121 granted SELECT
-- by column list, so new columns are already hidden; this makes it explicit.
REVOKE SELECT (pin_hash, failed_pin_attempts, pin_locked_until) ON members FROM anon, authenticated;
