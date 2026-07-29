-- 066_auth_email_decoupling.sql
--
-- Decouple the Supabase Auth email from members.username so a username can be
-- changed without orphaning the login.
--
-- THE PROBLEM THIS FIXES
-- Every auth path derived the Auth user's email from the username:
--     `${username}@thesocialhive.internal`
-- so renaming a member silently broke their ability to log in (the derived
-- email no longer matched the Auth user). That made `username` permanently
-- immutable, which in turn made a batch of badly-named accounts unfixable --
-- 14 live accounts whose username does not match the agreed
-- FirstName+LastInitial scheme, 5 of which hold real bookings and therefore
-- cannot simply be deleted and recreated (bookings.member_id is ON DELETE
-- CASCADE; deleting those 5 would destroy 28 bookings).
--
-- THE FIX
-- Store the Auth email explicitly. From here on it is an opaque, permanent
-- identifier that nothing derives and nobody edits. Usernames become ordinary
-- editable data.
--
-- SAFETY: the backfill sets auth_email to EXACTLY the value the code was
-- deriving until now, so after this migration every existing login continues
-- to work unchanged and nothing has to be re-issued. This migration on its own
-- changes no behaviour -- it is purely additive and safe to run before the
-- code that uses it deploys.
--
-- Run in the Supabase SQL editor (DDL cannot be applied over the REST API).

-- ─── 1. THE COLUMN ──────────────────────────────────────────────────────────
ALTER TABLE members ADD COLUMN IF NOT EXISTS auth_email TEXT;

COMMENT ON COLUMN members.auth_email IS
  'The Supabase Auth user''s email for this member. Opaque and permanent - it '
  'is NOT derived from username and must never be regenerated from one, or '
  'renaming a member orphans their login (the bug this column exists to fix). '
  'Existing rows were backfilled to the previously-derived value so no login '
  'changed. New accounts get <random-uuid>@thesocialhive.internal.';

-- ─── 2. BACKFILL TO THE CURRENTLY-DERIVED VALUE ─────────────────────────────
-- lower(username) matches what login/register/admin-accounts were building.
-- This is what makes the migration a no-op for every person already using the
-- app: their stored email is identical to the one that was being computed.
UPDATE members
   SET auth_email = lower(username) || '@thesocialhive.internal'
 WHERE auth_email IS NULL
   AND username IS NOT NULL;

-- ─── 3. UNIQUENESS ──────────────────────────────────────────────────────────
-- One Auth user per member. Partial so a members row may exist with no login
-- yet (auth_email NULL) -- that is a real state: app/api/auth/login/route.js
-- materialises the Auth user on first login, which is how pre-seeded roster
-- accounts are meant to work.
CREATE UNIQUE INDEX IF NOT EXISTS members_auth_email_unique
  ON members (lower(auth_email))
  WHERE auth_email IS NOT NULL;


-- ─── VERIFY ─────────────────────────────────────────────────────────────────
-- Expect: every active member has an auth_email, and it equals the old derived
-- value. Any row returned by the second query is a problem - investigate
-- before deploying the code change.
--
--   SELECT count(*) FILTER (WHERE auth_email IS NULL)  AS missing,
--          count(*)                                    AS total
--     FROM members WHERE status = 'active';
--
--   SELECT username, auth_email
--     FROM members
--    WHERE auth_email IS DISTINCT FROM lower(username) || '@thesocialhive.internal';
