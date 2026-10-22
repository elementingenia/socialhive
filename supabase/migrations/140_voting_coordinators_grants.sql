-- 140_voting_coordinators_grants.sql
--
-- Coding Standard #10 (2026-10-22): every new table in public must GRANT
-- Data API access in its own migration, because from 30 Oct 2026 Supabase
-- stops auto-granting it on existing projects. 139 created
-- voting_coordinators without explicit grants; it works today only because
-- it was created before the cutover. This makes the grants explicit so a
-- rebuild after 30 Oct produces a working table.
--
-- voting_coordinators is service-role only, like the other voting tables
-- (RLS on, no policies; every read/write goes through app/api/voting/*).
-- So: service_role gets select/insert/update/delete; anon and authenticated
-- get nothing. The revoke changes no behaviour today (RLS already blocks
-- them) -- it just makes the table's access match its intent.
--
-- Safe to run repeatedly.

BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voting_coordinators TO service_role;
REVOKE ALL ON public.voting_coordinators FROM anon, authenticated;

DO $$
BEGIN
  IF NOT has_table_privilege('service_role', 'public.voting_coordinators', 'SELECT, INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION '140: service_role is missing privileges on voting_coordinators';
  END IF;
  IF has_table_privilege('anon', 'public.voting_coordinators', 'SELECT')
     OR has_table_privilege('authenticated', 'public.voting_coordinators', 'SELECT') THEN
    RAISE EXCEPTION '140: anon/authenticated should have no access to voting_coordinators';
  END IF;
END $$;

COMMIT;
