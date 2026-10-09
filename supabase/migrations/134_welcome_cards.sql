-- 134: Welcome cards & Sign-in Help (Iain, 2026-10-09).
-- Records when a welcome card (username + one-time password) was last
-- printed for a resident, and by whom, so committee can see who has been
-- given a card and who has since signed in.
-- Additive only. Safe to run before the code deploys. The card help line
-- lives in the existing settings table (key 'welcome_card_help'), no DDL.
-- No column GRANT to authenticated (migration 121): only the admin API
-- (service role) reads or writes these.

ALTER TABLE members ADD COLUMN IF NOT EXISTS welcome_card_printed_at timestamptz;
ALTER TABLE members ADD COLUMN IF NOT EXISTS welcome_card_printed_by uuid REFERENCES members(id) ON DELETE SET NULL;
