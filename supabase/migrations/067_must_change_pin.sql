-- 067_must_change_pin.sql
--
-- Force a password change on first login for accounts an ADMIN created.
--
-- WHY. Until now the only way into the app was self-registration, where the
-- resident picks their own password, so there was never a credential handed
-- over by a third party. Creating ~100 accounts for residents changes that: an
-- admin generates a PIN, writes it on a slip of paper, and hands it over. That
-- PIN is then known to at least two people, sits on paper indefinitely, and
-- plenty of residents will never think to change it.
--
-- This flag makes the change compulsory rather than advisory: the resident
-- cannot use the app until they have set a password only they know.
--
-- Deliberately DEFAULT false so it applies only where it should:
--   - self-registration        -> false (they chose the password themselves)
--   - admin create_account     -> true
--   - admin reset_pin          -> true  (same situation: a PIN was handed over)
--   - change-password success  -> cleared back to false
--
-- Note members.pin is stored in plaintext (pre-existing: login compares it
-- directly). This flag reduces how long a handed-over PIN stays valid; it does
-- not address the plaintext storage, which is a separate piece of work.
--
-- Purely additive. Safe to run before the code deploys: nothing reads the
-- column until then, and the default means no existing account is affected.
--
-- Run in the Supabase SQL editor (DDL cannot be applied over the REST API).

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS must_change_pin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN members.must_change_pin IS
  'True when this account''s password was set by someone other than the member '
  '(admin-created account, or an admin PIN reset) and has not yet been changed. '
  'The login flow blocks entry until the member sets their own password, then '
  'clears this. Never set true for a self-registered account - they chose their '
  'own password, so there is nothing to force.';

-- Existing accounts are left alone on purpose. The 33 current members either
-- registered themselves or have been using the app for weeks; retro-forcing a
-- change on them would lock people out of a system they are mid-way through
-- testing. Only accounts created from here on are affected.


-- ─── VERIFY ─────────────────────────────────────────────────────────────────
--   SELECT must_change_pin, count(*) FROM members GROUP BY 1;
-- Expect: false = every existing member, true = 0.
