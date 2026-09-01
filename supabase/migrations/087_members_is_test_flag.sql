-- Migration 087: is_test flag on members
--
-- Mirrors migration 036's events.is_test exactly, applied to the same
-- problem on the members side. Iain, 2026-09-02: "I need a solution for
-- hiding the TestBot user account from regular UI for users. It looks
-- ugly and has already raised concerns from the community."
--
-- Root cause, confirmed by reading the actual query (not assumed):
-- app/(app)/info/contacts/page.js's load() fetches every status='active'
-- member with no further filter, and renders every one of them as a
-- resident Contact card. testbot (status=active, is_admin=true,
-- hide_name=true, house_number=null, phone=null) has therefore always
-- shown up there as a "Resident" card with no house number and no phone
-- -- a mystery entry with no visible explanation, exactly the kind of
-- thing that would raise concern from residents browsing their own
-- community directory. Separately, /api/questions/targets' admin
-- catch-all (.eq('is_admin', true)) also picks testbot up as a possible
-- "Ask an Admin" recipient, for the same reason.
--
-- This column lets both of those resident-facing queries exclude test
-- fixture accounts outright, while everything else about the account is
-- completely unaffected: it's still fully usable by CI/E2E
-- (tests/e2e/auth.setup.js), still protected from deletion by migration
-- 033's trigger, and Admin > Accounts / any admin-only member picker
-- still shows it (with a new "Test Account" badge on Info > Contacts
-- specifically, so an admin who does see it there isn't left wondering
-- what it is).

ALTER TABLE members ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

UPDATE members
SET is_test = true
WHERE LOWER(username) = 'testbot';
