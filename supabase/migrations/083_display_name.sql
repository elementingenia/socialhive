-- 083_display_name.sql
--
-- Display Name (change request log #1, Iain 2026-08-14). Residents can set
-- an optional preferred name shown instead of their Real Name in social
-- contexts (Attendees, rosters, recipient lists). Real Name (`name`) stays
-- mandatory and unaffected -- it already is NOT NULL, since 001_initial_schema.
--
-- Design, revised same day per Iain's explicit call: display_name defaults
-- to Real Name at creation (both register/route.js and admin/accounts/
-- route.js now insert display_name = name) and is NOT NULL going forward,
-- same as name itself. This means every render site just shows
-- display_name directly -- no "IF display_name THEN x ELSE name" fallback
-- logic anywhere (Iain: avoid that pattern entirely). It only diverges
-- from Real Name once a resident explicitly edits it in Profile, where the
-- API enforces the same "at least 3 letters, blank not allowed" rule this
-- migration's NOT NULL enforces at the DB layer.
--
-- hide_name ("Private") masking is UNCHANGED by any of this -- when masked,
-- the viewer still sees the literal 'Resident' placeholder regardless of
-- display_name. See lib/memberName.js.
--
-- Backfill-then-constrain, not a bare NOT NULL -- every existing member
-- becomes their own display_name (their current Real Name) on this run,
-- so nobody goes from "has a real name" to "has a null display name" the
-- moment this lands.

ALTER TABLE members ADD COLUMN IF NOT EXISTS display_name TEXT;
UPDATE members SET display_name = name WHERE display_name IS NULL;
ALTER TABLE members ALTER COLUMN display_name SET NOT NULL;
